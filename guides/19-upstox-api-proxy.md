# Use the Upstox API through a proxy with a static IP

Upstox rejects order requests that don't come from the static IP registered on your developer app. If your Python bot runs on a connection whose IP changes, or on a machine you can't give a fixed IP, send the official `upstox-python-sdk` through an authenticated proxy and register the proxy's exit IP with Upstox. The SDK uses `urllib3`, not `requests`, so environment variables alone won't route it. You set `Configuration.proxy`, and because `urllib3` does not read a username and password from the proxy URL, you also add a `Proxy-Authorization` header. This guide shows both, then how to verify and troubleshoot.

## What Upstox checks

From Upstox's algo trading announcement:

- Order endpoints must come from a registered IP: place, modify and cancel order, multi order, GTT orders and exit all positions.
- Other calls such as holdings, positions, funds and historical candles are not restricted.
- You get one primary and one secondary static IP.
- You can change them once per calendar week, in **My Apps** or through Upstox's static IP API. A successful change invalidates existing access tokens, so you log in again afterwards.
- Both IPv4 and IPv6 notation are accepted.
- A registered IP is unique to one customer and can't be registered by anyone else.
- Upstox lists 1 April 2026 as the effective date.

Why brokers do this is covered in [static IP for Indian broker APIs](17-indian-broker-api-static-ip.md).

## Step by step

1. Get your proxy host, port, username and password.
2. Check the exit IP with curl (below) and copy the exact address.
3. In the Upstox developer portal, open your app under **My Apps** and add that address as your static IP. Upstox may change the layout, so follow the current screens if they differ.
4. Generate a fresh access token after saving the IP.
5. Install the SDK: `pip install upstox-python-sdk`.
6. Configure the proxy and make a test call.

## Code

`Configuration.proxy` makes the SDK build a `urllib3.ProxyManager`. We found in testing (SDK 2.30.0, urllib3 2.6) that the username and password in the proxy URL are not sent to the proxy, so an authenticated proxy answers with 407. Pass host and port in `config.proxy`, and add the credentials as a header on the pool manager.

```python
import os
from urllib.parse import unquote, urlparse

import urllib3
import upstox_client

PROXY = os.environ["PROXY_URL"]  # http://USER:PASS@HOST:PORT
p = urlparse(PROXY)

config = upstox_client.Configuration()
config.access_token = os.environ["UPSTOX_ACCESS_TOKEN"]
config.proxy = f"http://{p.hostname}:{p.port}"  # sdk traffic goes via the proxy

client = upstox_client.ApiClient(config)
# urllib3 ignores user:pass in the proxy url, so send them as a header
client.rest_client.pool_manager.proxy_headers.update(
    urllib3.make_headers(proxy_basic_auth=f"{unquote(p.username)}:{unquote(p.password)}")
)

user_api = upstox_client.UserApi(client)
print(user_api.get_profile(api_version="v2").data.user_id)
```

Set the header right after creating `ApiClient` and before the first request. Use the same `client` for every API class (`UserApi`, `OrderApi` and so on) so they all share the proxied pool.

If your proxy authorises by source IP rather than username and password, you can skip the header and set `config.proxy` to the plain `http://HOST:PORT`.

## Placing an order

```python
order_api = upstox_client.OrderApi(client)

body = upstox_client.PlaceOrderRequest(
    quantity=1,
    product="D",
    validity="DAY",
    price=1500.0,
    instrument_token="NSE_EQ|INE002A01018",
    order_type="LIMIT",
    transaction_type="BUY",
    disclosed_quantity=0,
    trigger_price=0.0,
    is_amo=False,
)
resp = order_api.place_order(body, api_version="v2")
print(resp.data.order_id)
```

This only shows the wiring. `instrument_token` values come from the Upstox instrument master, and product codes, order types and newer order endpoints are in the Upstox API docs. Check them before sending anything real.

## Market data feed

Upstox lists only order endpoints as IP checked, so the WebSocket feed can run on your normal connection. The feed URL is handed back at runtime by the authorise call, so if you plan to run the feed through an IPv6-only proxy, check that the host it gives you has an AAAA record first:

```bash
dig +short api.upstox.com AAAA
```

`api.upstox.com` does publish one, so REST works over IPv6. Test the feed host separately.

## How to check it worked

Check the proxy from the shell:

```bash
curl -x http://USER:PASS@HOST:PORT https://ifconfig.co
```

Then check through `urllib3` with the same settings the SDK uses, so you know the auth header works:

```python
import os
from urllib.parse import unquote, urlparse

import urllib3

p = urlparse(os.environ["PROXY_URL"])
pm = urllib3.ProxyManager(
    f"http://{p.hostname}:{p.port}",
    proxy_headers=urllib3.make_headers(proxy_basic_auth=f"{unquote(p.username)}:{unquote(p.password)}"),
)
print(pm.request("GET", "https://ifconfig.co/ip").data.decode())
```

The address printed must match the static IP in **My Apps** exactly, including IPv4 versus IPv6.

## Troubleshooting

**407 or "Tunnel connection failed".** The proxy didn't get your credentials. Check that the `proxy_headers` line runs before any API call. If your password contains `@` or `:`, URL encode it inside `PROXY_URL`; the `unquote` calls turn it back into the real password for the header.

**Orders rejected with a static IP message, profile works.** Read calls aren't IP checked, so this points at a mismatch on the order path. Confirm the egress IP and that all API objects share the proxied `client`. A second `ApiClient` created without the proxy will go direct.

**Token errors right after changing the IP.** Expected. Upstox invalidates tokens on an IP update. Log in again.

**Token errors the next day.** Access tokens expire, so check the validity window in the Upstox authentication docs. That is a login issue, not an IP issue.

**Environment variables set but traffic still goes direct.** The SDK doesn't read `HTTPS_PROXY`. Use `config.proxy`.

**Can't save the IP.** You may have used this week's change, or the address may already belong to another customer.

For proxies with `requests` (useful for your own helper calls), see [use a proxy with Python requests](07-python-requests-proxy.md).

## Using a dedicated static IP

Any proxy or server with a fixed public IP that only you use will pass the Upstox check. TrueIP offers [dedicated static IPs for algo trading](https://www.trueip.in/algo-static-ip/?utm_source=github&utm_medium=guides) from Mumbai, delivered as an authenticated HTTP proxy with its own host, port, username and password. Each IP belongs to one account, is never shared or rotated, and stays the same on renewal. IPv6 is ₹50 a month and IPv4 ₹200 a month, plus 18% GST.

## Sources

- https://upstox.com/developer/api-documentation/announcements/algo-trading-circular/
- https://upstox.com/developer/api-documentation/api-overview/
- https://github.com/upstox/upstox-python
- https://github.com/upstox/upstox-python/blob/master/upstox_client/configuration.py
- https://github.com/upstox/upstox-python/blob/master/upstox_client/rest.py
- https://urllib3.readthedocs.io/en/stable/advanced-usage.html#proxies
- https://urllib3.readthedocs.io/en/stable/reference/urllib3.util.html#urllib3.util.make_headers

_Maintained by [TrueIP](https://www.trueip.in/?utm_source=github&utm_medium=guides). Last checked 31 October 2026._
