// Doc note on default metric resolution + report windows (and xFileFactor aggregation warning)
// x- expand pin.report into metrics per pin
//   ?- ignore disabled pins (mode -1)
// accept prefix (<pre[.]fix>.<troop_name>.<scout_name>)
// handle troop/scout add messages in stream (add to troops map)
// offline/online events entered with value of one, to be used with drawAsInfinite
//   other events to catch?
var pinoccio = require('pinoccio'),
	graphite = require('graphite'),
	async = require('async'),
	argparse = require('argparse'),
	sprintf = require('util').format;

var p_api_client, graphite_client;
var troops = {}

function handle_args(callback) {
	parser = new argparse.ArgumentParser({
		version:"0.0.1",
		addHelp:true,
		description:"Pinoccio to Graphite"
	})
	parser.addArgument(
		[ '-t', '--token' ],
		{
			help: 'Pinoccio API token',
			required: true
		}
	)
	parser.addArgument(
		[ '-g', '--graphite' ],
		{
			help: 'Address of Graphite host',
			required: true
		}
	)
	parsed_args = parser.parseArgs()
	p_api_client = pinoccio(parsed_args.token)
	graphite_client = graphite.createClient(parsed_args.graphite)
	callback() // we're done here
}


function sanitize_name(name) {
	return name.replace(/[^ A-Za-z0-9_-]/g, '').replace(/\s+/g, '_')
}

function get_troops(callback) {
	//console.log("Troops")
	p_api_client.rest({url:'/v1/troops'}, function(err, troop_data) {
		for (var i=0; i < troop_data.length; i++) {
			troop_id = troop_data[i]['id'];
			troop_name = sanitize_name(troop_data[i]['name'])
			troops[troop_id] = {name:troop_name}
			console.log(sprintf("Learned troop named %s with id %d", troop_name, troop_id));
		}
		callback()
	})
}

function get_scouts(callback) {
	//console.log("Scouts")
	troop_keys = Object.keys(troops)
	//console.log("Got so many " + troop_keys.length)
	async.each(troop_keys, function(troop_id, cb){
		p_api_client.rest({url:'/v1/'+troop_id+'/scouts'}, function(err, scout_data) {
			for (var j=0; j < scout_data.length; j++) {
				scout_id = scout_data[j]['id']
				scout_name = sanitize_name(scout_data[j]['name'])
				console.log(sprintf("Learned scout named %s in troop %s with id %d", scout_name, troop_name, scout_id));
				troops[troop_id][scout_id] = scout_name
			}
			cb()
		})},
		//function() {console.log(troops)}
		function() {}
		);

	callback()
}

function get_events() {
	syncer = p_api_client.sync()
	syncer.on('data', function(data) {
		handle_event(data)
	});
	syncer.on('error',function(err){
		console.log('sync error: ',err)
		delete syncer
		//setTimeout(get_events, 60000)
		setTimeout(get_events, 6000)
	});
	syncer.on('end',function(){
		console.log("shouldn't end but depending on arguments it may");
		delete syncer
		//setTimeout(get_events, 60000)
		setTimeout(get_events, 6000)
	});
}


function handle_event(msg) {
	if (!('troop' in msg['data']) || !('value' in msg['data'])) {
		return
	}
	msg_data = msg['data']
	msg_time = msg_data['time']
	msg_value = msg_data['value']

	//console.log("Got data", msg_data)

	troop_name = troops[msg_data['troop']]['name']
	scout_name = troops[msg_data['troop']][msg_data['scout']]
	g_msg_prefix = ['pinoccio', troop_name, scout_name, msg_data['type']].join('.')

	function add_metric(name, value) {
		metric_key = [g_msg_prefix, name].join('.')
		graphite_msg[metric_key] = value
	}

	graphite_msg = {}
	for (var prop in msg_value) {
		// skip metadata
		if (prop == "_t" || prop == "type") {
			continue
		}
		// if not a number
		if (!isFinite(msg_value[prop])) {
			// but an array, expand keys
			if (msg_value[prop] instanceof Array ) {
				for (var ar_i = 0; ar_i < msg_value[prop].length; ar_i++) {
					add_metric([prop, ar_i].join('_'), msg_value[prop][ar_i])
				}
			} else {
				continue
			}
		} else { // 1-dimensional value
			add_metric(prop, msg_data['value'][prop])
		}
	}
	if (Object.keys(graphite_msg).length == 0) {
		console.log("Empty metric from msg:", msg_data)
		return
	}
	console.log("Metric", graphite_msg)
	graphite_client.write(graphite_msg, msg_time, function(err) {
		if (typeof err != "undefined") {
			console.log("Error from graphite:", err)
		}
	})
}

async.series([handle_args, get_troops, get_scouts], get_events)
