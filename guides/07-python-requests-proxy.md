# Use a proxy with Python requests (with username and password)

Your Python script calls an API that only accepts whitelisted IPs, and you want those calls to leave from a fixed IP through an authenticated HTTP proxy. This guide shows the working setups for `requests` (per call, per session and through environment variables), then `httpx` and `aiohttp`, and how to confirm the egress IP. The short answer for requests: pass `proxies={"http": URL, "https": URL}` on each call, where `URL` is `http://USER:PASS@HOST:PORT`.

## requests: per call

The most predictable way is to pass `proxies` on every request:

```python
import requests

proxy = "http://USER:PASS@HOST:PORT"
proxies = {"http": proxy, "https": proxy}

# every request leaves from the fixed ip
r = requests.get("https://api.example.com/v1/account", proxies=proxies, timeout=15)
print(r.status_code)
```

Notice that the `https` key also uses an `http://` proxy URL. That is correct. The key is the scheme of the site you are calling. The value is how to reach the proxy. For an HTTPS site, requests sends a `CONNECT` to the proxy and then runs TLS straight through the tunnel to `api.example.com`. The proxy relays encrypted bytes and cannot read your API key, request body or response. Certificate checks still happen against the real API server.

Proxy URLs must include the scheme. `USER:PASS@HOST:PORT` on its own will not work.

## requests: on a Session

To set it once for many calls:

```python
import requests

proxy = "http://USER:PASS@HOST:PORT"

s = requests.Session()
s.proxies.update({"http": proxy, "https": proxy})
r = s.get("https://api.example.com/v1/account", timeout=15)
```

There is a catch documented by requests: values in `session.proxies` can be overwritten by proxy environment variables (`HTTP_PROXY`, `HTTPS_PROXY` and so on) if those are set on the machine. If you need certainty, pass `proxies=` on each call, or turn off environment lookup on the session:

```python
s = requests.Session()
# ignore HTTP_PROXY, HTTPS_PROXY, NO_PROXY and .netrc from the environment
s.trust_env = False
s.proxies.update({"http": proxy, "https": proxy})
```

`trust_env = False` also stops requests reading `.netrc` credentials and CA bundle variables from the environment, so check nothing else depends on those.

## requests: environment variables

requests reads the standard variables `http_proxy`, `https_proxy`, `no_proxy` and `all_proxy` (uppercase works too). This is handy when you can't change the code:

```bash
export HTTPS_PROXY="http://USER:PASS@HOST:PORT"
export HTTP_PROXY="http://USER:PASS@HOST:PORT"
# hosts that should not go through the proxy
export NO_PROXY="localhost,127.0.0.1"
python bot.py
```

Watch `NO_PROXY`. If it matches the API host, those calls go direct from your own IP and fail the allowlist. Also be careful with secrets: requests' own docs warn against storing proxy passwords in environment variables or version-controlled files. Prefer a secrets file outside the repo, or your platform's secret store.

## Passwords with special characters

If the proxy password contains `@`, `:`, `/`, `#` or `%`, the URL breaks. URL-encode the username and password with `urllib.parse.quote` and `safe=""`:

```python
from urllib.parse import quote

user = quote("my.user", safe="")
pw = quote("p@ss:w/rd#1", safe="")

# encoded credentials, plain host and port
proxy = f"http://{user}:{pw}@HOST:PORT"
proxies = {"http": proxy, "https": proxy}
```

requests decodes them again before sending the `Proxy-Authorization` header. The same encoded URL works in httpx and aiohttp.

## httpx

In current httpx the argument is `proxy` (singular). Older tutorials use `proxies=`, which current versions no longer accept.

```python
import httpx

# one proxy for http and https traffic
with httpx.Client(proxy="http://USER:PASS@HOST:PORT", timeout=15) as client:
    r = client.get("https://api.example.com/v1/account")
    print(r.status_code)
```

For async code, `httpx.AsyncClient(proxy=...)` takes the same argument. If you need different proxies for different schemes or hosts, httpx uses `mounts` with `httpx.HTTPTransport(proxy=...)`.

httpx also reads `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY` and `NO_PROXY` by default. Pass `trust_env=False` to the client to ignore them.

## aiohttp

aiohttp takes the proxy per request with `proxy=`. Credentials can go in the URL:

```python
import asyncio
import aiohttp

PROXY = "http://USER:PASS@HOST:PORT"

async def main():
    async with aiohttp.ClientSession() as session:
        # https goes through the proxy via connect
        async with session.get("https://api.example.com/v1/account", proxy=PROXY) as r:
            print(r.status)

asyncio.run(main())
```

You will see older examples using `proxy_auth=aiohttp.BasicAuth(...)`. Current aiohttp docs mark `proxy_auth` as deprecated, to be removed in 4.0, so put the credentials in the proxy URL instead. aiohttp does not read proxy environment variables unless you create the session with `trust_env=True`.

## How to check it worked

Ask an outside service which IP it sees, through the same client and settings your code uses:

```python
import requests

proxy = "http://USER:PASS@HOST:PORT"
proxies = {"http": proxy, "https": proxy}

# should print the proxy's fixed ip, not your own
print(requests.get("https://ifconfig.co", proxies=proxies, timeout=10).text.strip())
```

Or from the shell:

```bash
curl -x http://USER:PASS@HOST:PORT https://ifconfig.co
```

Whitelist the printed address, then make one signed read-only call to the real API.

## Troubleshooting

- **`407 Proxy Authentication Required`.** Wrong username or password, or special characters that were not URL-encoded.
- **`ProxyError` or connection refused.** Wrong host or port, or a firewall on your side blocking outbound connections to the proxy port.
- **Some calls still fail with "IP not whitelisted".** Look for a second client (a websocket library, an SDK with its own HTTP stack) that ignores your `proxies` setting, or a `NO_PROXY` entry that matches the API host.
- **Certificate errors.** A plain forwarding proxy using CONNECT does not touch TLS. If you see certificate errors, check for a corporate TLS-inspecting proxy elsewhere on your network.

## Using a dedicated static IP

Any fixed-IP HTTP proxy, or a server with a static IP, works with the code above. TrueIP supplies [dedicated static IPs for API whitelisting](https://www.trueip.in/static-ip-for-api-whitelisting/?utm_source=github&utm_medium=guides) from Mumbai as an authenticated HTTP proxy (HTTP and HTTPS CONNECT, no SOCKS) with its own host, port, username and password, one IP per account and never rotated. IPv6 is ₹50 a month and IPv4 ₹200 a month, plus 18% GST.

## Sources

- https://requests.readthedocs.io/en/latest/user/advanced/#proxies
- https://requests.readthedocs.io/en/latest/api/#requests.Session.trust_env
- https://docs.python.org/3/library/urllib.parse.html#urllib.parse.quote
- https://www.python-httpx.org/advanced/proxies/
- https://www.python-httpx.org/environment_variables/
- https://docs.aiohttp.org/en/stable/client_advanced.html#proxy-support
- https://www.rfc-editor.org/rfc/rfc9110#section-9.3.6

_Maintained by [TrueIP](https://www.trueip.in/?utm_source=github&utm_medium=guides). Last checked 31 October 2026._
