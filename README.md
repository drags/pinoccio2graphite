# Pinoccio to Graphite

Push pinoccio streaming API messages to a graphite instance.

This tool listens to the Pinoccio streaming API and pushes all messages that contain numbers towards a Graphite carbon-collector instance.

Configure this initial barebones version by modifying p2g.js directly. Find the following 2 lines and modify them appropriately:

	var p_api = pinoccio('xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')
	var graphite_client = graphite.createClient('plaintext://graphite.example.com:2003')

Fill in a working Pinoccio API [token](https://docs.pinocc.io/api.html#login) (Preferably a [read-only token](https://docs.pinocc.io/api.html#readonly-token)) as well as the URL to your Graphite instance.
