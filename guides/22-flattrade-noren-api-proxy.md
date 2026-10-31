# Use the Flattrade Noren API through a proxy with a static IP

Flattrade's Pi API needs a registered static IP before it will even generate an API key, and both the daily token and every order must come from that registered IP. If your Python bot runs on home broadband or on a machine without a fixed address, route the `NorenRestApiPy` client through an authenticated proxy and register the proxy's exit IP with Flattrade. The client calls `requests.post()` directly, so the standard proxy environment variables route every REST call. The WebSocket needs a small extra step. This guide covers both, plus verification and troubleshooting.

## What Flattrade checks

From Flattrade's support pages and its API version 2 announcement:

- A static IP is mandatory to create an API key. Dynamic home IPs are not accepted.
- You can register one primary IP and one optional backup IP, and change either one at most once a calendar week.
- The access token must be generated from the registered IP, and orders must come from the same registered IP. A mismatch between the token IP and the order IP gets the order rejected.
- Static IPs must be unique across Flattrade clients. Family sharing of one IP was not yet enabled when Flattrade announced API v2.
- API v2 took effect on 12 January 2026. For existing users, the main change was the WebSocket subscription process. The daily OAuth token flow stayed the same.

So the token step matters more here than with most brokers: generate the token through the proxy too.

Background on why brokers ask for this is in [static IP for Indian broker APIs](17-indian-broker-api-static-ip.md).

## Step by step

1. Get your proxy host, port, username and password.
2. Check the exit IP with curl (below).
3. Log in to Flattrade's WALL platform, open **Pi**, and create a new API key with your redirect URL and the static IP. Flattrade may change these screens, so follow the current Pi docs.
4. Note the API key and secret.
5. Set the proxy environment variables, then run the login flow from the Pi docs to get today's token. Do this from the same process or machine that will place orders, with the proxy already set.
6. Install: `pip install NorenRestApiPy websocket-client`.
7. Create the API object, set the session, and make a test call.

## Code

```python
import os

PROXY = os.environ["PROXY_URL"]  # http://USER:PASS@HOST:PORT
for v in ("HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"):
    os.environ[v] = PROXY  # every requests call in this process uses the fixed ip

from NorenRestApiPy.NorenApi import NorenApi


class FlattradeApi(NorenApi):
    def __init__(self):
        NorenApi.__init__(
            self,
            host="https://piconnect.flattrade.in/PiConnectAPI/",
            websocket="wss://piconnect.flattrade.in/PiConnectWSAPI/",
        )


api = FlattradeApi()
api.set_session(
    userid=os.environ["FLATTRADE_USERID"],
    password="",
    usertoken=os.environ["FLATTRADE_TOKEN"],
)
print(api.get_limits())
```

Since environment variables apply to the whole process, run the bot on its own. If your token generation script is separate, set the same variables there as well, or the token will be issued against your home IP and orders will fail.

## Placing an order

```python
ret = api.place_order(
    buy_or_sell="B",
    product_type="C",
    exchange="NSE",
    tradingsymbol="INFY-EQ",
    quantity=1,
    discloseqty=0,
    price_type="LMT",
    price=1500.00,
    trigger_price=None,
    retention="DAY",
    remarks="test_001",
)
print(ret)
```

This only shows the wiring. Trading symbols and field values must come from Flattrade's instrument master and the Pi docs. Flattrade's v2 announcement also lists order type restrictions for API orders (for example only limit and SL limit orders). Check the current docs before placing anything real.

## Routing the WebSocket through the proxy

`NorenApi` starts its WebSocket with `run_forever()` and passes no proxy arguments, so without help the socket would connect from your normal IP while REST calls use the proxy. `websocket-client` supports an HTTP proxy through `run_forever()` arguments, so a small patch fills them in. Apply it before `start_websocket()`:

