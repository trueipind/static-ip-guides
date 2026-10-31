# Random "IP not whitelisted" errors on a dual-stack server

Your API calls work most of the time, then some fail with "IP not whitelisted", and nothing in your code changed. A frequent cause is a dual-stack machine (one with both IPv4 and IPv6) sending some requests over IPv6 while you whitelisted only the IPv4 address, or the other way round. The short answer: confirm which family each request uses, then either force IPv4 in your client, whitelist both addresses if the platform accepts both, or send every whitelisted call through one proxy with one outgoing address.

## Why it happens

When your code connects to `api.example.com`, the system resolver looks up both A (IPv4) and AAAA (IPv6) records. If both exist and your machine has a working IPv6 route, many systems try IPv6 first. Some clients race the two families and use whichever connects first. The result can change from one connection to the next: a slow IPv6 path, a DNS answer that briefly lacks an AAAA record, a reconnect after a network blip.

The provider sees your IPv6 address on some calls and your IPv4 address on others. If only one is on the list, a fraction of calls fail. Delta Exchange's community forum describes this exact pattern: IPv4 whitelisted, requests arriving over IPv6.

## How to detect it

### Compare your two addresses

```bash
# your outbound ipv4
curl -4 https://ifconfig.co
# your outbound ipv6 (an error here means no ipv6 route)
curl -6 https://ifconfig.co
```

If both print an address, you are dual-stack. Check which one is on the provider's list.

### Check whether the API publishes IPv6

```bash
# any output means the api can be reached over ipv6
dig +short AAAA api.example.com
```

If the API has an AAAA record and you are dual-stack, your client may well use IPv6 for it.

### Read the error and your logs

Some providers include the source IP they saw in the error body or in their dashboard's API log. If it is an IPv6 address (it contains colons), that's your answer. In your own logs, record the provider's full error response next to the time of each failure. Failures that cluster after network changes point the same way.

## Force IPv4 in curl

```bash
# resolve and connect over ipv4 only
curl -4 https://api.example.com/v1/ping
```

`-4` (`--ipv4`) makes curl request only IPv4 addresses when resolving hostnames. Use this in cron jobs and shell scripts that call whitelisted APIs.

## Force IPv4 in Node.js

Node's `http.request` and `https.request` accept a `family` option. Setting it to `4` resolves the host over IPv4 only:

```javascript
import https from 'node:https';

// this request can only use ipv4
https.get('https://api.example.com/v1/ping', { family: 4 }, (res) => {
  console.log(res.statusCode);
});
```

For a process-wide preference, `dns.setDefaultResultOrder('ipv4first')` changes the order `dns.lookup()` returns addresses in, and the networking APIs that resolve through `dns.lookup()` follow it:

```javascript
import dns from 'node:dns';

// prefer ipv4 addresses when both exist
dns.setDefaultResultOrder('ipv4first');
```

This sets a preference, not a hard rule. If the IPv4 attempt fails, a client may still fall back to IPv6. The same order can be set with the `--dns-result-order=ipv4first` flag. Note that it does not carry over into worker threads; call it in each worker. Since Node 17 the default order is `verbatim`, meaning whatever the resolver returned.

## Python requests

`requests` and `urllib3` do not document an option to force IPv4. You will find snippets online that patch urllib3 internals. They rely on undocumented behaviour and can break on upgrade, so we don't recommend them. Safer choices:

- **Send the calls through a proxy** (next section). This is the cleanest fix in Python.
- **Prefer IPv4 system-wide on Linux** with `/etc/gai.conf`, which controls how glibc sorts addresses. Raising the precedence of `::ffff:0:0/96` makes IPv4 sort first. Be careful: a single `precedence` line replaces the whole default table, so copy every default line from `man gai.conf` and change only that one value.
- **Disable IPv6 on the machine or interface,** if you really don't need it. This affects everything on the server, so check other services first.

## A single proxy removes the problem

When your client talks to an HTTP proxy, the proxy opens the connection to the API. The provider sees the proxy's outgoing address, whatever family your machine used to reach the proxy. If the proxy has one fixed IPv4 address, every request arrives from that address.

```bash
# every request leaves from the proxy's fixed ip
curl -x http://USER:PASS@HOST:PORT https://ifconfig.co
```

In Python:

```python
import requests

proxy = "http://USER:PASS@HOST:PORT"
proxies = {"http": proxy, "https": proxy}

# should print the proxy's ip every time
for _ in range(5):
    print(requests.get("https://ifconfig.co", proxies=proxies, timeout=10).text.strip())
```

HTTPS stays encrypted end to end. The proxy only relays the bytes through a CONNECT tunnel. See [using a proxy with Python requests](07-python-requests-proxy.md) and [using a proxy in Node.js](08-nodejs-proxy.md) for full setups.

## How to check it worked

- Run the check above 20 or 30 times in a loop. Every line should print the same address.
- Make signed calls over a few hours, including across a router or network restart. Failures should stop.
- Make sure websockets and background jobs use the same path. A second client that connects directly brings the problem back.

## Whitelisting both addresses

If the platform accepts IPv6 (Delta Exchange does, for example), you can add both your IPv4 and IPv6 addresses. That works only while both stay fixed. Many IPv6 prefixes on home and some cloud connections can change, so check that yours is static first. See [IPv4 vs IPv6 in allowlists](04-ipv4-vs-ipv6-allowlists.md).

## Using a dedicated static IP

Any fixed-IP proxy, or a server with only one static outgoing address, ends the IPv4 and IPv6 guessing. TrueIP offers [dedicated static IPs for exchange and API keys](https://www.trueip.in/static-ip-crypto-exchange-api/?utm_source=github&utm_medium=guides) from Mumbai as an authenticated HTTP proxy, one IP per account and never rotated, so every whitelisted call leaves from the same address. IPv4 is ₹200 a month and IPv6 ₹50 a month, plus 18% GST.

## Sources

- https://curl.se/docs/manpage.html
- https://nodejs.org/api/http.html#httprequestoptions-callback
- https://nodejs.org/api/dns.html#dnssetdefaultresultorderorder
- https://man7.org/linux/man-pages/man5/gai.conf.5.html
- https://requests.readthedocs.io/en/latest/user/advanced/#proxies
- https://docs.delta.exchange/
- https://community.delta.exchange/t/ip-not-whitelisted-error-in-delta-exchange-api-even-after-adding-ip/689
- https://www.rfc-editor.org/rfc/rfc9110#section-9.3.6

_Maintained by [TrueIP](https://www.trueip.in/?utm_source=github&utm_medium=guides). Last checked 31 October 2026._
