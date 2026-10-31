# Find your outbound IP address (the one an API actually sees)

A provider asks for "your server IP" to whitelist, and you are not sure which address to give. The right answer is the public source IP that your requests arrive from, as seen by a server on the internet. That is often not the address shown by `ipconfig`, your cloud console's "private IP", or the IP of your load balancer. The short answer: from the exact machine and network path your code uses, ask an outside service which address it sees, once for IPv4 and once for IPv6.

## The one command

Run this on the machine (or inside the container) that makes the API calls:

```bash
# the ipv4 address remote servers see
curl -4 https://ifconfig.co

# the ipv6 address remote servers see (fails if you have no ipv6 route)
curl -6 https://ifconfig.co
```

`-4` tells curl to resolve and connect over IPv4 only, and `-6` over IPv6 only. If both print an address, your machine is dual-stack and may use either for a given request. That matters for allowlists, see [IPv4 vs IPv6 in allowlists](04-ipv4-vs-ipv6-allowlists.md) and [dual-stack IP mismatch](05-dual-stack-ip-mismatch.md).

If you are on a laptop and just want to look, a browser page works too, such as the [TrueIP what's my IP tool](https://www.trueip.in/tools/whats-my-ip/?utm_source=github&utm_medium=guides). For a server, prefer curl, because the browser is not where your code runs.

## Inbound IP and outbound IP are different things

People mix these up all the time, and allowlists only care about one of them.

- **Inbound IP** is the address other people connect *to*: your domain's A record, a load balancer, a reverse proxy. It decides where traffic to you lands.
- **Outbound IP** is the source address on connections you *start*: your server calling a payout API or a broker. This is what allowlists check.

On a single VPS with one public IP these are often the same. Behind load balancers, NAT gateways and platforms they usually are not. Always measure the outbound one with a request that goes out, as above.

## On a laptop or office machine

Your laptop has a private address from the router, something like `192.168.1.5`. The router translates it to the connection's public IP. Run `curl -4 https://ifconfig.co` and you get that public IP.

On home broadband this address can change after a router restart or a power cut, and it may be shared through carrier-grade NAT. Compare it with the WAN IP on your router's status page. If they differ, or the WAN IP starts with `100.64` to `100.127`, read [CGNAT explained](03-cgnat-explained.md) before whitelisting it.

## On a VPS or cloud instance

A VPS with a public IP on its interface usually sends from that IP. Check anyway with curl. Two things to watch:

- If the address is not reserved (an elastic or static IP in your provider's terms), it can change when the instance is stopped and started.
- If the instance has both IPv4 and IPv6, check both. Your code may use IPv6 when the API's hostname has an AAAA record.

## Behind a NAT gateway or load balancer

Instances in a private subnet have no public IP of their own. On AWS, for example, a public NAT gateway is created with an Elastic IP, and traffic from instances in private subnets goes out to the internet with that Elastic IP as the source. That Elastic IP is what you whitelist, and every instance behind the same NAT gateway shares it.

A load balancer works in the other direction. It receives incoming traffic. Your application servers still make outgoing calls through their own public IP or through the NAT gateway. Whitelisting the load balancer's address will not help with outbound calls.

## In Docker and Kubernetes

On Docker's default bridge network, containers reach the internet through masquerading (NAT) on the host. The remote API sees the host's public address, or whatever NAT sits in front of the host. Run the check from inside the container to be sure:

```bash
# run the check inside a running container
docker exec -it CONTAINER curl -4 https://ifconfig.co
```

In Kubernetes, pod egress usually leaves through the node it runs on, or through a cloud NAT in front of the nodes. Pods move between nodes, so if the nodes have different public IPs your outbound IP changes with scheduling. The usual answers are private nodes behind one NAT with a fixed IP, or sending the API calls through one fixed-IP proxy. Check from inside a pod:

```bash
# a throwaway pod that prints its egress ip
kubectl run ipcheck --rm -it --image=curlimages/curl --restart=Never -- curl -4 https://ifconfig.co
```

## In serverless functions

Serverless functions usually run on shared provider infrastructure with no fixed outbound IP. Two calls a minute apart can leave from different addresses. On AWS Lambda, functions run in a Lambda-managed VPC with internet access by default. To get a fixed address you attach the function to your own VPC, put it in private subnets, and route internet traffic through a NAT gateway with an Elastic IP. The other option is to send the whitelisted calls from the function through a fixed-IP proxy.

Test from inside the function, not from your laptop, by fetching `https://ifconfig.co` in the handler and logging the result.

## Through a proxy

If your code sends requests through a proxy, the provider sees the proxy's outgoing address, not yours. Check with the same proxy settings your code uses:

```bash
# the address the provider sees when you use this proxy
curl -x http://USER:PASS@HOST:PORT https://ifconfig.co
```

## Troubleshooting

- **curl shows one IP but the provider logs another.** Your code is not taking the same path. Look for a second HTTP client, a websocket, or `NO_PROXY` rules.
- **The IP changes between runs.** You are on a dynamic connection, behind CGNAT, on serverless, or on Kubernetes nodes with different IPs.
- **`curl -6` works but the allowlist takes only IPv4.** Force IPv4 in your client, or route through an IPv4 proxy.

## Using a dedicated static IP

If the address you measure keeps changing, any fixed-IP proxy or server with a static IP gives you one stable address to whitelist. TrueIP offers [dedicated static IPs](https://www.trueip.in/static-ip-for-api-whitelisting/?utm_source=github&utm_medium=guides) from Mumbai as an authenticated HTTP proxy for outgoing connections, one IP per account, never shared or rotated, live in minutes after online payment. IPv6 is ₹50 a month and IPv4 ₹200 a month, plus 18% GST.

## Sources

- https://curl.se/docs/manpage.html
- https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html
- https://docs.aws.amazon.com/lambda/latest/dg/configuration-vpc-internet.html
- https://docs.docker.com/engine/network/packet-filtering-firewalls/
- https://www.rfc-editor.org/rfc/rfc6598

_Maintained by [TrueIP](https://www.trueip.in/?utm_source=github&utm_medium=guides). Last checked 31 October 2026._
