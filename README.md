# Pinoccio to Graphite

Push pinoccio streaming API messages to a graphite instance.

This tool listens to the Pinoccio streaming API and pushes all events with numeric data towards a Graphite carbon-collector instance.

### Usage

	usage: p2g.js [-h] [-v] -t TOKEN -g GRAPHITE

	Pinoccio to Graphite

	Optional arguments:
	  -h, --help            Show this help message and exit.
	  -v, --version         Show program's version number and exit.
	  -t TOKEN, --token TOKEN
							Pinoccio API token
	  -g GRAPHITE, --graphite GRAPHITE
							Address of Graphite host

Refer to the Pinocc.io docs for [generating tokens](https://docs.pinocc.io/api.html#login) (And consider using a [read-only token](https://docs.pinocc.io/api.html#readonly-token)).
