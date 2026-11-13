# Use ICICI Direct Breeze API through a proxy with a static IP

ICICI Direct's Breeze API accepts orders only from the static IP you registered when you created your API key. If your Python bot runs on home broadband or a server without a fixed IP, send the official `breeze-connect` client through an authenticated proxy and register the proxy's exit IP on the Breeze portal. The client has no proxy argument, but it uses `requests`, which reads the standard proxy environment variables. ICICI hasn't said whether it accepts IPv6, so use an IPv4 address.

## What ICICI checks

From ICICI Direct's FAQs and the Breeze SDK's regulatory notes:

- Orders must be placed only from the static IP registered with ICICI Direct for your API key. A static IP is mandatory for Breeze API access.
- ICICI's FAQ gives 1 October 2025 as the date from which a static IP was needed, and says all existing API keys were deleted. If you had an older key, create a new one with your static IP.
- A primary static IP is mandatory. A secondary IP is optional, as a backup if the primary fails.
- You can change the IP once per calendar week. For urgent exceptions ICICI points you to breezeapi@icicisecurities.com.
- You don't need to send the IP in any header. ICICI checks the address your request comes from.
- Family members, as SEBI defines family (spouse, dependent parents, dependent children), can share an IP. ICICI verifies whether the accounts qualify.
- Unregistered algos can route orders through only one API key.

ICICI doesn't say whether calls other than orders are checked, or whether IPv6 is accepted. Its FAQ only describes the primary IP as "the public IP address from which you will be accessing Breeze API".

The wider background is in [static IP for Indian broker APIs](17-indian-broker-api-static-ip.md).

## Step by step

1. Get an IPv4 proxy: host, port, username, password.
2. Check its exit IP with curl (below).
3. On the Breeze API portal, register a new app with your app name, redirect URL and the address as the **Primary IP**. To change the IP later, open **View Apps** and click the edit icon next to the IP.
4. Install the client: `pip install breeze-connect`.
5. Set the proxy variables, then import the client and log in.

## Code

```python
import os

PROXY = os.environ["PROXY_URL"]  # http://USER:PASS@HOST:PORT
for v in ("HTTPS_PROXY", "HTTP_PROXY"):
    os.environ[v] = PROXY  # set before importing breeze_connect

from breeze_connect import BreezeConnect

breeze = BreezeConnect(api_key=os.environ["BREEZE_API_KEY"])
# get the session token by logging in at:
# https://api.icicidirect.com/apiuser/login?api_key=<your url-encoded api key>
breeze.generate_session(api_secret=os.environ["BREEZE_API_SECRET"], session_token=os.environ["BREEZE_SESSION_TOKEN"])
```

Set the variables before the import. The module downloads ICICI's security master when it loads, and you want every call from the client to use the same route. Run the bot in its own process so the proxy doesn't apply to other programs.

The session token comes from a browser login. ICICI doesn't say whether that login must come from the registered IP. Orders are what must, and the code above sends them through the proxy.

## Placing an order

```python
order = breeze.place_order(
    stock_code="ITC",
    exchange_code="NSE",
    product="cash",
    action="buy",
    order_type="limit",
    stoploss="",
    quantity="1",
    price="400",
    validity="day",
)
print(order)
```

This only shows that orders use the proxied client. Check stock codes and allowed values in the Breeze docs before sending a real order. ICICI converts API market orders into aggressive limit orders.

## Streaming

`breeze.ws_connect()` uses socket.io over `websocket-client`, which reads `HTTPS_PROXY` too, so streams also leave from the fixed IP when the variable is set.

## How to check it worked

```bash
curl -x http://USER:PASS@HOST:PORT https://ifconfig.co
```

From Python, inside the bot's process:

```python
import requests
print(requests.get("https://ifconfig.co/ip", timeout=10).text)  # uses HTTPS_PROXY
```

The address must be the one on your Breeze app.

## Troubleshooting

**Orders rejected, other calls fine.** The order left from a different IP. Print the exit IP from inside the bot.

**Your proxy can leave over IPv6.** Breeze's API host has an IPv6 address, and ICICI hasn't said it accepts IPv6. Use an IPv4-only exit.

**Old API key stopped working.** ICICI deleted keys created before the static IP rule. Generate a new key with your IP.

**Can't change the IP.** You've already changed it this calendar week.

**407 Proxy Authentication Required.** Wrong proxy credentials, or a password with special characters that need URL encoding. See [use a proxy with Python requests](07-python-requests-proxy.md).

## Using a dedicated static IP

Any proxy or server with a fixed public IPv4 address that only you use works with Breeze. TrueIP offers [dedicated static IPs for algo trading](https://www.trueip.in/algo-static-ip/?utm_source=github&utm_medium=guides) from Mumbai, delivered as an authenticated HTTP proxy with its own host, port, username and password. For Breeze, take the IPv4 option at ₹200 a month plus 18% GST. Each IP belongs to one account and stays the same on renewal.

## Sources

- https://github.com/Idirect-Tech/Breeze-Python-SDK
- https://api.icicidirect.com/breezeapi/documents/index.html
- https://www.icicidirect.com/faqs/fno/is-it-mandatory-to-provide-a-static-ip-for-api-based-trading
- https://www.icicidirect.com/faqs/fno/how-do-i-create-an-api-key-after-the-implementation-of-the-new-protocols-mentioned-in-the-circular
- https://www.icicidirect.com/faqs/fno/is-it-mandatory-to-provide-secondary-ip-address
- https://www.icicidirect.com/faqs/fno/how-do-i-update-my-static-ip-while-retaining-my-newly-generated-api-key-on-the-website
- https://www.icicidirect.com/faqs/fno/can-i-update-change-my-static-ip-if-needed
- https://www.icicidirect.com/faqs/fno/do-i-need-to-include-the-static-ip-in-the-breeze-api-header
- https://www.icicidirect.com/faqs/fno/what-is-the-primary-ip-address-and-how-to-check-it
- https://www.icicidirect.com/faqs/fno/can-family-members-share-a-static-ip

_Maintained by [TrueIP](https://www.trueip.in/?utm_source=github&utm_medium=guides). Last checked 14 November 2026._
