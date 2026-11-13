# Static IP for Indian broker APIs: what to register and why

If you run your own trading code against Zerodha, Upstox, Angel One, Dhan, Kotak Neo, ICICI Breeze, Fyers, Shoonya, Samco or any other Indian broker API, order requests now have to come from an IP address you have registered with the broker. Orders from any other address get rejected, even with a valid API key and token. The short answer: get one fixed public IP, register it in your broker's developer console, and send at least your order calls through it.

## Why brokers ask for a static IP

The rule comes from SEBI's circular "Safer participation of retail investors in Algorithmic trading" (SEBI/HO/MIRSD/MIRSD-PoD/P/CIR/2025/0000013, 4 February 2025). In paragraph 5.I(d), SEBI tells brokers not to permit open APIs and to allow access only through a client specific API key and a "static IP whitelisted by the broker", so that every algo order can be traced to the investor behind it. SEBI later extended the implementation timeline, including by a circular dated 30 September 2025.

Zerodha, Upstox, Angel One and Fyers all published 1 April 2026 as the date from which API orders need a registered static IP.

NSE's retail algo FAQ adds two points:

- A client static IP is needed when you, as a tech savvy investor, place orders through the API yourself.
- If you use an algo platform hosted on the broker's own infrastructure, the static IP is the broker's server IP, not yours.

This guide is for people running their own code. If your orders go through a hosted platform such as Tradetron or AlgoTest, the platform or broker supplies the IP and you don't need your own.

## What you actually register

You register your **public egress IP**: the address the broker's server sees when your request arrives. It is not your laptop's LAN address (192.168.x.x) and often not the WAN address shown in your Jio or Airtel router either, because many home connections sit behind carrier-grade NAT. Check it from the outside, as shown in [find your outbound IP](02-find-your-outbound-ip.md).

Details differ by broker. From the broker pages we checked:

- **How many IPs:** Zerodha, Upstox, Angel One and Flattrade describe one primary IP plus one optional secondary IP.
- **How often you can change it:** Zerodha, Upstox, Angel One and Flattrade allow one change per calendar week. Upstox also invalidates existing access tokens after an IP update.
- **Which calls are checked:** Zerodha, Upstox, Angel One and Fyers say only order placement (and related order calls) needs the registered IP. Data, positions and holdings can come from anywhere.
- **Token generation:** Flattrade says the token must be generated from the same registered IP that places the orders.
- **Scope:** Zerodha applies the IP list to the whole developer account, across all your apps.

With a weekly change limit, a home connection that gets a new IP after every power cut can lock you out for days.

## One IP per account

The IP is tied to you. Angel One says a static IP can be mapped to only one client at a time. Upstox says a registered static IP cannot be registered by any other customer. Zerodha warns that sharing an IP outside your immediate family can lead to suspension of the Kite Connect account. Brokers do allow family members (spouse, dependent children, dependent parents) to share one IP, usually with a declaration, and each broker has its own process for it.

So: one IP for you (and family), never a shared proxy pool.

## IPv4 or IPv6

A broker will only accept an IPv6 address if two things are true: its console lets you register IPv6, and its API host is reachable over IPv6. Zerodha and Upstox state in their docs that both IPv4 and IPv6 are supported. Angel One's SmartAPI team said only IPv4 is supported for now. For the others, check the console. TrueIP keeps a list of [which Indian brokers support IPv6](https://www.trueip.in/blog/which-indian-brokers-support-ipv6/?utm_source=github&utm_medium=guides) (as of July 2026; confirm with your broker).

You can check the DNS side yourself. A host with no AAAA record cannot be reached from an IPv6-only address:

```bash
# an empty answer means no ipv6 for that host
dig +short api.kite.trade AAAA
dig +short apiconnect.angelone.in AAAA
```

Also check streaming hosts separately. A broker can publish IPv6 for its REST API and not for its WebSocket feed.

## Route only broker calls through the fixed IP

You don't need to push your whole machine through the fixed IP. Send only the broker client through an authenticated proxy.

The cleanest way is to give the proxy to the broker client itself. Most Python broker SDKs use `requests`, and several accept a `proxies` dict. For your own HTTP calls:

```python
import os
import requests

PROXY = os.environ["PROXY_URL"]  # http://USER:PASS@HOST:PORT

broker = requests.Session()
broker.proxies = {"http": PROXY, "https": PROXY}  # only this session uses the fixed ip

other = requests.Session()  # normal connection
```

