# Use Angel One SmartAPI through a proxy with a static IP

Angel One only accepts SmartAPI orders that come from the static IP registered on your API key. If your Python bot runs on home broadband or a machine without a fixed IP, route the official `smartapi-python` client through an authenticated proxy and register the proxy's exit IP with Angel One. `SmartConnect` takes a `requests` style `proxies` dict, so the change is small. Angel One's API host is IPv4 only at the time of writing, so you need an IPv4 exit address. This guide covers setup, the TOTP login, verifying the IP, and troubleshooting.

## What Angel One checks

From Angel One's notice on SmartAPI changes:

- From 1 April 2026, API order execution is accepted only from your registered static IP.
- You register one primary static IP and can add an optional secondary IP for backup.
- A static IP can be mapped to only one client at a time. Family members (as SEBI defines family) can share one through a written request to the broker.
- You can change the mapped IP no more than once per calendar week.

The SmartAPI team's forum announcement adds that static IP is mandatory for order and GTT APIs, not for the others, and that only IPv4 static IPs are supported for now.

The wider background is in [static IP for Indian broker APIs](17-indian-broker-api-static-ip.md).

## Why IPv6 won't work here (yet)

The SDK sends requests to `apiconnect.angelone.in`. That host publishes no AAAA record, and neither does the streaming host, so an IPv6-only exit address can't reach them at all. The SmartAPI docs site does have an AAAA record, which can make it look like IPv6 works. Check the actual API host:

```bash
# empty output means no ipv6
dig +short apiconnect.angelone.in AAAA
dig +short smartapisocket.angelone.in AAAA
```

Use an IPv4 proxy for Angel One until both the console and the API host support IPv6.

## Step by step

1. Get an IPv4 proxy: host, port, username, password.
2. Check its exit IP with curl (below).
3. Log in to the SmartAPI portal and create an app with that IP as the primary static IP. Angel One's notice describes this as **Add App**, then entering the primary static IP. The forum post describes a **New Login** flow for static IP keys. Follow whatever the portal shows today.
4. Note the new API key. Older keys created before static IP keys may not work for orders.
5. Set up TOTP for your account in SmartAPI and keep the TOTP secret safe.
6. Install: `pip install smartapi-python pyotp`.
7. Create `SmartConnect` with the proxy and log in.

## Code

```python
import os

import pyotp
from SmartApi import SmartConnect

PROXY = os.environ["PROXY_URL"]  # http://USER:PASS@HOST:PORT

obj = SmartConnect(
    api_key=os.environ["ANGEL_API_KEY"],
    proxies={"http": PROXY, "https": PROXY},  # smartapi calls leave from the fixed ip
)

totp = pyotp.TOTP(os.environ["ANGEL_TOTP_SECRET"]).now()
session = obj.generateSession(
    os.environ["ANGEL_CLIENT_CODE"],
    os.environ["ANGEL_PIN"],
    totp,
)
print(obj.getProfile(session["data"]["refreshToken"])["data"]["name"])
```

`generateSession` takes your client code, your PIN and the current six digit TOTP. On success it stores the JWT on the object, so later calls on `obj` are authenticated.

If you're on an older `smartapi-python` that doesn't accept `proxies`, set the proxy environment variables before importing, in a process that only runs the bot. The client uses `requests`, which reads them:

```python
import os

PROXY = os.environ["PROXY_URL"]
for v in ("HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"):
    os.environ[v] = PROXY

from SmartApi import SmartConnect
```

## A note on TOTP

The TOTP code is computed from your secret and your machine's clock. If the clock on your VPS or Raspberry Pi drifts, the code will be wrong and login fails, which looks like an auth error but has nothing to do with the IP. Keep time synced (NTP) on the machine that runs the bot. Generate the code right before calling `generateSession`, not at startup, because each code is only valid for a short window.

## Placing an order

```python
params = {
    "variety": "NORMAL",
    "tradingsymbol": "SBIN-EQ",
    "symboltoken": "3045",
    "transactiontype": "BUY",
    "exchange": "NSE",
    "ordertype": "LIMIT",
    "producttype": "DELIVERY",
    "duration": "DAY",
    "price": "550",
    "quantity": "1",
}
order_id = obj.placeOrder(params)
print(order_id)
```

This only shows that orders go through the same proxied client. `symboltoken` and `tradingsymbol` values come from Angel One's instrument master, and the allowed field values are in the SmartAPI docs. Check them before sending a real order.

## How to check it worked

```bash
curl -x http://USER:PASS@HOST:PORT https://ifconfig.co
```

And from Python with the same proxy dict:

```python
import os
import requests

PROXY = os.environ["PROXY_URL"]
print(requests.get("https://ifconfig.co/ip", proxies={"https": PROXY}, timeout=10).text)
```

You should see an IPv4 address that matches the static IP on your SmartAPI app exactly.

## Troubleshooting

**Login works, orders rejected.** Only order and GTT calls are IP checked, so login and profile succeed from any IP. Print the egress IP from inside the bot and compare it with the app's registered IP. Also make sure you're using the API key of the app that has the static IP.

**Connection errors on every call over an IPv6 proxy.** Expected. The API host has no IPv6. Switch to an IPv4 exit.

**Invalid TOTP.** Check the machine clock and the secret. Don't reuse a code generated a minute ago.

**Session errors the next day.** SmartAPI sessions expire. Log in again with a fresh TOTP; it is not an IP problem.

**407 Proxy Authentication Required.** Wrong proxy username or password, or special characters in the password that need URL encoding in `PROXY_URL`.

**Can't register the IP.** It may already be mapped to another client, or you may have used this week's change.

For more on `requests` proxies, see [use a proxy with Python requests](07-python-requests-proxy.md).

## Using a dedicated static IP

Any proxy or server with a fixed public IPv4 address that only you use works with SmartAPI. TrueIP offers [dedicated static IPs for algo trading](https://www.trueip.in/algo-static-ip/?utm_source=github&utm_medium=guides) from Mumbai, delivered as an authenticated HTTP proxy with its own host, port, username and password. For Angel One you would take the IPv4 option, at ₹200 a month plus 18% GST; each IP belongs to one account, is never shared or rotated, and stays the same on renewal.

## Sources

- https://www.angelone.in/news/market-updates/what-s-changing-in-angel-one-s-smartapi-access-from-april-1-2026
- https://smartapi.angelone.in/smartapi/forum/topic/5352/static-ip-based-api-keys-now-live-old-flow-still-supported-temporarily
- https://smartapi.angelbroking.com/docs
- https://github.com/angel-one/smartapi-python
- https://github.com/angel-one/smartapi-python/blob/main/SmartApi/smartConnect.py
- https://pyauth.github.io/pyotp/
- https://requests.readthedocs.io/en/latest/user/advanced/#proxies

_Maintained by [TrueIP](https://www.trueip.in/?utm_source=github&utm_medium=guides). Last checked 31 October 2026._
