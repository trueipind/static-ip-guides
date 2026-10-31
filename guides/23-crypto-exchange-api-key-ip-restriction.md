# Restrict a crypto exchange API key to one IP address

Your trading bot holds an API key that can place orders. If that key leaks from a log file, a Git commit or a shared laptop, anyone can use it from anywhere, unless the exchange only accepts it from your IP. Binding the key to a fixed outbound IP is the single most useful setting on an exchange key. The short version: get one IP that never changes, send every exchange call through it (REST and websockets), and paste that IP into the key's restriction field.

## Why home broadband makes this hard

Most exchanges check the source IP of every signed request against the list on the key. On Jio or Airtel home broadband your public IP can change after a router restart, a power cut or a line reset, and many connections sit behind carrier-grade NAT, so the IP you see is shared with other subscribers. Every change means your bot starts failing with an "IP not whitelisted" error until you edit the key.

There is also a dual-stack trap. If your machine has both IPv4 and IPv6, the operating system may pick IPv6 for one request and IPv4 for the next. You whitelist one, and half your calls fail. Routing the bot through a single proxy with a known address removes the guesswork.

## Exchange-by-exchange notes

These are taken from each exchange's own documentation. Check your exchange's API page before you rely on them, because limits and wording change.

- **Binance.** Binance recommends restricting keys to trusted IPs. Its FAQ says a key without an IP restriction gets read-only access (unless you use self-generated Ed25519 or RSA keys), and that turning on withdrawal permission needs an IP restriction in IPv4 format. Keys with no IP whitelist that stay inactive for 30 days may be deleted. Use an IPv4 address here.
- **Delta Exchange India.** Any key with trading permission needs whitelisted IPs. Delta accepts both IPv4 and IPv6, entered as a comma-separated list. A request from the wrong IP comes back with the code `ip_not_whitelisted_for_api_key`. The India production base URL is `https://api.india.delta.exchange`.
- **WazirX.** WazirX recommends IP restrictions on keys. A call from an address that is not on the list returns error `2128` ("This IP has not been whitelisted for the API key").
- **CoinDCX.** IP binding is optional and is chosen when you create the key. The key binds to the IP of the device creating it. So create the key from a browser that is already going out through your fixed IP, otherwise it gets locked to your home connection.
- **Bybit and OKX.** Bybit keys with no IP bound expire after 90 days. OKX deletes trade or withdraw keys with no IP binding after 14 days of inactivity, and allows up to 20 IPs per key.

On IPv6: in our own test from Mumbai on 29 October 2026, the Binance, Bybit and WazirX APIs did not answer over IPv6, while OKX, Delta and CoinDCX did. For the first three, plan on a static IPv4.

## Step by step

1. Get a fixed outbound IP (a proxy or a server with a static IP).
2. Confirm what the exchange will see:

```bash
# this is the address to paste into the key
curl -x http://USER:PASS@HOST:PORT https://ifconfig.co
```

3. Create or edit the API key, tick the IP restriction option, and paste that address.
4. Point your bot at the proxy for both REST and websocket traffic (code below).
5. Make one signed read-only call, such as fetching balances, before you allow trading.

## ccxt (Python and JavaScript)

ccxt has separate properties for REST and websockets. Setting `httpsProxy` alone only covers REST calls. If you use ccxt pro streams, set `wssProxy` as well, or your websocket connects from your home IP and the exchange may reject it.

```python
import ccxt

ex = ccxt.binance({
    "apiKey": "YOUR_KEY",
    "secret": "YOUR_SECRET",
})
# rest calls go out through the fixed ip
ex.httpsProxy = "http://USER:PASS@HOST:PORT"
# websocket streams (ccxt pro) need their own setting
ex.wssProxy = "http://USER:PASS@HOST:PORT"

print(ex.fetch_balance()["total"])
```

