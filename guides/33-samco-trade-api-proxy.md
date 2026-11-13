# Use the Samco Trade API through a proxy with a static IP

Samco accepts order placement and modification only from an IPv4 address you've whitelisted on your Samco API app. If your bot runs on home broadband or a server without a fixed IP, route Samco's official Python SDK, `stocknotebridge`, through an authenticated proxy and register the proxy's exit IP. The SDK uses `urllib3` rather than `requests`, so it ignores the usual proxy environment variables and needs a small change, shown below.

## What Samco checks

From Samco's Trade API docs:

- Order placement and modification requests are accepted only from IPs you have whitelisted. A rejected order returns HTTP 403, "The IP is not the registered static IP".
- Each API app has one **Primary** IP (required) and one **Secondary** IP (optional).
- Both must be public **IPv4** addresses. IPv6 isn't accepted.
- You can change your IP once every 7 days from your last change, counted across your whole Samco account, not per app. Deleting an IP counts as a change, and creating a new app doesn't reset the clock.
- A new IP takes effect at once, and the old one stops working.
- A static IP can be mapped to only one Samco client at a time. If another client has registered it, your request is rejected.
- All API sessions are logged out every day at 8:00 AM IST.

The wider background is in [static IP for Indian broker APIs](17-indian-broker-api-static-ip.md).

## IPv4 only, and why it matters for your proxy

Samco's REST host, `tradeapi.samco.in`, sits on a CDN that publishes IPv6 addresses as well as IPv4:

```bash
dig +short tradeapi.samco.in AAAA   # returns ipv6 addresses
```

So a proxy that can leave over IPv6 may reach Samco from an IPv6 address, which can't be whitelisted, and orders fail with 403. Use a proxy whose exit is IPv4 only.

## Step by step

1. Get an IPv4 proxy: host, port, username, password.
2. Check its exit IP with curl (below).
3. Log in to the Samco Trade API web dashboard, open **Static IPs**, click **Add IP**, pick your app and **PRIMARY**, enter the address and confirm with the OTP.
4. Install the SDK: `pip install stocknotebridge`.
5. Give the SDK a proxy-aware connection pool, as below, and log in.

## Code

```python
import os

import certifi
import urllib3
from snapi_py_client.api_client import ApiClient
from snapi_py_client.snapi_bridge import StocknoteAPIPythonBridge

api = ApiClient()
api.rest_client.pool_manager = urllib3.ProxyManager(  # the sdk ignores HTTPS_PROXY, so set the pool directly
    proxy_url=os.environ["PROXY_HOSTPORT"],  # http://HOST:PORT, without credentials
    proxy_headers=urllib3.make_headers(proxy_basic_auth=os.environ["PROXY_AUTH"]),  # USER:PASS
    cert_reqs="CERT_REQUIRED",
    ca_certs=certifi.where(),
)
samco = StocknoteAPIPythonBridge(api_client=api)

resp = samco.generate_session_token(body={"apiKey": os.environ["SAMCO_API_KEY"], "apiSecret": os.environ["SAMCO_API_SECRET"]})
samco.set_session_token(resp["sessionToken"])
```

The credentials go in `proxy_headers` because `urllib3` doesn't send a username and password written into the proxy URL. Pass the API key and secret in the form Samco's docs ask for.

The SDK's streaming client uses `websocket-client`, which does read `HTTPS_PROXY`. Samco checks the IP only on order calls, so streaming can stay on your normal connection; set `HTTPS_PROXY=http://USER:PASS@HOST:PORT` in the bot's process if you want it on the proxy too.

## How to check it worked

```bash
curl -x http://USER:PASS@HOST:PORT https://ifconfig.co
```

Samco also has a check endpoint, `GET /ip/whoami`, which returns the source IP Samco sees and whether it matches your registered IP. It doesn't use up your weekly change. The dashboard footer shows "Your IP" too.

## Troubleshooting

**403 "The IP is not the registered static IP".** The order left from another address, often an IPv6 one. Use an IPv4-only exit and check `whoami`.

**Can't add the IP.** Another Samco client has it registered, or you changed an IP in the last 7 days anywhere on your account.

**Session errors in the morning.** Samco logs out every session at 8:00 AM IST. Log in again.

**407 Proxy Authentication Required.** The credentials didn't reach the proxy. Put them in `proxy_headers`, not in `proxy_url`.

## Using a dedicated static IP

Any proxy or server with a fixed public IPv4 address that only you use works with Samco. TrueIP offers [dedicated static IPs for algo trading](https://www.trueip.in/algo-static-ip/?utm_source=github&utm_medium=guides) from Mumbai, delivered as an authenticated HTTP proxy with its own host, port, username and password. For Samco, take the IPv4 option at ₹200 a month plus 18% GST. Each IP belongs to one account and stays the same on renewal.

## Sources

- https://docs-tradeapi.samco.in/dashboard/static-ips.html
- https://docs-tradeapi.samco.in/static-ip/whoami.html
- https://docs-tradeapi.samco.in/static-ip/ip-update.html
- https://github.com/samco-sdk/Python-SDK
- https://pypi.org/project/stocknotebridge/
- https://urllib3.readthedocs.io/en/stable/advanced-usage.html#proxies

_Maintained by [TrueIP](https://www.trueip.in/?utm_source=github&utm_medium=guides). Last checked 14 November 2026._