```python
import websocket
from urllib.parse import unquote, urlparse

_p = urlparse(PROXY)  # PROXY from the setup step
_orig_run_forever = websocket.WebSocketApp.run_forever


def _run_forever_via_proxy(self, *args, **kwargs):
    kwargs.setdefault("http_proxy_host", _p.hostname)
    kwargs.setdefault("http_proxy_port", _p.port)
    kwargs.setdefault("http_proxy_auth", (unquote(_p.username), unquote(_p.password)))
    kwargs.setdefault("proxy_type", "http")
    return _orig_run_forever(self, *args, **kwargs)


websocket.WebSocketApp.run_forever = _run_forever_via_proxy

api.start_websocket(
    subscribe_callback=lambda tick: print("tick:", tick),
    order_update_callback=lambda msg: print("order:", msg),
    socket_open_callback=lambda: api.subscribe(["NSE|26000"]),
)
```

Because API v2 changed the WebSocket subscription process, check the Pi docs for the current subscription format and whether your `NorenRestApiPy` version matches it.

## IPv4 or IPv6

Flattrade's pages we checked don't say whether the static IP field accepts IPv6. On the network side, `piconnect.flattrade.in` publishes an AAAA record, so the REST API and WebSocket are reachable over IPv6:

```bash
dig +short piconnect.flattrade.in AAAA
```

Whether you can register an IPv6 address is up to Flattrade, so try it in the Pi key screen or ask support before you choose.

## How to check it worked

```bash
curl -x http://USER:PASS@HOST:PORT https://ifconfig.co
```

Then inside the bot process, after setting the variables:

```python
import requests

print(requests.get("https://ifconfig.co/ip", timeout=10).text)  # should be the registered ip
```

The address must match the IP on your Pi API key exactly.

## Troubleshooting

**Orders rejected with an invalid IP message.** Either the order left from a different IP, or the token was generated from a different IP. Regenerate today's token through the proxy, then retry from the same process.

**`set_session` succeeds but calls fail.** `set_session` only stores values locally; it doesn't contact the server. The first real call is where token and IP problems show up.

**Token works one day, fails the next.** Flattrade tokens are generated daily through the OAuth flow. Generate a new one each trading day.

**Ticks arrive but from the wrong IP, or the socket won't connect.** Make sure the `run_forever` patch runs before `start_websocket()`, and check the v2 subscription format.

**407 Proxy Authentication Required.** Wrong proxy credentials, or a password with `@` or `:` that needs URL encoding in `PROXY_URL`.

For more on `requests` proxies, see [use a proxy with Python requests](07-python-requests-proxy.md).

## Using a dedicated static IP

Any proxy or server with a fixed public IP that only you use will satisfy Flattrade's check, for tokens and orders alike. TrueIP offers [dedicated static IPs for algo trading](https://www.trueip.in/algo-static-ip/?utm_source=github&utm_medium=guides) from Mumbai, delivered as an authenticated HTTP proxy with its own host, port, username and password. Each IP belongs to one account, is never shared or rotated, and stays the same on renewal. IPv6 is ₹50 a month and IPv4 ₹200 a month, plus 18% GST.

## Sources

- https://flattrade.in/kosh/flattrade-api-implementation-of-retail-algo-standards-api-version-2-launch/
- https://flattrade.in/support/knowledge-base/can-we-use-a-public-ip-address-for-api-key-registration-why-is-only-a-static-ip-address-allowed/
- https://flattrade.in/support/knowledge-base/why-are-my-api-orders-getting-rejected-due-to-invalid-ip-address/
- https://flattrade.in/support/knowledge-base/can-a-client-register-a-backup-static-ip/
- https://flattrade.in/support/knowledge-base/how-many-times-can-static-ip-information-be-updated/
- https://pi.flattrade.in/docs
- https://pypi.org/project/NorenRestApiPy/
- https://websocket-client.readthedocs.io/en/latest/examples.html#connecting-through-a-proxy
- https://requests.readthedocs.io/en/latest/user/advanced/#proxies

_Maintained by [TrueIP](https://www.trueip.in/?utm_source=github&utm_medium=guides). Last checked 31 October 2026._