If an SDK has no proxy option, set `HTTPS_PROXY` in the environment of a separate process that only runs the trading bot, so nothing else picks it up. Each SDK differs; see the broker guides below. The `requests` details are in [use a proxy with Python requests](07-python-requests-proxy.md).

## How to check it worked

First confirm the proxy's exit IP:

```bash
curl -x http://USER:PASS@HOST:PORT https://ifconfig.co
```

Then from Python, using the same proxy your bot uses:

```python
import os
import requests

PROXY = os.environ["PROXY_URL"]
print(requests.get("https://ifconfig.co/ip", proxies={"https": PROXY}, timeout=10).text)
```

The printed address must match the IP in your broker console exactly. If your proxy exits over IPv6, register the IPv6 address, not an IPv4 one. Zerodha's FAQ notes that orders are rejected when traffic goes out over IPv6 but only an IPv4 address is whitelisted.

## Troubleshooting

- **Orders rejected, data calls fine.** The order call left from the wrong IP. Print the egress IP from inside the bot process.
- **Worked yesterday, fails today.** Often an expired session token, not the IP. Most broker tokens are valid for one day. Log in again before blaming the IP.
- **Console won't save the IP.** It may already be registered to another client, or you may have used this week's change.
- **Order placement parameters.** Symbols, tokens and product codes must come from your broker's instrument master and API docs.

## Broker-specific guides

- [Zerodha Kite Connect through a proxy](18-zerodha-kite-connect-proxy.md)
- [Upstox API through a proxy](19-upstox-api-proxy.md)
- [Angel One SmartAPI through a proxy](20-angel-one-smartapi-proxy.md)
- [Fyers API through a proxy](21-fyers-api-proxy.md)
- [Flattrade Noren API through a proxy](22-flattrade-noren-api-proxy.md)
- [Dhan API through a proxy](29-dhan-api-proxy.md)
- [Kotak Neo Trade API through a proxy](30-kotak-neo-api-proxy.md)
- [ICICI Direct Breeze API through a proxy](31-icici-breeze-api-proxy.md)
- [Shoonya (Finvasia) API through a proxy](32-shoonya-finvasia-api-proxy.md)
- [Samco Trade API through a proxy](33-samco-trade-api-proxy.md)

## Using a dedicated static IP

Any server or proxy with a fixed public IP that only you use will satisfy the broker check. TrueIP provides [dedicated static IPs for algo trading](https://www.trueip.in/algo-static-ip/?utm_source=github&utm_medium=guides) from Mumbai, on its own routed address range, delivered as an authenticated HTTP proxy with its own host, port, username and password. Each IP belongs to one account, is never shared or rotated, and stays the same on renewal. IPv6 is ₹50 a month and IPv4 ₹200 a month, plus 18% GST.

## Sources

- https://www.sebi.gov.in/legal/circulars/feb-2025/safer-participation-of-retail-investors-in-algorithmic-trading_91614.html
- https://www.sebi.gov.in/sebi_data/attachdocs/feb-2025/1738665456458.pdf
- https://www.sebi.gov.in/legal/circulars/sep-2025/extension-of-timeline-for-implementation-of-sebi-circular-dated-february-04-2025-on-safer-participation-of-retail-investors-in-algorithmic-trading-_96979.html
- https://nsearchives.nseindia.com/web/sites/default/files/inline-files/FAQ_Retail_Algo_03112025_NSE.pdf
- https://support.zerodha.com/category/trading-and-markets/general-kite/kite-api/articles/static-ip
- https://support.zerodha.com/category/trading-and-markets/general-kite/kite-api/articles/kite-connect-api-faqs
- https://upstox.com/developer/api-documentation/announcements/algo-trading-circular/
- https://www.angelone.in/news/market-updates/what-s-changing-in-angel-one-s-smartapi-access-from-april-1-2026
- https://smartapi.angelone.in/smartapi/forum/topic/5352/static-ip-based-api-keys-now-live-old-flow-still-supported-temporarily
- https://support.fyers.in/portal/en/kb/articles/how-do-i-activate-the-new-app-for-api-trading-after-april-1-2026
- https://flattrade.in/support/knowledge-base/why-are-my-api-orders-getting-rejected-due-to-invalid-ip-address/
- https://flattrade.in/support/knowledge-base/can-a-client-register-a-backup-static-ip/
- https://flattrade.in/support/knowledge-base/how-many-times-can-static-ip-information-be-updated/

_Maintained by [TrueIP](https://www.trueip.in/?utm_source=github&utm_medium=guides). Last checked 31 October 2026._
