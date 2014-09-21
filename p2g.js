// TODO
// x- Doc note on default metric resolution + report windows (and xFileFactor aggregation warning)
// x- expand pin.report into metrics per pin
//   ?- ignore disabled pins (mode -1)
// x- accept prefix (<pre[.]fix>.<troop_name>.<scout_name>)
// handle troop/scout add messages in stream (add to troops map)
// offline/online events entered with value of one, to be used with drawAsInfinite
//   other events to catch?
//   delete, delete-scout, troop/scout addition/rename
// replace console.log with proper log library, add log level to argparse opts
// filter out more event types: scout, available, backpacks, wifi
var pinoccio = require('pinoccio');
var graphite = require('graphite');
var async = require('async');
var argparse = require('argparse');
var sprintf = require('util').format;

var p_api_client, graphite_client, metric_prefix;
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
	parser.addArgument(
		[ '-p', '--prefix' ],
		{
			help: 'Metric prefix: PREFIX.<troop>.<scout>.<metric>',
			defaultValue: 'pinoccio'
		}
	);
	parsed_args = parser.parseArgs();
	p_api_client = pinoccio(parsed_args.token);
	graphite_client = graphite.createClient(parsed_args.graphite);
	metric_prefix = parsed_args.prefix;
	callback(); // we're done here
}


function sanitize_name(name) {
	return name.replace(/[^ A-Za-z0-9_\-]/g, '').replace(/\s+/g, '_');
}

function get_troops(callback) {
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
	var troop_keys = Object.keys(troops);
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
		function () {}
	  );

	if (callback) {
		callback();
	}
}

function handleAvailable(msg) {
    var knownTroop = troops.hasOwnProperty(msg.data.troop)
    if (!knownTroop) {
        get_troops();
    }

    var knownScout = knownTroop && troops[msg.data.troop].hasOwnProperty(msg.data.scout);
    if (!knownScout) {
        get_scouts();
    }
    return;
}

function deleteScout(msg) {
	var troop_id = msg.data.troop;
	var scout_id = msg.data.scout;
	var troop_name = troops[troop_id].name;
    var scout_name = troops[troop_id][scout_id];
    console.log(sprintf("Forgetting known scout %s in troop %s", scout_name, troop_name));
    delete troops[troop_id][scout_id];
    return;
}

function deleteTroop(msg) {
	var troop_id = msg.data.troop;
	var troop_name = troops[troop_id].name;
    console.log(sprintf("Forgetting known troop %s", troop_name));
    delete troops[troop_id];
    return;
}

function troopName(msg) {
    var troop_name = sanitize_name(msg.data.value);
    var current_troop_data = troops[msg.data.troop] || {};
    current_troop_data.name = troop_name;
    troops[msg.data.troop] = current_troop_data;
    console.log(sprintf("Learned troop named %s with id %d", troop_name, msg.data.troop));
    return;
}

// assuming we'll never get a scout-name msg without knowing the troop
function scoutName(msg) {
    var troop_name = troops[msg.data.troop].name;
    var scout_name = sanitize_name(msg.data.value);
    console.log(sprintf("Learned scout named %s in troop %s with id %d",
            scout_name, troop_name, msg.data.scout));
    troops[msg.data.troop][msg.data.scout] = scout_name;
    return;
}

function handleMetricMessage(msg) {
    var knownTroop = troops.hasOwnProperty(msg.data.troop)
    var knownScout = knownTroop && troops[msg.data.troop].hasOwnProperty(msg.data.scout);
    if (!knownScout) {
        console.log("Cannot handle message for unknown scout. Troop:", msg.data.troop, "Scout:", msg.data.scout, "Msg:",msg);
        return;
    }
    var troop_name = troops[msg.data.troop].name;
    var scout_name = troops[msg.data.troop][msg.data.scout];

	// Build prefix and metric builder
	var g_msg_prefix = [metric_prefix, troop_name, scout_name, msg.data.type].join('.');
	var graphite_msg = {};
	var prop_name; // Fucking Crockford
	function add_metric(name, value) {
		var metric_key = [g_msg_prefix, name].join('.');
		graphite_msg[metric_key] = value;
	}

	function addArrayMetric(prop_val, prop_ind, arr) {
		add_metric([prop_name, prop_ind].join('_'), prop_val);
	}

	for (prop_name in msg.data.value) {
		if (msg.data.value.hasOwnProperty(prop_name)) {
			// skip metadata
			if (prop_name === "_t" || prop_name === "type") {
				continue;
			}
			// if not a number
			if (!isFinite(msg.data.value[prop_name])) {
				// but an array, expand keys
				if (msg.data.value[prop_name] instanceof Array) {
					msg.data.value[prop_name].forEach(addArrayMetric);
				} else {
					continue;
				}
			} else { // 1-dimensional value
				add_metric(prop_name, msg.data.value[prop_name]);
			}
		}
	}

	if (Object.keys(graphite_msg).length === 0) {
		console.log("Empty metric from msg:", msg.data);
		return;
	}

	//console.log("Metric", graphite_msg)
	graphite_client.write(graphite_msg, msg.data.time, function onSend(err) {
		if (typeof err !== "undefined") {
			console.log("Error from graphite:", err);
		}
	});
}

function noOp() {
    return;
}

var typeHandlers = {
    'available': handleAvailable, 'delete': deleteTroop,
    'delete-scout': deleteScout, 'name': troopName, 'scout-name': scoutName,
    'scout-created': noOp, 'troop-created': noOp
    //'connection': scoutConnected
}

function handleEvent(msg) {
	var validMessage = msg.data.hasOwnProperty('troop')
	if (!validMessage) {
        console.log("Got message without troop:", msg.data);
		return;
	}

	if (!(msg.data.hasOwnProperty('type'))) {
		console.log("Got message without type: ", msg.data);
		return;
	}

    var msgHandler = typeHandlers[msg.data.type] || handleMetricMessage

    return msgHandler(msg);
}

function get_events() {
	var syncer = p_api_client.sync();
	syncer.on('data', function onData(data) {
		handleEvent(data);
	});
	syncer.on('error', function onErr(err) {
		console.log('sync error: ', err);
		syncer = null;
		//setTimeout(get_events, 60000);
		setTimeout(get_events, 6000);
	});
	syncer.on('end', function onEnd() {
		console.log('sync "end" error');
		syncer = null;
		//setTimeout(get_events, 60000);
		setTimeout(get_events, 6000);
	});
}

async.series([handle_args, get_troops, get_scouts], get_events);
