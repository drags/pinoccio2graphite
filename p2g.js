// Doc note on default metric resolution + report windows (and xFileFactor aggregation warning)
// x- expand pin.report into metrics per pin
//   ?- ignore disabled pins (mode -1)
// accept prefix (<pre[.]fix>.<troop_name>.<scout_name>)
// handle troop/scout add messages in stream (add to troops map)
// offline/online events entered with value of one, to be used with drawAsInfinite
//   other events to catch?
//   delete, delete-scout, troop/scout addition/rename
// replace console.log with proper log library, add log level to argparse opts
var pinoccio = require('pinoccio');
var graphite = require('graphite');
var async = require('async');
var argparse = require('argparse');
var sprintf = require('util').format;

var p_api_client, graphite_client;
var troops = {};

function handle_args(callback) {
	var parser = new argparse.ArgumentParser({
		version: "0.0.1",
		addHelp: true,
		description: "Pinoccio to Graphite"
	});
	var parsed_args;
	parser.addArgument(
		[ '-t', '--token' ],
		{
			help: 'Pinoccio API token',
			required: true
		}
	);
	parser.addArgument(
		[ '-g', '--graphite' ],
		{
			help: 'Address of Graphite host',
			required: true
		}
	);
	parsed_args = parser.parseArgs();
	p_api_client = pinoccio(parsed_args.token);
	graphite_client = graphite.createClient(parsed_args.graphite);
	callback(); // we're done here
}


function sanitize_name(name) {
	return name.replace(/[^ A-Za-z0-9_\-]/g, '').replace(/\s+/g, '_');
}

function get_troops(callback) {
	//console.log("Troops")
	p_api_client.rest({url: '/v1/troops'}, function onTroops(err, troop_data) {
		if (typeof err !== "undefined") {
			console.log("Error from pinoccio while getting troops:", err);
			process.exit(1);
		}
		troop_data.forEach(function eachTroop(troop, troop_ind, arr) {
			var troop_name = sanitize_name(troop.name);
			var current_troop_data = troops[troop.id] || {};
			current_troop_data.name = troop_name;
			troops[troop.id] = current_troop_data;
			console.log(sprintf("Learned troop named %s with id %d", troop_name, troop.id));
		});
		if (callback) {
			callback();
		}
	});
}

function get_scouts(callback) {
	//console.log("Scouts")
	var troop_keys = Object.keys(troops);
	//console.log("Got so many " + troop_keys.length)
	async.each(troop_keys, function eachParent(troop_id, cb) {
		p_api_client.rest({url: '/v1/' + troop_id + '/scouts'}, function onScouts(err, scout_data) {
			if (typeof err !== "undefined") {
				console.log("Error from pinoccio while getting scouts:", err);
				process.exit(1);
			}
			scout_data.forEach(function eachScout(scout, scout_ind, arr) {
				var troop_name = troops[troop_id].name;
				var scout_name = sanitize_name(scout.name);
				console.log(sprintf("Learned scout named %s in troop %s with id %d",
						scout_name, troop_name, scout.id));
				troops[troop_id][scout.id] = scout_name;
			});
			cb();
		});
	},
		//function () {console.log(troops)}
		function () {}
	  );

	if (callback) {
		callback();
	}
}

function handle_event(msg) {
	var validMessage = msg.data.hasOwnProperty('troop') && msg.data.hasOwnProperty('value');
	if (!validMessage) {
		return;
	}
	var msg_data = msg.data;
	var msg_time = msg_data.time;
	var msg_value = msg_data.value;

	//console.log("Got data", msg_data)

	var troop_id = msg_data.troop;
	var scout_id = msg_data.scout;
	var troop_name = troops[troop_id].name;
	var scout_name = troops[troop_id][scout_id];

	if (!(msg_data.hasOwnProperty('type'))) {
		console.log("Got message without type: ", msg_data);
		return;
	}

	if (msg_data.type === 'delete-scout') {
		console.log(sprintf("Forgetting known scout %s in troop %s", scout_name, troop_name));
		delete troops[troop_id][scout_id];
		return;
	}

	// If event type is "available", check if troop and scout are known, else repoll
	var knownScout = troops.hasOwnProperty(troop_id) && troops[troop_id].hasOwnProperty(scout_id);
	if (msg_data.type === 'available' && !knownScout) {
		get_troops();
		get_scouts();
		return;
	}

	// Build prefix and metric builder
	var g_msg_prefix = ['pinoccio', troop_name, scout_name, msg_data.type].join('.');
	var graphite_msg = {};
	var prop_name; // Fucking Crockford
	function add_metric(name, value) {
		var metric_key = [g_msg_prefix, name].join('.');
		graphite_msg[metric_key] = value;
	}

	function addArrayMetric(prop_val, prop_ind, arr) {
		add_metric([prop_name, prop_ind].join('_'), prop_val);
	}

	for (prop_name in msg_value) {
		if (msg_value.hasOwnProperty(prop_name)) {
			// skip metadata
			if (prop_name === "_t" || prop_name === "type") {
				continue;
			}
			// if not a number
			if (!isFinite(msg_value[prop_name])) {
				// but an array, expand keys
				if (msg_value[prop_name] instanceof Array) {
					msg_value[prop_name].forEach(addArrayMetric);
				} else {
					continue;
				}
			} else { // 1-dimensional value
				add_metric(prop_name, msg_data.value[prop_name]);
			}
		}
	}

	if (Object.keys(graphite_msg).length === 0) {
		console.log("Empty metric from msg:", msg_data);
		return;
	}

	//console.log("Metric", graphite_msg)
	graphite_client.write(graphite_msg, msg_time, function onSend(err) {
		if (typeof err !== "undefined") {
			console.log("Error from graphite:", err);
		}
	});
}

function get_events() {
	var syncer = p_api_client.sync();
	syncer.on('data', function onData(data) {
		handle_event(data);
	});
	syncer.on('error', function onErr(err) {
		console.log('sync error: ', err);
		syncer = null;
		//setTimeout(get_events, 60000);
		setTimeout(get_events, 6000);
	});
	syncer.on('end', function onEnd() {
		console.log("shouldn't end but depending on arguments it may");
		syncer = null;
		//setTimeout(get_events, 60000);
		setTimeout(get_events, 6000);
	});
}

async.series([handle_args, get_troops, get_scouts], get_events);
