# Use the Dhan API (DhanHQ) through a proxy with a static IP

Dhan accepts API orders only from a static IP you have registered on your Dhan account. If your bot runs on home broadband or a server whose IP you don't control, send the official `dhanhq` Python client through an authenticated proxy with a fixed IP and register that IP with Dhan. The client has no proxy argument, but it uses `requests`, which reads the standard proxy environment variables. Dhan accepts both IPv4 and IPv6 addresses.

## What Dhan checks

From Dhan's API docs, support pages and staff posts on MadeForTrade, Dhan's community:

- Static IP registration became mandatory for API orders on 1 April 2026.
- Only order placement APIs are checked: orders, Super Orders and Forever Orders. Fetching order or trade details needs no whitelisted IP.
- You can set a primary and a secondary IP. Orders from either are accepted.
- Once an IP is set, it can't be changed for 7 days.
- Both IPv4 and IPv6 formats are accepted.
- Orders from Dhan Cloud deployments don't need a static IP.

Dhan's docs say each individual needs a unique static IP. A Dhan staff reply on MadeForTrade (6 November 2026) adds that parents, spouse and children can share one IP, linking up to four other accounts, through an offline request to apihelp@dhan.co.

The wider background is in [static IP for Indian broker APIs](17-indian-broker-api-static-ip.md).

## Step by step

1. Get your proxy details: host, port, username, password.
2. Check the exit IP with curl (below) and note it exactly.
3. On web.dhan.co, open **My Profile**, then **Get Trading & Data APIs**, then **Add Static IP**. Enter the address as the primary IP.
4. Generate your access token **after** adding the IP. Dhan's support page says to regenerate the token once if the IP was added after the token was created.
5. Install the client: `pip install dhanhq`.
6. Set the proxy variables and run a test.

You can also set and read the IP through the API: `POST /v2/ip/setIP`, `PUT /v2/ip/modifyIP` and `GET /v2/ip/getIP`, which the SDK exposes as `set_ip`, `modify_ip` and `get_ip` on `DhanLogin`.

## Code

```python
import os

PROXY = os.environ["PROXY_URL"]  # http://USER:PASS@HOST:PORT
for v in ("HTTPS_PROXY", "HTTP_PROXY"):
    os.environ[v] = PROXY  # requests (api.dhan.co and auth.dhan.co) reads these

from dhanhq import DhanContext, DhanLogin, dhanhq

login = DhanLogin(os.environ["DHAN_CLIENT_ID"])
token = login.generate_token(os.environ["DHAN_PIN"], os.environ["DHAN_TOTP"])["accessToken"]
print(login.get_ip(token))  # the primary and secondary ip dhan has on file

ctx = DhanContext(os.environ["DHAN_CLIENT_ID"], token)
dhan = dhanhq(ctx)
```

Set the variables before importing `dhanhq`, in a process that runs only your bot, so other programs on the machine aren't affected. If you prefer to be explicit, `ctx.dhan_http.session.proxies.update({"https": PROXY, "http": PROXY})` sets the proxy on the SDK's `requests` session.

`generate_token` takes your PIN and the current TOTP code. If you generate tokens from Dhan's web console instead, generate them after the IP is registered.

## WebSockets

The SDK's market feed and order update streams use the `websockets` library. It follows the proxy variables only from version 15 onwards, and the SDK allows older versions. Market data doesn't need the whitelisted IP, so this matters only if you want everything to leave from one address. If it does, `pip install -U "websockets>=15"`.

## How to check it worked

```bash
curl -x http://USER:PASS@HOST:PORT https://ifconfig.co
```

Dhan also shows what it sees. In Dhan Web, open **Profile**, **Get Trading & Data API**, then **Sandbox** (top right), **IP Setup**, **Get Static IP**. It lists your primary IP, secondary IP and the **Detected IP**. The detected IP must match one of the other two.

## Troubleshooting

**DH-905 Invalid IP.** The order came from an address that isn't registered. Compare the detected IP in the sandbox with your registered IPs. If you registered the IP after generating the token, generate a new token.

**IP registered in IPv4 but the proxy leaves over IPv6 (or the reverse).** Dhan's order host is reachable over both. Register the address your proxy actually uses, which the curl check above shows.

**"IP address is already in use".** That IP is registered against another Dhan user. Use an IP that only you (and family, through Dhan's process) use.

**Can't change the IP.** You changed it within the last 7 days.

**407 Proxy Authentication Required.** Wrong proxy username or password, or special characters in the password that need URL encoding. See [use a proxy with Python requests](07-python-requests-proxy.md).

## Using a dedicated static IP

Any proxy or server with a fixed public IP that only you use works with Dhan. TrueIP offers [dedicated static IPs for algo trading](https://www.trueip.in/algo-static-ip/?utm_source=github&utm_medium=guides) from Mumbai, delivered as an authenticated HTTP proxy with its own host, port, username and password. Since Dhan accepts IPv6, the IPv6 option at ₹50 a month plus GST works; IPv4 is ₹200 a month plus GST. Each IP belongs to one account and stays the same on renewal.

## Sources

- https://dhanhq.co/docs/v2/authentication/
- https://dhan.co/support/platforms/dhanhq-api/how-to-add-static-ip-on-dhan-for-placing-the-algo-order-s/
- https://dhan.co/support/platforms/dhanhq-api/i-have-added-my-static-ip-s-on-dhan-web-but-my-orders-are-getting-rejected-stating-dh-905-invalid-ip-while-placing-them-through-the-api-what-should-i-do/
- https://dhan.co/support/platforms/dhanhq-api/why-i-am-unable-to-modify-my-ip-address/
- https://dhan.co/support/platforms/dhanhq-api/is-a-static-ip-required-for-dhan-cloud/
- https://madefortrade.in/t/now-live-api-regulatory-changes-on-dhanhq/63385
- https://madefortrade.in/t/static-ip-already-in-use-dhan-api-order-rejection-family-account-linking/95638
- https://github.com/dhan-oss/DhanHQ-py
- https://websockets.readthedocs.io/en/stable/topics/proxies.html

_Maintained by [TrueIP](https://www.trueip.in/?utm_source=github&utm_medium=guides). Last checked 14 November 2026._
