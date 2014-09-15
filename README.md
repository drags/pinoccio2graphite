# Pinoccio to Graphite

Push pinoccio streaming API messages to a graphite instance.

This tool listens to the Pinoccio streaming API and pushes all events with numeric data towards a Graphite carbon-collector instance.

### Usage

	usage: p2g.js [-h] [-v] -t TOKEN -g GRAPHITE [-p PREFIX]

	Pinoccio to Graphite

	Optional arguments:
	  -h, --help            Show this help message and exit.
	  -v, --version         Show program's version number and exit.
	  -t TOKEN, --token TOKEN
							Pinoccio API token
	  -g GRAPHITE, --graphite GRAPHITE
							Address of Graphite host
	  -p PREFIX, --prefix PREFIX
							Metric prefix: PREFIX.<troop>.<scout>.<metric>

Refer to the Pinocc.io docs for [generating tokens](https://docs.pinocc.io/api.html#login) (And consider using a [read-only token](https://docs.pinocc.io/api.html#readonly-token)).

## Graphite Resolution Config

Graphite uses the [Whisper database](https://graphite.readthedocs.org/en/0.9.10/whisper.html) file format for storing metrics. Whisper is a fixed size, multiple precision archive. These levels of precision (aggregations over time periods) are configured by the user in storage-schemas.conf and storage-aggregation.conf. Misconfigured schemas and aggregations can lead to inaccurate, useless, or wholly "missing" data. The `default` (unconfigured) storage schema is to store 1-day's worth of 1-minute aggregations (per metric). This means that:

 - If exactly 1 data point comes in every 60 seconds, the data stored by Graphite will be accurate.
 - If less than 1 data point comes in every 60 seconds then there will be gaps in the data. (The keepLastValue function can be used to fill in the gaps when graphed)
 - If more than 1 data point comes in every 60 seconds then the value with the **latest** timestamp that fits in the interval will be used.

If the data you're trying to capture is dynamic (does not occur/arrive at a fixed interval) you will need to look into running the carbon-aggregator daemon in front of the carbbon-cache daemon. This is because rollup aggregation only happens at levels above the lowest resolution schema (rollup aggregation is a feature of the Whisper database file format, and not handled by carbon-cache itself).

Thankfully storage schemas and aggregations can be applied to metrics based on their path name. See [Configuring Carbon](https://graphite.readthedocs.org/en/latest/config-carbon.html) for more

### References

  - [Carbon daemon docs](https://graphite.readthedocs.org/en/latest/carbon-daemons.html)
  - [Carbon daemon configs](https://graphite.readthedocs.org/en/latest/config-carbon.html)
  - [Feeding your data into Carbon](http://graphite.readthedocs.org/en/latest/feeding-carbon.html)
  - [Whisper database](https://graphite.readthedocs.org/en/0.9.10/whisper.html)
