# Troubleshoot an authenticated HTTP proxy: 407, 403, timeouts and TLS errors

You set up a fixed-IP proxy so an API would accept your requests, and something still fails. The trick is to work out which hop is complaining: your client, the proxy, or the target API. Each fails differently, and `curl -v` shows you which. Below are the common errors in the order you usually meet them.

## Start with one verbose curl

Before touching your code, run this from the same machine as your app:

```bash
curl -v -x http://USER:PASS@HOST:PORT https://ifconfig.co
```

A healthy run looks roughly like this (exact wording depends on the curl version and the proxy):

```text
* Connected to HOST (x.x.x.x) port PORT
* Establish HTTP proxy tunnel to ifconfig.co:443
> CONNECT ifconfig.co:443 HTTP/1.1
> Proxy-Authorization: Basic ...
< HTTP/1.1 200 Connection established
* SSL connection using TLSv1.3 ...
< HTTP/2 200
203.0.113.10
```

The first line is your machine reaching the proxy. The `CONNECT` and its `200` are the proxy opening a tunnel. After that comes TLS with the real site, and the last line is the IP the world sees. Where the output stops is where your problem is.

## 407 Proxy Authentication Required

```text
< HTTP/1.1 407 Proxy Authentication Required
curl: (56) CONNECT tunnel failed, response 407
```

The proxy rejected your credentials, or never got them. Common causes:

- **Typo or old password.** Copy the credentials again.
- **Special characters in the password.** In a URL, `@`, `:`, `/`, `#` and `%` have meanings. A password like `p@ss:1` breaks the URL. Either percent-encode it (`p%40ss%3A1`), or pass credentials separately so no encoding is needed:

```bash
# credentials outside the url, no encoding needed
curl -v -x http://HOST:PORT --proxy-user 'USER:PASS' https://ifconfig.co
```

```python
from urllib.parse import quote

# encode user and password before building the proxy url
proxy = f"http://{quote('USER', safe='')}:{quote('PASS', safe='')}@HOST:PORT"
```

- **Java clients.** Java disables Basic authentication for HTTPS tunnels by default, so you get a 407 with perfectly good credentials. Start the JVM with `-Djdk.http.auth.tunneling.disabledSchemes=` and register an `Authenticator`.
- **Browsers.** Chrome ignores credentials placed in proxy settings and shows a sign-in prompt. If the prompt is cancelled, every request returns 407.

## 403 or "IP not whitelisted" from the target

If `curl -v` shows `200 Connection established` and then the API returns 403 or its own error code, the proxy worked and the API refused your IP. See [fixing IP not whitelisted errors](06-fix-ip-not-whitelisted-errors.md) for platform-specific codes. Check three things:

1. **Is the IP on the allowlist exactly?** Compare the `ifconfig.co` output with what you saved on the platform, character by character. Watch for a /32 vs /128 or a missing range.
2. **Is it the right IP family?** If your proxy exits on IPv6 and the platform only accepts IPv4 (or the reverse), it will never match. `curl -6` or `curl -4` alone will not help here, because those flags only affect how curl reaches the proxy, not how the proxy reaches the site.
3. **Did the change take effect?** Some platforms take time to apply allowlist changes.

## Connection refused, timeouts and CONNECT failures

```text
curl: (7) Failed to connect to HOST port PORT
curl: (5) Could not resolve proxy: HOST
curl: (28) Connection timed out
```

These happen before the proxy says anything:

- **Could not resolve proxy.** Wrong proxy hostname or broken DNS. Check with `nslookup HOST`.
- **Failed to connect or timed out.** Wrong port, a firewall on your side, or the proxy is down. Try `nc -vz HOST PORT`.
- **CONNECT returns 403, 502 or 504.** The proxy reached its own limits: the target port may not be allowed (some proxies only allow 443), or the proxy could not reach the target. Test a known site on 443 first, then your real target.

## Where DNS gets resolved

With an HTTP proxy, your client does not resolve the target's name. For an `https://` URL, curl sends `CONNECT api.example.com:443` and the proxy looks up the name. For a plain `http://` URL, curl sends the full URL and the proxy resolves it too. Only the proxy's own hostname must resolve locally.

