# Connect WebSockets (wss) through an HTTP proxy in Python and Node

Your trading bot or market data client already sends its REST calls through a fixed-IP proxy, because the exchange or broker whitelists your API key to that IP. Then the WebSocket feed connects from your own address, or refuses to connect at all. WebSocket libraries don't always pick up the proxy you set for HTTP, so each one needs its own setting. A `wss://` connection can go through a normal HTTP proxy, because the client opens a CONNECT tunnel first and then does TLS and the WebSocket handshake inside it. The short answer: in Python `websockets` (15.0 or later) pass `proxy=`; in `websocket-client` pass `http_proxy_host`, `http_proxy_port`, `http_proxy_auth` and `proxy_type="http"`; in Node `ws` pass an `HttpsProxyAgent` as `agent`; in ccxt set `wssProxy` as well as `httpsProxy`.

## How a WebSocket goes through a proxy

The client connects to the proxy and sends `CONNECT stream.example.com:443`, with a `Proxy-Authorization` header holding your username and password. The proxy opens a TCP connection to the exchange and replies `200`. From then on, the proxy just relays bytes. Your client does the TLS handshake with the exchange, then the WebSocket upgrade, all inside the tunnel. The exchange sees the proxy's IP, and the proxy can't read your messages.

These libraries also support SOCKS proxies. This guide covers HTTP CONNECT only.

## Python: websockets

Proxy support arrived in websockets 15.0. Check with `pip show websockets`. The new asyncio client detects proxies from the environment by default (`wss_proxy`, `https_proxy` and similar), and you can override that with the `proxy` argument:

```python
import asyncio
from websockets.asyncio.client import connect
from websockets.exceptions import ConnectionClosed

PROXY = "http://USER:PASS@HOST:PORT"

async def main():
    # async for reconnects with backoff when the connection drops
    async for ws in connect(
        "wss://stream.example.com/ws",
        proxy=PROXY,
        ping_interval=20,
        ping_timeout=20,
    ):
        try:
            async for message in ws:
                print(message)
        except ConnectionClosed:
            continue

asyncio.run(main())
```

From the websockets docs:

- Credentials in the proxy URL are used automatically.
- An `http://` proxy address means plain HTTP to the proxy. Only use `https://` if your proxy itself listens with TLS.
- `proxy=None` disables proxying, including any proxy picked up from the environment.
- `ping_interval` and `ping_timeout` both default to 20 seconds. They are set explicitly above so you can see them.
- In the `async for` pattern, a transient failure is retried with exponential backoff, and a fatal error breaks out of the loop.

## Python: websocket-client

The `websocket-client` package (imported as `websocket`) takes the proxy as separate arguments. It uses CONNECT for HTTP proxies, and `proxy_type` must be lowercase:

```python
import websocket

def on_message(ws, message):
    print(message)

def on_error(ws, error):
    print("error:", error)

ws = websocket.WebSocketApp(
    "wss://stream.example.com/ws",
    on_message=on_message,
    on_error=on_error,
)

ws.run_forever(
    http_proxy_host="HOST",
    http_proxy_port=PORT,
    http_proxy_auth=("USER", "PASS"),
    proxy_type="http",
    # pings are off by default in this library
    ping_interval=30,
    ping_timeout=10,
    # wait 5 seconds and reconnect if the connection drops
    reconnect=5,
)
```

Notes:

- `http_proxy_auth` is a tuple of username and password, so special characters in the password need no encoding.
- In this library `ping_interval` defaults to 0, which means no pings. The docs' example explains that if no pong comes back within `ping_timeout`, `run_forever()` exits with a `WebSocketTimeoutException`.
- For a single blocking connection, `websocket.WebSocket().connect(url, http_proxy_host=..., http_proxy_port=..., proxy_type="http", http_proxy_auth=(...))` takes the same proxy arguments.

The project's docs mention that you may hit problems when using TLS to the proxy itself. With a plain `http://` proxy and a `wss://` target, the TLS is inside the tunnel, so that warning doesn't apply.

## Node.js: ws with HttpsProxyAgent

`ws` accepts any option that `https.request()` takes, including `agent`. The `https-proxy-agent` package provides an agent that opens a CONNECT tunnel. It reads the username and password from the proxy URL and URL-decodes them before building the `Proxy-Authorization` header.

