# How to fix "IP not whitelisted" errors (401 and 403)

Your API calls come back with a 401 or 403 and a message like "IP not whitelisted", "IP not allowed" or "access denied for this IP". The provider is telling you the request arrived from an address that is not on your allowlist. The short answer: find the exact public IP your failing request used, compare it with the list character by character, work out why they differ, and then fix the source address so it can't drift again.

## What these errors look like

Each platform words it differently. Two examples from official documentation:

- **Delta Exchange** returns an error with the code `ip_not_whitelisted_for_api_key` when a key with trading permission is used from an address that is not on its list.
- **WazirX** returns error `2128`, with the message "This IP has not been whitelisted for the API key".

Other providers return a plain 401 Unauthorized or 403 Forbidden, sometimes with no detail at all. A 401 or 403 can also mean a wrong key, a bad signature or a missing permission, so don't assume it's the IP until you have checked.

## Step 1: confirm the IP the provider sees

Run this on the same machine, container or function that makes the failing call, using the same proxy settings:

```bash
# ipv4 and ipv6 the internet sees from here
curl -4 https://ifconfig.co
curl -6 https://ifconfig.co

# if your code uses a proxy, check through it
curl -x http://USER:PASS@HOST:PORT https://ifconfig.co
```

If your code runs in Docker, Kubernetes or a serverless function, run the check from inside it, not from your laptop. The [outbound IP guide](02-find-your-outbound-ip.md) covers each case.

If the provider shows the source IP in its error body or API log, use that. It is the most reliable answer.

## Step 2: compare it with the allowlist

Open the provider's dashboard and look at what is actually saved. Check:

- **Exact match.** A single wrong digit, a trailing space or a swapped octet is enough.
- **Address family.** Is the saved entry IPv4 and your request IPv6, or the reverse?
- **Range format.** If you saved a CIDR range, does it include your address? `/32` (IPv4) or `/128` (IPv6) means exactly one address.
- **The right key.** Many providers attach the list to one API key. A second key, or a key regenerated last week, may have an empty list.
- **Saved and applied.** Some dashboards need an OTP or admin approval before the change takes effect. NIC, for example, says whitelisting may take 4 to 5 days.

## Step 3: work out which cause it is

These are the usual reasons the two don't match.

### Your public IP changed

Home broadband on Jio or Airtel often gets a new public IP after a router restart or a power cut. A cloud server without a reserved IP can get a new one after a stop and start. If the IP from step 1 differs from the one you saved last week, this is it.

### You are behind CGNAT

If your router's WAN IP is in `100.64.0.0/10`, your ISP shares a public IP among many customers and can move you between addresses. See [CGNAT explained](03-cgnat-explained.md).

### The request went over IPv6

Dual-stack machines can switch between IPv4 and IPv6 from one request to the next, so failures look random. See [dual-stack IP mismatch](05-dual-stack-ip-mismatch.md).

### You whitelisted the wrong address

Common mistakes: the LAN IP (`192.168.x.x`, `10.x.x.x`), your office IP instead of the server's, or a load balancer's inbound IP. Allowlists check the outbound source address.

### Part of your code skips the proxy

Your REST client goes through the fixed IP, but a websocket client, a second library, or a background worker connects directly. In Python, environment variables like `NO_PROXY`, or `trust_env` settings, can quietly send some hosts direct. Log the egress IP from each client separately.

### Your servers have different IPs

Several instances, Kubernetes nodes or serverless executions each have their own public IP. One works, the others fail. Either whitelist every one, or put them all behind one NAT or one proxy.

## Step 4: retest

After fixing, make one signed, read-only call (fetch balance, fetch account) before re-enabling anything that moves money or places orders. Then run it a few dozen times in a loop to catch intermittent failures.

```bash
# repeat the egress check to catch a flapping address
for i in $(seq 1 20); do curl -s -x http://USER:PASS@HOST:PORT https://ifconfig.co; done | sort | uniq -c
```

One line in the output means one address. Two or more means something is still changing.

## Durable fixes

A quick re-whitelist gets you running today. These stop it happening next week:

1. **Use one static outgoing address.** A server with a reserved IP, a NAT gateway with a fixed elastic IP, or a fixed-IP proxy that all your clients use.
2. **Pick one address family.** Force IPv4 in your clients if the platform only takes IPv4, or route everything through one proxy.
3. **Route every client the same way.** REST, websockets, cron jobs and workers.
4. **Keep a record.** Which IP is on which provider and which key, and when it was added.
5. **Alert on the error code.** Treat `ip_not_whitelisted_for_api_key`, `2128`, or your provider's equivalent as a page-worthy alert, not a retry.

## Using a dedicated static IP

Any fixed-IP proxy or server with a static IP makes the source address predictable. TrueIP provides [dedicated static IPs for API whitelisting](https://www.trueip.in/static-ip-for-api-whitelisting/?utm_source=github&utm_medium=guides) from Mumbai as an authenticated HTTP proxy for outgoing connections, one IP per account, never shared, never rotated, and kept the same on renewal. IPv6 is ₹50 a month and IPv4 ₹200 a month, plus 18% GST.

## Sources

- https://docs.delta.exchange/
- https://docs.wazirx.com/
- https://einv-apisandbox.nic.in/onboarding.html
- https://www.rfc-editor.org/rfc/rfc6598
- https://www.rfc-editor.org/rfc/rfc9110#section-15.5.4
- https://requests.readthedocs.io/en/latest/user/advanced/#proxies
- https://curl.se/docs/manpage.html

_Maintained by [TrueIP](https://www.trueip.in/?utm_source=github&utm_medium=guides). Last checked 31 October 2026._
