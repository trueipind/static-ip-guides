# Use the Shoonya (Finvasia) API through a proxy with a static IP

Shoonya accepts API requests only from IP addresses you've registered against your client ID, and unlike most brokers this covers login and every endpoint, not just orders. If your bot runs on home broadband or a server without a fixed IP, route Shoonya's official Python client through an authenticated proxy and register the proxy's exit IP. The client uses `requests` and `websocket-client`, which both read the standard proxy environment variables. Shoonya's API host `api.shoonya.com` is reachable only over IPv4, so use an IPv4 address.

## What Shoonya checks

From Shoonya's IP whitelisting guide:

- Shoonya only accepts authenticated API requests from IP addresses registered against your client ID. The IP must be whitelisted before the OAuth login works or before you call any endpoint.
- You set one **Primary IP Address** and an optional **Backup IP Address** for a failover server.
- The fields accept IPv4 and IPv6. IPv4 works on the `api.shoonya.com` domain. For an IPv6 server, the docs say to change the authorize URL to `trade.shoonya.com`.

Shoonya's docs describe the IP fields as something you can update yourself, while a Shoonya blog post (27 July 2026) says the IP is "changed only through the broker". Neither states a weekly limit. The same blog post says immediate family (self, spouse, dependent children, dependent parents) can share one IP with the broker's written consent.

The wider background is in [static IP for Indian broker APIs](17-indian-broker-api-static-ip.md).

## Why IPv4 is the safer choice here

The official client sends REST and WebSocket traffic to `api.shoonya.com`. That host has no IPv6 address:

```bash
dig +short api.shoonya.com AAAA    # empty: no ipv6
dig +short trade.shoonya.com AAAA  # has ipv6
```

The docs only describe moving the authorize step to `trade.shoonya.com` for IPv6. They don't say the REST and streaming endpoints move too, and an IPv6-only exit can't reach `api.shoonya.com` at all. An IPv4 address avoids the question.

## Step by step

1. Get an IPv4 proxy: host, port, username, password.
2. Check its exit IP with curl (below).
3. Log in to Shoonya web, click the profile icon, then **API Key Generation**. Confirm the client ID, reveal the secret code, enter the address as **Primary IP Address** (and a backup if you have one), then click **Update**.
4. Get the official OAuth client. The Python SDK page in Shoonya's docs links the `Shoonya_API_OAuth` repository; install its library with `pip install NorenRestApiOAuth` and use the repository's `api_helper.py`. The older `ShoonyaApi-py` repository is no longer current.
5. Set the proxy variables before the login, because the login is IP checked too.

## Code

```python
import os

PROXY = os.environ["PROXY_URL"]  # http://USER:PASS@HOST:PORT
for v in ("HTTPS_PROXY", "HTTP_PROXY"):
    os.environ[v] = PROXY  # rest calls (requests) and the websocket (websocket-client) read these

from api_helper import NorenApiPy  # from the official Shoonya_API_OAuth repository

api = NorenApiPy()
# 1. open this url in a browser, log in, and copy the auth code from the redirect
print(api.getOAuthURL("https://api.shoonya.com/OAuthlogin/authorize/oauth", os.environ["SHOONYA_CLIENT_ID"]))
# 2. exchange the code for a token through the proxy
access_token, uid, refresh_token, actid = api.getAccessToken(
    os.environ["SHOONYA_AUTH_CODE"], os.environ["SHOONYA_SECRET_CODE"], os.environ["SHOONYA_CLIENT_ID"], os.environ["SHOONYA_UID"]
)
api.injectOAuthHeader(access_token, uid, actid)
print(api.get_limits())
```

The token exchange in step 2 and every call after it go through the proxy. The browser step in step 1 doesn't; Shoonya's docs don't say whether the browser's IP is checked. If your login fails at the authorize step, try it from a browser set to use the same proxy.

The library calls `requests.post` directly and has no proxy option of its own, which is why this guide uses environment variables. Run the bot in its own process so the proxy doesn't apply to other programs.

## How to check it worked

```bash
curl -x http://USER:PASS@HOST:PORT https://ifconfig.co
```

The address must match the primary or backup IP on your Shoonya profile.

## Troubleshooting

**Login fails with an auth or IP error.** On Shoonya the login is checked too. Make sure the proxy variables are set before `getAccessToken`, and that the exit IP matches.

**IPv6 server fails at the authorize step.** The authorize URL still points to `api.shoonya.com`. Shoonya's docs say to use `trade.shoonya.com` for IPv6, but the simpler fix is an IPv4 exit.

**Connection errors on every call over an IPv6 proxy.** Expected: `api.shoonya.com` has no IPv6 address.

**407 Proxy Authentication Required.** Wrong proxy credentials, or special characters in the password that need URL encoding. See [use a proxy with Python requests](07-python-requests-proxy.md).

## Using a dedicated static IP

Any proxy or server with a fixed public IPv4 address that only you use works with Shoonya. TrueIP offers [dedicated static IPs for algo trading](https://www.trueip.in/algo-static-ip/?utm_source=github&utm_medium=guides) from Mumbai, delivered as an authenticated HTTP proxy with its own host, port, username and password. For Shoonya, take the IPv4 option at ₹200 a month plus 18% GST. Each IP belongs to one account and stays the same on renewal.

## Sources

- https://shoonya.com/api-documentation/ip-whitelisting
- https://shoonya.com/api-documentation/python-sdk
- https://shoonya.com/blog/sebi-algo-trading-rules/
- https://github.com/Shoonya-API-OAuth-Python/Shoonya_API_OAuth
- https://pypi.org/project/NorenRestApiOAuth/
- https://requests.readthedocs.io/en/latest/user/advanced/#proxies

_Maintained by [TrueIP](https://www.trueip.in/?utm_source=github&utm_medium=guides). Last checked 14 November 2026._