```javascript
import ccxt from 'ccxt';

const ex = new ccxt.binance({ apiKey: 'YOUR_KEY', secret: 'YOUR_SECRET' });
// rest calls
ex.httpsProxy = 'http://USER:PASS@HOST:PORT';
// websocket streams
ex.wssProxy = 'http://USER:PASS@HOST:PORT';

const balance = await ex.fetchBalance();
console.log(balance.total);
```

Set only one of `httpProxy` or `httpsProxy`, not both. Do not use ccxt's `proxyUrl` for this. It prepends a URL for CORS-style redirects and is not a forward proxy. The ccxt manual shows proxy URLs without credentials; putting `user:pass@` in the URL is standard URL syntax, but test it with a balance call before trusting it.

## python-binance

python-binance (a community library, not Binance's own) passes a `proxies` dict to `requests`:

```python
from binance.client import Client

proxies = {
    "http": "http://USER:PASS@HOST:PORT",
    "https": "http://USER:PASS@HOST:PORT",
}
# every rest request from this client uses the fixed ip
client = Client("YOUR_KEY", "YOUR_SECRET", {"proxies": proxies})
print(client.get_account()["balances"][:3])
```

Binance's own `binance-connector` Spot client also accepts `proxies={'https': ...}` in its constructor.

## How to check it worked

- Run the `curl` command above from the same machine as the bot. The IP printed must match the key.
- Make a signed call. If you get Delta's `ip_not_whitelisted_for_api_key` or WazirX `2128`, your request is leaving from somewhere else. Usually that is a websocket or a second HTTP client that skipped the proxy.
- Check that your bot does not read `HTTPS_PROXY` from one place and a hard-coded proxy from another. One source of truth is easier to debug.

## Permissions hygiene

An IP restriction limits where a key works. It does not limit what it can do. Keep the rest tight as well:

- Give the bot key only the permissions it needs. Trading bots rarely need withdrawals. Leave that off.
- Use a separate key per bot or strategy, so you can revoke one without stopping the others.
- Keep keys in environment variables or a secrets file outside the repo, never in code.
- Rotate keys when someone leaves the team or a laptop is lost, even with an IP restriction in place.

## This is not a way around restrictions

A fixed IP is for locking your own key to your own system. It is not a way around an exchange's terms, its country restrictions, or Indian regulation. Crypto service providers serving Indian users must register with FIU-IND, which has acted against unregistered offshore exchanges. Use exchanges in line with Indian law.

## Using a dedicated static IP

Any fixed-IP proxy, or a server with a static IP, works for binding exchange keys. TrueIP sells [dedicated static IPs for exchange API keys](https://www.trueip.in/static-ip-crypto-exchange-api/?utm_source=github&utm_medium=guides) from Mumbai, delivered as an authenticated HTTP proxy, one IP per account and never rotated. IPv6 costs ₹50 a month and IPv4 ₹200 a month (plus 18% GST); pick IPv4 for Binance, Bybit and WazirX.

## Sources

- https://www.binance.com/en/support/faq/how-to-create-api-keys-on-binance-360002502072
- https://www.binance.com/en/blog/security/how-to-use-an-api-key-securely-5-tips-from-binance-8638066848800196896
- https://docs.delta.exchange/
- https://community.delta.exchange/t/ip-not-whitelisted-error-in-delta-exchange-api-even-after-adding-ip/689
- https://docs.wazirx.com/
- https://coindcx.com/api/help/API%20Dashboard/Generation%20of%20Key%20and%20Secret
- https://bybit-exchange.github.io/docs/faq
- https://www.okx.com/en-us/help/api-faq
- https://github.com/ccxt/ccxt/blob/master/wiki/Manual.md#proxy
- https://python-binance.readthedocs.io/en/latest/overview.html
- https://binance-connector.readthedocs.io/en/stable/getting_started.html
- https://fiuindia.gov.in/pdfs/AML_legislation/AMLCFTguidelines10032023.pdf

_Maintained by [TrueIP](https://www.trueip.in/?utm_source=github&utm_medium=guides). Last checked 31 October 2026._