The `socks5h://` versus `socks5://` difference (remote vs local DNS) only applies to SOCKS proxies, not HTTP ones.

## TLS and certificate errors

```text
curl: (60) SSL certificate problem: unable to get local issuer certificate
```

- **Corporate networks that inspect HTTPS.** Some office firewalls intercept TLS with their own certificate. Try a phone hotspot. If it works there, talk to your IT team rather than turning off verification.
- **Wrong server name when tunnelling.** If you use a local tunnel (socat or ncat) and connect to `127.0.0.1`, the TLS server name and the certificate check point at the wrong host. Set the client's TLS server name to the real hostname, or use a hosts-file entry. See [the SMPP tunnel guide](26-smpp-through-http-proxy.md).
- **Never fix this with `-k` or `verify=False` in production.**

## Works in curl, not in my app

This almost always comes down to which proxy the app really uses:

- **Environment variables.** Many tools read `HTTPS_PROXY`, `HTTP_PROXY` and `NO_PROXY`. Your shell has them, but your systemd service, cron job or Docker container may not. Print the outbound IP from inside the app's own runtime. [The curl and proxy environment variables guide](09-curl-and-proxy-env-vars.md) covers which tools read which variable.
- **NO_PROXY.** If the API's domain matches an entry in `NO_PROXY`, the request goes direct and leaves from your own IP.
- **Python requests.** A session with `trust_env = True` (the default) can pick up environment proxies. Set `session.proxies` explicitly, and set `trust_env = False` if you want only that. See [the Python requests guide](07-python-requests-proxy.md).
- **Node.js.** The built-in `fetch` only reads `HTTPS_PROXY` when started with `NODE_USE_ENV_PROXY=1` (Node 24 and 22.21 onwards). Otherwise pass a proxy agent per request. See [the Node.js guide](08-nodejs-proxy.md).
- **Websockets.** Many SDKs use a second client for streams. Configure both.

## Rate limits and connection caps

Proxies often cap connections or bandwidth per account to stop abuse. Symptoms are intermittent 429 or 503 responses, resets under load, or slow downloads. Reuse connections (one session or keep-alive agent, not a new client per request) and cap concurrency. The target API also rate-limits by IP, and everything behind one fixed IP shares that budget.

## Checklist

1. `curl -v -x http://USER:PASS@HOST:PORT https://ifconfig.co` from the app's machine. Note where it stops.
2. Fix 407s with clean credentials (`--proxy-user` or percent-encoding).
3. Compare the printed IP with the platform allowlist, including the IPv4 or IPv6 family.
4. Repeat against your real API host and port.
5. Print the outbound IP from inside the app itself, not from your shell.
6. Check `NO_PROXY`, `trust_env` and any second client (websockets, SDK internals).
7. Only then look at rate limits and the platform's own error codes.

## Using a dedicated static IP

These steps apply to any authenticated HTTP proxy or fixed-IP server. TrueIP provides [dedicated static IPs for API whitelisting](https://www.trueip.in/static-ip-for-api-whitelisting/?utm_source=github&utm_medium=guides) from Mumbai as an authenticated HTTP proxy (HTTP and HTTPS CONNECT, outgoing only) with its own host, port, username and password. Each account has per-account connection and bandwidth limits and SMTP port 25 blocked, which is worth knowing when you read the errors above.

## Sources

- https://curl.se/docs/manpage.html
- https://everything.curl.dev/usingcurl/proxies/http.html
- https://www.rfc-editor.org/rfc/rfc9110#section-9.3.6
- https://www.rfc-editor.org/rfc/rfc9110#section-15.5.8
- https://www.oracle.com/java/technologies/javase/8u111-relnotes.html
- https://chromium.googlesource.com/chromium/src/+/main/net/docs/proxy.md
- https://requests.readthedocs.io/en/latest/user/advanced/#proxies
- https://nodejs.org/api/cli.html#node_use_env_proxy1

_Maintained by [TrueIP](https://www.trueip.in/?utm_source=github&utm_medium=guides). Last checked 31 October 2026._
