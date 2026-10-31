# Use the Fyers API through a proxy with a static IP

Fyers only lets your trading app place orders from the static IP saved on that app. If your Python bot runs on a home connection or a server without a fixed IP, send the `fyers-apiv3` client through an authenticated proxy and register the proxy's exit IP on the app. The synchronous client uses `requests`, which reads the standard proxy environment variables, so you set those before creating the client. This guide covers the setup, a catch with async mode, how to verify, and what the common errors mean.

## What Fyers checks

From the Fyers API docs and support articles:

- An individual account gets one trading app (order placement, static IP required) and any number of non trading apps for data only.
- The static IP is needed only for order placement. Data APIs and other non trading calls don't need one.
- Apps created under the old setup were moved to data only mode from 1 April 2026. You activate the new **Algo trading app** in the API dashboard, set the static IP there, and get a new App ID (ending in 200) and secret.
- Family members can request a common static IP through Fyers support with a declaration.

The Fyers pages we checked don't say how many IPs you can add, whether IPv6 is accepted in the field, or how often you can change it. Check the API dashboard itself. On the network side, both `api-t1.fyers.in` and `socket.fyers.in` publish AAAA records, and TrueIP's [list of brokers that support IPv6](https://www.trueip.in/blog/which-indian-brokers-support-ipv6/?utm_source=github&utm_medium=guides) has Fyers on it as of July 2026, but confirm in your dashboard before choosing IPv6.

Background on the SEBI rule is in [static IP for Indian broker APIs](17-indian-broker-api-static-ip.md).

## Step by step

1. Get your proxy host, port, username and password.
2. Check the exit IP with curl (below).
3. Open the Fyers API dashboard, click **Algo trading app**, enter the static IP and redirect URL, select permissions and click **Activate**. Fyers may change these screens, so follow the current dashboard.
4. Note the new App ID and secret.
5. Install: `pip install fyers-apiv3`.
6. Set the proxy variables, create the client, and make a test call.

## Code

```python
import os

PROXY = os.environ["PROXY_URL"]  # http://USER:PASS@HOST:PORT
for v in ("HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"):
    os.environ[v] = PROXY  # requests in this process now uses the fixed ip

from fyers_apiv3 import fyersModel

fyers = fyersModel.FyersModel(
    client_id=os.environ["FYERS_APP_ID"],
    token=os.environ["FYERS_ACCESS_TOKEN"],
    is_async=False,
    log_path="",
)
print(fyers.get_profile())
```

Because environment variables affect every `requests` call in the process, run the bot as its own process. Anything else you want on your normal connection can go in a separate script, or you can list hosts in `NO_PROXY`.

## Keep `is_async=False`

In the installed package (fyers-apiv3 3.2.1), the synchronous client uses a `requests.Session`, which honours `HTTPS_PROXY`. The async client uses `aiohttp.ClientSession()` with default settings, and `aiohttp` ignores proxy environment variables unless `trust_env=True` is set. So with `is_async=True` your orders would leave from your normal IP and get rejected. Stick to the synchronous client for order placement through a proxy.

## Generating the access token through the proxy

The Fyers order IP check is on order placement, but it does no harm to run the login exchange from the same process. `SessionModel.generate_token()` also uses `requests`, so it follows the same environment variables:

```python
import os

from fyers_apiv3 import fyersModel

session = fyersModel.SessionModel(
    client_id=os.environ["FYERS_APP_ID"],
    secret_key=os.environ["FYERS_SECRET"],
    redirect_uri=os.environ["FYERS_REDIRECT_URI"],
    response_type="code",
    grant_type="authorization_code",
)
print(session.generate_authcode())  # open this url, log in, copy auth_code
session.set_token("AUTH_CODE_FROM_REDIRECT")
print(session.generate_token())
```

## Placing an order

```python
data = {
    "symbol": "NSE:SBIN-EQ",
    "qty": 1,
    "type": 1,
    "side": 1,
    "productType": "CNC",
    "limitPrice": 550,
    "stopPrice": 0,
    "validity": "DAY",
    "disclosedQty": 0,
    "offlineOrder": False,
}
print(fyers.place_order(data=data))
```

This shows the wiring only. Symbols and field values must come from the Fyers symbol master and the API v3 docs. Check them before sending anything real.

## Live data over WebSocket

Fyers says data APIs don't need a static IP, so you can run the data socket on your normal connection. We have not confirmed how the Fyers socket client handles proxy settings, so don't assume it follows `HTTPS_PROXY`. If you choose to route it through the proxy anyway, verify the socket's source IP before relying on it.

## How to check it worked

```bash
curl -x http://USER:PASS@HOST:PORT https://ifconfig.co
```

Then inside the bot process, after setting the environment variables:

```python
import requests

print(requests.get("https://ifconfig.co/ip", timeout=10).text)  # should be the fixed ip
```

That address must match the static IP on your **Algo trading app**, including IPv4 versus IPv6.

## Troubleshooting

**Orders rejected, profile works.** Profile is not IP checked. Print the egress IP from inside the same process and compare it with the app. Check that you're using the new App ID (ending in 200), not an old data only app.

**403 errors.** A 403 can come from an expired or wrong token as well as an IP mismatch, so check both: the token must be current and issued for the trading app, and the egress IP must match the dashboard.

**Static IP not accepted in the dashboard.** Fyers' help article says to check that the IP is valid and whitelisted, then update and retry. Paste the address exactly as `ifconfig.co` prints it.

**Works in a test script, fails in the bot.** Look for `is_async=True`, or for the environment variables being set after the client was created in another module.

**407 Proxy Authentication Required.** Wrong proxy credentials, or a password with `@` or `:` that needs URL encoding.

For more on `requests` and proxies, see [use a proxy with Python requests](07-python-requests-proxy.md).

## Using a dedicated static IP

Any proxy or server with a fixed public IP that only you use will satisfy the Fyers check. TrueIP offers [dedicated static IPs for algo trading](https://www.trueip.in/algo-static-ip/?utm_source=github&utm_medium=guides) from Mumbai, delivered as an authenticated HTTP proxy with its own host, port, username and password. Each IP belongs to one account, is never shared or rotated, and stays the same on renewal. IPv6 is ₹50 a month and IPv4 ₹200 a month, plus 18% GST.

## Sources

- https://fyers.in/api-docs/v3/getting-started/create-an-app/
- https://support.fyers.in/portal/en/kb/articles/how-do-i-activate-the-new-app-for-api-trading-after-april-1-2026
- https://support.fyers.in/portal/en/kb/articles/how-to-enable-a-common-static-ip-address-for-family-members-retail-algo-regulations
- https://pypi.org/project/fyers-apiv3/
- https://docs.aiohttp.org/en/stable/client_advanced.html#proxy-support
- https://requests.readthedocs.io/en/latest/user/advanced/#proxies

_Maintained by [TrueIP](https://www.trueip.in/?utm_source=github&utm_medium=guides). Last checked 31 October 2026._
