# What is IP whitelisting and why does it break?

A payout API, a broker, an exchange key or an admin panel asks you to "whitelist your IP", and then your requests keep getting rejected. IP whitelisting (also called an IP allowlist) means the service only accepts requests that arrive from addresses on a list you gave it. It checks the public source IP of each connection, not the `192.168.x.x` address your laptop shows. The short fix: send every request from one public address you control and that does not change, and put exactly that address on the list.

## What the allowlist actually checks

When your code calls `https://api.example.com`, the packets leave your machine with a private LAN address such as `192.168.1.5` or `10.0.0.12`. Your router, or your cloud provider's NAT gateway, rewrites that source address to a public one before the traffic goes out on the internet. The remote server only ever sees that public address. It has no idea what your LAN address is.

So the address you paste into a provider's dashboard must be the public source IP, the one a remote server sees. Running `ipconfig` or `ip addr` on your machine usually shows the private address, which is the wrong one. The [guide to finding your outbound IP](02-find-your-outbound-ip.md) shows how to get the right one from a laptop, a VPS, Docker, Kubernetes or a serverless function.

```bash
# the address a remote server sees for this machine
curl https://ifconfig.co
```

There is a second detail. An allowlist is usually for one address family. If you add an IPv4 address and your machine sends the request over IPv6, the provider sees a different address and rejects it. See [IPv4 vs IPv6 in allowlists](04-ipv4-vs-ipv6-allowlists.md).

## Why platforms use it

An API key or password can leak. It ends up in a log file, a Git commit, a screenshot or a shared laptop. If the provider also checks the source IP, a leaked key is much less useful to someone else, because their requests come from a different address.

Some providers make it mandatory for sensitive actions. A few examples from official documentation:

- RazorpayX says it is mandatory to allowlist the IPs you use for payout API requests in Live mode, up to 20 IPs.
- Cashfree Payouts production calls need either a whitelisted IP or public-key signature, and Cashfree accepts only IPv4 for whitelisting.
- Delta Exchange requires whitelisted IPs on any API key with trading permission.
- For direct access to the NIC e-invoice system, NIC whitelists up to 4 Indian static public IP addresses.
- Binance recommends restricting keys to trusted IPs, and enabling withdrawals on a key requires an IPv4 restriction.

## How it breaks

Almost every "IP not whitelisted" error comes down to one thing: the request left from an address that is not on the list. The common ways that happens:

- **Your home IP changed.** On Jio or Airtel home broadband the public IP can change after a router restart, a power cut or a line reset. Yesterday's whitelisted address is now someone else's.
- **You are behind carrier-grade NAT.** Many Indian home and small-office connections share public IPs through carrier-grade NAT. The public address is shared with other subscribers and can move. See [CGNAT explained](03-cgnat-explained.md).
- **The request went out over IPv6.** A dual-stack machine may pick IPv6 for some calls and IPv4 for others.
- **The cloud changed your address.** A VPS without a reserved or elastic IP can get a new public IP after a stop and start. Serverless functions usually have no fixed outbound IP at all unless you route them through a NAT gateway with a fixed address.
- **You whitelisted the wrong address.** For example the private LAN IP, the IP of your office instead of your server, or the IP of a load balancer that only handles inbound traffic.
- **A second client skipped the proxy.** Your main HTTP client goes through a fixed IP, but a websocket or a background job connects directly.

For a step-by-step way to work out which of these is hitting you, see [how to fix "IP not whitelisted" errors](06-fix-ip-not-whitelisted-errors.md).

## The fix: send from an address you control

The durable fix is to make the source address boring. Pick one public IP that does not change, send every request to the provider through it, and whitelist only that.

There are two usual ways to get there:

1. **A server with a static IP.** Run your code on a VPS with a reserved IP, or on cloud instances behind a NAT gateway with a fixed elastic IP. Every outgoing request uses that address.
2. **A fixed-IP proxy.** Keep running the code where it is (a laptop, a home server, a serverless function) and send the provider calls through an HTTP proxy whose outgoing address is fixed. The provider sees the proxy's IP. HTTPS stays encrypted end to end through the proxy's CONNECT tunnel.

Either way, check from the same machine and the same code path that the provider will see the address you whitelisted:

```bash
# through a proxy: this is the address to whitelist
curl -x http://USER:PASS@HOST:PORT https://ifconfig.co
```

An allowlist only covers traffic you send. Webhooks and callbacks come the other way, from the provider's own IPs to your server. If you filter inbound traffic, you allowlist the provider's webhook IPs on your side. That is a separate list from your outbound IP.

## A few habits that help

- Keep the list short. Remove addresses you no longer use.
- Write down which address is on which provider, and when you added it. Some providers (NIC, for example) take days to change a whitelisted IP.
- Keep the other protections on. Validate webhook signatures, keep API key permissions minimal, and rotate keys. An IP restriction limits where a key works, not what it can do.

## Using a dedicated static IP

Any fixed-IP proxy or server with a static IP solves the "my address keeps changing" part. TrueIP provides [dedicated static IPs for API whitelisting](https://www.trueip.in/static-ip-for-api-whitelisting/?utm_source=github&utm_medium=guides) from Mumbai on its own routed range, delivered as an authenticated HTTP proxy for outgoing connections, one IP per account, never shared or rotated. IPv6 is ₹50 a month and IPv4 ₹200 a month, plus 18% GST.

## Sources

- https://razorpay.com/docs/x/dashboard/allowlist-ip/
- https://razorpay.com/docs/security/whitelists/
- https://www.cashfree.com/docs/payouts/payouts/integrations/payouts-2fa
- https://docs.delta.exchange/
- https://einv-apisandbox.nic.in/onboarding.html
- https://www.binance.com/en/support/faq/how-to-create-api-keys-on-binance-360002502072
- https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html
- https://www.rfc-editor.org/rfc/rfc9110#section-9.3.6

_Maintained by [TrueIP](https://www.trueip.in/?utm_source=github&utm_medium=guides). Last checked 31 October 2026._
