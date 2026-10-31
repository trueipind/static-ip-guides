# Static IP and IP whitelisting guides

Practical guides for getting an API, broker, exchange or business app to accept your requests from one fixed IP address. Each one covers:
- why the IP check fails;
- how to find the address the platform actually sees;
- working code to send your calls through a fixed IP;
- how to check it worked, and what to do when it doesn't.

They're written for developers and traders in India, but most of it applies anywhere. The code uses placeholders (`USER:PASS@HOST:PORT`), so it works with any authenticated HTTP proxy or server with a static IP.

Maintained by [TrueIP](https://www.trueip.in/?utm_source=github&utm_medium=guides). Corrections and pull requests are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md).

## Basics

| Guide | What it solves |
|---|---|
| [What is IP whitelisting and why does it break?](guides/01-what-is-ip-whitelisting.md) | What an allowlist checks, and why your requests suddenly fail |
| [Find your outbound IP address](guides/02-find-your-outbound-ip.md) | The address an API actually sees, from a laptop, VPS, container or serverless function |
| [CGNAT explained](guides/03-cgnat-explained.md) | Why many home connections in India can't be whitelisted |
| [IPv4 vs IPv6 allowlists](guides/04-ipv4-vs-ipv6-allowlists.md) | Which platforms accept IPv6, and how to test yours |
| [Random "IP not whitelisted" errors on a dual-stack server](guides/05-dual-stack-ip-mismatch.md) | Calls going out over the address you didn't whitelist |
| [How to fix "IP not whitelisted" errors](guides/06-fix-ip-not-whitelisted-errors.md) | A step-by-step check for 401 and 403 IP errors |

## Proxy setup by language and platform

| Guide | Covers |
|---|---|
| [Python requests](guides/07-python-requests-proxy.md) | requests, httpx, aiohttp, env vars, special characters in passwords |
| [Node.js](guides/08-nodejs-proxy.md) | axios, native fetch / undici, ws |
| [curl and proxy env vars](guides/09-curl-and-proxy-env-vars.md) | `-x`, `HTTPS_PROXY`, `NO_PROXY`, which tools read what |
| [Java](guides/10-java-httpclient-proxy.md) | HttpClient, OkHttp, the Basic-auth tunnelling gotcha |
| [Go](guides/11-go-http-proxy.md) | net/http Transport, `ProxyFromEnvironment` |
| [.NET](guides/12-dotnet-httpclient-proxy.md) | HttpClient, WebProxy, IHttpClientFactory |
| [PHP](guides/13-php-curl-guzzle-proxy.md) | cURL, Guzzle, Laravel HTTP client |
| [Docker and Kubernetes](guides/14-docker-kubernetes-fixed-egress.md) | Fixed outbound IP for containers and pods |
| [Serverless](guides/15-serverless-fixed-outbound-ip.md) | AWS Lambda, Vercel, Cloudflare Workers |
| [WebSockets through a proxy](guides/16-websockets-through-http-proxy.md) | `wss://` streams in Python and Node |

## Indian broker APIs (algo trading)

| Guide | Covers |
|---|---|
| [Static IP for Indian broker APIs](guides/17-indian-broker-api-static-ip.md) | The SEBI static IP rule, what to register, IPv4 or IPv6 |
| [Zerodha Kite Connect](guides/18-zerodha-kite-connect-proxy.md) | kiteconnect through a proxy |
| [Upstox](guides/19-upstox-api-proxy.md) | upstox-python-sdk, including the proxy-auth fix |
| [Angel One SmartAPI](guides/20-angel-one-smartapi-proxy.md) | SmartConnect through a proxy |
| [Fyers](guides/21-fyers-api-proxy.md) | fyers-apiv3 through a proxy |
| [Flattrade (Noren)](guides/22-flattrade-noren-api-proxy.md) | NorenRestApiPy through a proxy |

## Payments, compliance and business apps

| Guide | Covers |
|---|---|
| [Crypto exchange API keys](guides/23-crypto-exchange-api-key-ip-restriction.md) | Binance, Delta Exchange, WazirX, CoinDCX, ccxt |
| [Payout API IP whitelisting](guides/24-payout-api-ip-whitelisting.md) | RazorpayX, Cashfree, PayU, Decentro |
| [GST e-invoice API](guides/25-gst-einvoice-api-static-ip.md) | NIC direct access, Indian static IPs, e-way bill |
| [SMPP through an HTTP proxy](guides/26-smpp-through-http-proxy.md) | socat and ncat tunnels for SMS gateways (not SIP) |
| [Team access to IP-restricted apps](guides/27-team-access-ip-restricted-apps.md) | Zoho, Microsoft 365, Google Workspace, Tally |
| [Proxy troubleshooting](guides/28-proxy-troubleshooting.md) | 407, 403, timeouts and TLS errors |

## How these guides are checked

- **Sources:** every platform-specific claim is taken from official documentation, and each guide lists its sources at the end. Platforms change their rules, so check the date at the bottom of each guide and confirm anything critical with the platform.
- **Checks:** `node scripts/check.mjs` lints every guide for structure, links and placeholders.

## License

MIT. See [LICENSE](LICENSE). Reuse the code freely.
