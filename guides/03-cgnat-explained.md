# CGNAT explained: why your home IP can't be whitelisted

You whitelisted your home IP with a broker or an API, and a day later it stopped working. Or you set up port forwarding for a home server and nothing outside can reach it. Both are common symptoms of carrier-grade NAT (CGNAT), where your ISP shares one public IPv4 address among many subscribers. The short answer: check your router's WAN IP. If it is in `100.64.0.0/10`, you are behind CGNAT, and you need either a public static IP from your ISP, a server with a fixed IP, or a fixed-IP proxy for your outgoing traffic.

## What CGNAT is

Normal home NAT happens once. Your router has one public IP and shares it among your devices, which get private addresses like `192.168.1.x`.

With CGNAT the ISP adds a second layer. Your router no longer gets a public IP. It gets an address from the ISP's internal pool, and the ISP's own NAT boxes translate that to a public IP shared with other customers. RFC 6598 reserves `100.64.0.0/10` (that is `100.64.0.0` to `100.127.255.255`) as "Shared Address Space" for exactly this purpose.

ISPs do this because public IPv4 addresses are scarce. Many Indian home and small-office connections share public IPs through carrier-grade NAT.

## How to check if you are behind CGNAT

1. Open your router's admin page (often `192.168.1.1` or `192.168.0.1`, printed on the router) and find the WAN or Internet status. Note the WAN IPv4 address.
2. From any device on that network, ask an outside service what it sees:

```bash
# the public ipv4 address the internet sees
curl -4 https://ifconfig.co
```

3. Compare the two.

- **WAN IP is in `100.64.0.0/10`:** you are behind CGNAT.
- **WAN IP is a private address** (`10.x.x.x`, `172.16.x.x` to `172.31.x.x`, `192.168.x.x`): there is another NAT layer upstream, which has the same effect for whitelisting and port forwarding.
- **WAN IP matches the curl result:** you have your own public IPv4. It may still be dynamic and change after a reconnect.
- **WAN IP is public but different from the curl result:** some other NAT sits between you and the internet.

A traceroute can confirm it. Hops right after your router with `100.64` to `100.127` addresses are the ISP's shared address space.

```bash
# look for 100.64.x.x to 100.127.x.x hops near the start
traceroute -n 1.1.1.1
```

## What CGNAT breaks

**IP allowlists.** The public IP you whitelist is shared with other subscribers, and the ISP can map you to a different one at any time. After a power cut restarts the router, or the ISP rebalances its pool, your requests leave from a new address and the API rejects them. You also cannot be sure no one else is sending from "your" address.

**Port forwarding and incoming connections.** Port forwarding on your router only works if the router holds the public IP. Under CGNAT, incoming connections stop at the ISP's NAT and never reach your router. A home server, a CCTV DVR, remote desktop into your office PC, or a self-hosted app will not be reachable from outside by your IP.

**Some peer-to-peer and gaming features.** Anything that expects to accept incoming connections can struggle. This guide does not go into those.

## Your options

### 1. Ask your ISP for a public or static IP

This is the only option that fixes both outgoing whitelisting and incoming connections at home. Some ISPs offer it, usually on business plans. For example, JioBusiness broadband plans include a public static IP, and ACT lists "1 Free Static IP" on its 1 Gbps business plans, which start at ₹5,999 a month plus GST. Check the current plan pages before you buy, and ask the ISP whether the IP is public (not CGNAT) and static (does not change).

### 2. Run the code on a server with a fixed IP

If what you need is a fixed source address for API calls (a trading bot, a payout integration, an e-invoice client), move that code to a VPS or cloud instance with a reserved public IP. Your home connection then does not matter. You manage the server yourself.

### 3. Send outgoing traffic through a fixed-IP proxy

Keep running the code at home or on your laptop, and send the whitelisted calls through an HTTP proxy that has a fixed outgoing IP. The API sees the proxy's address, which does not change when your router restarts.

```bash
# the provider sees this address, not your cgnat ip
curl -x http://USER:PASS@HOST:PORT https://ifconfig.co
```

**Be clear about the limit:** a proxy like this only covers connections you start. It does not make your home devices reachable from the internet, and it does not replace port forwarding. If you need people or services to connect *in* to your home network, you need option 1, or a different setup on a server you control.

## What about IPv6?

CGNAT is an IPv4 workaround. If your ISP also gives you IPv6, your devices may get globally routable IPv6 addresses that are not behind CGNAT. That can help when the service you call accepts IPv6 in its allowlist, though many do not, and home IPv6 prefixes can also change. See [IPv4 vs IPv6 in allowlists](04-ipv4-vs-ipv6-allowlists.md) before relying on it.

## Troubleshooting

- **The allowlisted IP worked yesterday.** Run the curl check again. If it changed, your connection is dynamic or behind CGNAT.
- **The router shows a public WAN IP but it still changes.** You have a public but dynamic IP. Ask the ISP for a static one, or use options 2 or 3.
- **Port forwarding is set up correctly but nothing connects.** Check the WAN IP. If it is in `100.64.0.0/10`, forwarding cannot work.

## Using a dedicated static IP

For outgoing API calls, any fixed-IP proxy or server with a static IP gets you out from behind a shifting CGNAT address. TrueIP offers [dedicated static IPs for API whitelisting](https://www.trueip.in/static-ip-for-api-whitelisting/?utm_source=github&utm_medium=guides) from Mumbai, delivered as an authenticated HTTP proxy, one IP per account, never shared or rotated. It handles outgoing connections only, with no incoming connections or port forwarding, so it will not make home devices reachable. IPv6 is ₹50 a month and IPv4 ₹200 a month, plus 18% GST.

## Sources

- https://www.rfc-editor.org/rfc/rfc6598
- https://www.jio.com/business/services/connectivity/business-broadband-max/
- https://www.actcorp.in/enterprise-business/eb-plans

_Maintained by [TrueIP](https://www.trueip.in/?utm_source=github&utm_medium=guides). Last checked 31 October 2026._