```js
import WebSocket from 'ws';
import { HttpsProxyAgent } from 'https-proxy-agent';

const agent = new HttpsProxyAgent('http://USER:PASS@HOST:PORT');

function start() {
  const ws = new WebSocket('wss://stream.example.com/ws', { agent });
  let heartbeat;

  ws.on('open', () => {
    // ping every 20s so idle tunnels are not dropped
    heartbeat = setInterval(() => ws.ping(), 20_000);
  });

  ws.on('message', (data) => console.log(data.toString()));

  ws.on('close', () => {
    clearInterval(heartbeat);
    // simple fixed delay before reconnecting
    setTimeout(start, 5_000);
  });

  ws.on('error', (err) => console.error('ws error:', err.message));
}

start();
```

If the password has `@`, `:` or `#`, percent-encode it in the URL. The agent decodes it again.

## ccxt (ccxt.pro websockets)

ccxt's manual is clear that `httpProxy` and `httpsProxy` affect only REST requests. For websockets you set `wsProxy` or `wssProxy` as well:

```python
import ccxt.pro as ccxtpro

exchange = ccxtpro.binance({"apiKey": "KEY", "secret": "SECRET"})

# rest calls
exchange.httpsProxy = "http://USER:PASS@HOST:PORT/"
# websocket streams, set separately
exchange.wssProxy = "http://USER:PASS@HOST:PORT/"
```

The manual's examples show proxy URLs without credentials. `user:pass@` is the standard URL form for them, but test it with your ccxt version. Don't use `proxyUrl`, which is a URL-prefixing redirect, not a forward proxy. The manual also reminds you to add the proxy's IP to your API key's whitelist.

## Keep-alive and reconnects

A WebSocket through a proxy has more places to break than a REST call. A few habits help:

- **Ping regularly.** Proxies, NAT devices and some exchanges close connections that look idle. A ping every 20 to 30 seconds keeps traffic moving. Check your exchange's docs for its own ping rules.
- **Always reconnect.** Connections drop. Your home Jio or Airtel line may blip during a power cut, the proxy may restart, or the exchange may close the connection for maintenance. Build the reconnect loop in from the start, with a delay so you don't hammer the server.
- **Resubscribe after reconnecting.** A new connection has no subscriptions. Send your subscribe messages again in the `open` handler, or at the top of the `async for` loop.
- **Watch for gaps.** If you keep an order book from deltas, refetch a snapshot over REST after a reconnect. That REST call must go through the proxy too.
- **Mind connection limits.** Each WebSocket holds one tunnel open. Exchanges and proxies may both cap concurrent connections, so combine streams where the exchange allows it.

## How to check it worked

First check the REST side with `curl -x http://USER:PASS@HOST:PORT https://ifconfig.co`. Then connect the WebSocket and, if the exchange offers one, call an endpoint that shows the IP it sees, or check the API key's access log in its dashboard. If the WebSocket connects without the proxy and fails with it, test the same proxy with curl to rule out credentials. A 407 in the error means the proxy refused them.

## Troubleshooting

- **WebSocket connects from your own IP.** The library didn't get the proxy. ccxt needs `wssProxy` as well as `httpsProxy`. Older `websockets` versions (before 15.0) have no proxy support.
- **`407 Proxy Authentication Required`.** Wrong credentials, or special characters not percent-encoded in a URL.
- **Disconnects every few minutes.** Pings are off or too far apart. In `websocket-client`, they are off by default.
- **Fails only on an endpoint with an unusual port.** Many proxies allow CONNECT only to common ports such as 443. Use the exchange's standard `wss://` endpoint on 443 if it has one.

## Using a dedicated static IP

Any fixed-IP proxy or server with a static IP works for these connections. TrueIP, which maintains this repo, provides [static IPs for crypto exchange APIs](https://www.trueip.in/static-ip-crypto-exchange-api/?utm_source=github&utm_medium=guides) as an authenticated HTTP proxy with HTTPS CONNECT, which carries `wss://` streams and REST calls from the same address. Each IP is from Mumbai, dedicated to one account, never rotated and kept on renewal. IPv6 is ₹50 a month and IPv4 ₹200 a month, plus 18% GST.

## Sources

- https://websockets.readthedocs.io/en/stable/topics/proxies.html
- https://websockets.readthedocs.io/en/stable/reference/asyncio/client.html
- https://websockets.readthedocs.io/en/stable/project/changelog.html
- https://websocket-client.readthedocs.io/en/latest/examples.html
- https://github.com/websocket-client/websocket-client/blob/master/websocket/_app.py
- https://github.com/websockets/ws/blob/master/doc/ws.md
- https://github.com/TooTallNate/proxy-agents/tree/main/packages/https-proxy-agent
- https://github.com/ccxt/ccxt/blob/master/wiki/Manual.md#proxy
- https://curl.se/libcurl/c/CURLOPT_HTTPPROXYTUNNEL.html

_Maintained by [TrueIP](https://www.trueip.in/?utm_source=github&utm_medium=guides). Last checked 31 October 2026._
