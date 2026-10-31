# Use Zerodha Kite Connect through a proxy with a static IP

Kite Connect only accepts order placement from an IP you have added to your developer account. If your bot runs on home broadband, or on a cloud VM whose IP you don't control, the fix is to send the Python `kiteconnect` client through an authenticated proxy with a fixed IP and register that IP in the Kite developer console. The client takes a standard `requests` style `proxies` dict, so it is a one line change. This guide shows the setup, how to verify the exit IP, and how to tell an IP rejection from an expired token.

## What Zerodha checks

From Zerodha's support pages:

- A static IP is required for API order placement. Zerodha gives 1 April 2026 as the effective date.
- Other calls (order book, positions, the WebSocket market data stream) can still be made from any IP.
- You can add one primary IP and one optional secondary IP.
- The list applies to the whole developer account and all apps under it. You can't set different IPs per app.
- You can change it once per calendar week, and the change takes effect immediately.
- Both IPv4 and IPv6 are supported. If your traffic leaves over IPv6 but you registered only an IPv4 address, orders are rejected.

The background on why brokers require this is in [static IP for Indian broker APIs](17-indian-broker-api-static-ip.md).

## Step by step

1. Get the proxy details for your fixed IP: host, port, username, password.
2. Check the exit IP with curl (see below) and note the exact address.
3. Log in to the Kite Connect developer console, open **Profile**, and enter the IP under **IP Whitelist**. Click **Update**. Double check it before saving, because of the weekly change limit.
4. Install the client: `pip install kiteconnect`.
5. Pass the proxy to `KiteConnect` and run a test call.

Zerodha may move these menus around. If you don't see **IP Whitelist** under **Profile**, check the console's current help page.

## Code

`KiteConnect` accepts a `proxies` argument that it hands to `requests`. Keep the proxy URL and keys in environment variables, not in the script.

```python
import os
from kiteconnect import KiteConnect

PROXY = os.environ["PROXY_URL"]  # http://USER:PASS@HOST:PORT

kite = KiteConnect(
    api_key=os.environ["KITE_API_KEY"],
    proxies={"http": PROXY, "https": PROXY},  # every kite call leaves from the fixed ip
)
kite.set_access_token(os.environ["KITE_ACCESS_TOKEN"])

print(kite.profile()["user_id"])
```

If you'd rather not touch the constructor, set the proxy in the environment before the client is created. `requests` picks it up automatically. Do this only in a process that runs the bot alone, because every other `requests` call in that process will also use the proxy.

```python
import os

PROXY = os.environ["PROXY_URL"]
for v in ("HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"):
    os.environ[v] = PROXY

from kiteconnect import KiteConnect
```

To create the daily access token, run the login exchange with the same client. `generate_session` takes the `request_token` from your redirect URL and your API secret:

```python
data = kite.generate_session(
    request_token="REQUEST_TOKEN_FROM_REDIRECT",
    api_secret=os.environ["KITE_API_SECRET"],
)
kite.set_access_token(data["access_token"])
```

## Placing an order

Once `profile()` works through the proxy, order calls use the same client, so they leave from the same IP.

```python
order_id = kite.place_order(
    variety=kite.VARIETY_REGULAR,
    exchange=kite.EXCHANGE_NSE,
    tradingsymbol="INFY",
    transaction_type=kite.TRANSACTION_TYPE_BUY,
    quantity=1,
    product=kite.PRODUCT_CNC,
    order_type=kite.ORDER_TYPE_LIMIT,
    price=1500,
)
print(order_id)
```

This is only a wiring example. Trading symbols, exchanges, product types and order rules must come from the Kite instrument list and the Kite Connect docs, and exchange rules on algo orders (for example around market orders) change. Check the current docs before you send anything real.

## Live ticks with KiteTicker

Zerodha doesn't check the IP on the WebSocket stream, so you can run `KiteTicker` on your normal connection and keep the proxy only for REST calls. This matters on an IPv6 proxy: `api.kite.trade` publishes an AAAA record, but `ws.kite.trade` does not, so the ticker cannot connect over an IPv6-only address. Check it yourself:

```bash
dig +short api.kite.trade AAAA
dig +short ws.kite.trade AAAA
```

## How to check it worked

Check the proxy first:

```bash
curl -x http://USER:PASS@HOST:PORT https://ifconfig.co
```

Then check from Python with the same proxy dict, so you know the bot sees what curl sees:

```python
import os
import requests

PROXY = os.environ["PROXY_URL"]
print(requests.get("https://ifconfig.co/ip", proxies={"https": PROXY}, timeout=10).text)
```

That address must match the **IP Whitelist** entry character for character. If it prints an IPv6 address, the IPv6 address is what you register.

## Troubleshooting

**403 with `TokenException`.** Kite's docs say a 403 with `TokenException` means the session expired or was invalidated. Access tokens expire at 6 AM the next day, and a master logout from Kite Web also kills them. This is a login problem, not an IP problem. Generate a fresh token.

**Profile works but orders are rejected.** This is the typical IP mismatch. Only order calls are IP checked, so read calls succeed from any address. Print the egress IP from inside the bot, compare it with the console, and check whether your proxy exits over IPv6 while you registered IPv4 (or the reverse).

**407 Proxy Authentication Required.** The proxy rejected your username or password. If the password has symbols like `@` or `:`, URL encode them in `PROXY_URL`.

**Timeouts or connection refused.** The proxy host or port is wrong, or a firewall is blocking outgoing traffic to it. Test with curl first.

**429 Too Many Requests.** That is the rate limit, not the IP check. Slow down.

**Can't save the IP.** You may have already used this calendar week's change, or the IP may be linked to another account. Zerodha warns that sharing an IP outside your immediate family can get the account suspended.

For more on proxies with `requests`, see [use a proxy with Python requests](07-python-requests-proxy.md).

## Using a dedicated static IP

Any proxy or server with a fixed public IP that only you use works with Kite Connect. TrueIP offers [dedicated static IPs for algo trading](https://www.trueip.in/algo-static-ip/?utm_source=github&utm_medium=guides) from Mumbai, delivered as an authenticated HTTP proxy (host, port, username, password) that you plug into the `proxies` dict above. Each IP belongs to one account, is never shared or rotated, and stays the same on renewal. IPv6 is ₹50 a month and IPv4 ₹200 a month, plus 18% GST.

## Sources

- https://support.zerodha.com/category/trading-and-markets/general-kite/kite-api/articles/static-ip
- https://support.zerodha.com/category/trading-and-markets/general-kite/kite-api/articles/kite-connect-api-faqs
- https://kite.trade/docs/connect/v3/user/
- https://kite.trade/docs/connect/v3/exceptions/
- https://kite.trade/docs/connect/v3/orders/
- https://nsearchives.nseindia.com/web/sites/default/files/inline-files/FAQ_Retail_Algo_03112025_NSE.pdf
- https://kite.trade/docs/pykiteconnect/v4/
- https://github.com/zerodha/pykiteconnect/blob/master/kiteconnect/connect.py
- https://requests.readthedocs.io/en/latest/user/advanced/#proxies

_Maintained by [TrueIP](https://www.trueip.in/?utm_source=github&utm_medium=guides). Last checked 31 October 2026._
