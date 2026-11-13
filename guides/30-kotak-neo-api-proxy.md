# Use the Kotak Neo Trade API through a proxy with a static IP

Kotak Neo accepts API orders only from a static IP registered on your Trade API application, and only from a session that was created from that same IP. If your bot runs on home broadband or a server without a fixed IP, route the official `kotakneoapi` Python client through an authenticated proxy and register the proxy's exit IP. The client accepts a custom `httpx` transport, which Kotak documents for exactly this. Kotak's website says IPv4 is supported now and IPv6 is coming, so use an IPv4 address for now.

## What Kotak checks

From Kotak's static IP page and the Kotak-Neo GitHub docs:

- IP checks started on 1 April 2026.
- Only order APIs are checked: place, modify and cancel. Login, reports, portfolio, data and WebSocket streams work from any IP.
- Order APIs accept requests only from a whitelisted IP **with a session created from the same IP**.
- You can register two IPs, a primary and a secondary.
- Each can be changed once every 7 days. Changes apply at once, and you need a new session afterwards.
- Up to 10 family members can share your IP, added under Trade API family management. Only the parent account can add or change the IP.

On IPv6 the two official sources differ. The GitHub doc lists IPv4 and IPv6 as supported; kotakneo.com says "IPv4 (currently), IPv6 support coming soon". Until Kotak's own site changes, register an IPv4 address.

The wider background is in [static IP for Indian broker APIs](17-indian-broker-api-static-ip.md).

## Step by step

1. Get an IPv4 proxy: host, port, username, password.
2. Check its exit IP with curl (below).
3. In the Kotak Neo app or website, go to **More**, then **Trade API**. Create an API application if you don't have one, then **Add IP** and enter the address as the primary static IP. You can add a secondary IP from the application details page.
4. Install the client: `pip install kotakneoapi` (Python 3.10 or later).
5. Log in **through the proxy**, so the session is created from the registered IP, then place orders on that same session.

## Code

```python
import os

import httpx
from neo_api_client import NeoAPI

PROXY = os.environ["PROXY_URL"]  # http://USER:PASS@HOST:PORT

client = NeoAPI(
    consumer_key=os.environ["KOTAK_CONSUMER_KEY"],
    environment="prod",
    transport=httpx.HTTPTransport(proxy=PROXY, http2=True),  # every rest call leaves from the fixed ip
)
client.totp_login(mobile_number=os.environ["KOTAK_MOBILE"], ucc=os.environ["KOTAK_UCC"], totp=os.environ["KOTAK_TOTP"])
client.totp_validate(mpin=os.environ["KOTAK_MPIN"])
print(client.whatsmyip())  # must match the ip registered on your trade api app
```

Passing your own `transport` replaces the SDK's default one, so keep `http2=True` on it as shown. A custom transport also means the client ignores `HTTPS_PROXY` for REST calls; the proxy you pass is the one used.

`whatsmyip()` asks Kotak which address it sees for your session. Check it before your first order.

## WebSockets

The SDK's market data and order feeds use the `websockets` library, which doesn't use the transport above. Kotak doesn't check the IP on streams, so you can leave them on your normal connection. If you want them on the proxy too, set `HTTPS_PROXY` to the same URL in the bot's process and install `websockets>=15`, the first version that follows proxy variables.

## How to check it worked

```bash
curl -x http://USER:PASS@HOST:PORT https://ifconfig.co
```

Use a public check like this, not `ipconfig` or `ifconfig` on your machine. Those show your local network address, which is not what Kotak sees.

## Troubleshooting

**`{"stCode": 100008, "errMsg": "unauthorized"}` on orders.** The order came from an IP that isn't whitelisted. Check `whatsmyip()`.

**`stCode 1037`, "session ip doesnt match with reqest ip".** You logged in from one address and are ordering from another. Log in through the proxy too.

**Orders fail right after you changed the IP.** The old session is still alive but no longer authorised for orders. Log in again.

**Dual-stack proxy.** Kotak's order hosts publish IPv6 addresses. If your proxy can leave over IPv6 while you registered IPv4, orders can fail. Use an IPv4-only exit, and confirm with `whatsmyip()`.

**407 Proxy Authentication Required.** Wrong proxy credentials, or special characters in the password that need URL encoding.

## Using a dedicated static IP

Any proxy or server with a fixed public IPv4 address that only you use works with Kotak Neo. TrueIP offers [dedicated static IPs for algo trading](https://www.trueip.in/algo-static-ip/?utm_source=github&utm_medium=guides) from Mumbai, delivered as an authenticated HTTP proxy with its own host, port, username and password. For Kotak, take the IPv4 option at ₹200 a month plus 18% GST. Each IP belongs to one account and stays the same on renewal.

## Sources

- https://www.kotakneo.com/platform/kotak-neo-trade-api/static-ip-details/
- https://github.com/Kotak-Neo/Kotak-Neo/blob/main/docs/static-ip-whitelisting.md
- https://github.com/Kotak-Neo/Kotak-Neo/blob/main/docs/troubleshooting.md
- https://github.com/Kotak-Neo/kotak-neo-python
- https://pypi.org/project/kotakneoapi/
- https://www.python-httpx.org/advanced/transports/
- https://websockets.readthedocs.io/en/stable/topics/proxies.html

_Maintained by [TrueIP](https://www.trueip.in/?utm_source=github&utm_medium=guides). Last checked 14 November 2026._
