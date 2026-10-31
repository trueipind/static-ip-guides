# Payout API IP whitelisting: RazorpayX, Cashfree, PayU and Decentro

Your payout integration worked in test mode, you switched to live keys, and now every call fails with an authentication or IP error. Payout APIs move real money out of your account, so most Indian providers only accept payout calls from server IPs you have registered with them. The fix is to find the exact IP your payout calls leave from, make sure it never changes, and register it in the provider's dashboard. This guide covers where each provider asks for it and how to route only your payout client through a fixed IP.

## What each provider asks for

Rules differ by provider and they change, so read the linked page before you go live.

- **RazorpayX.** Allowlisting is mandatory for payout API requests in Live mode only. Test mode does not check it, which is why things break on launch day. It covers the Payouts APIs (including Contacts and Fund Accounts), Payout Links and Fund Account Validation, but not vendor payments, payroll or payouts made from the dashboard. You can enter up to 20 IPs at **My Account & Settings > Developer Controls > Share IP Addresses** (open it from the profile icon; Owner or Admin role, confirmed by OTP). If you only have dynamic IPs, RazorpayX asks you to contact support. Its docs do not say whether IPv6 is accepted, so register a static IPv4.
- **Cashfree Payouts.** Production calls need either a whitelisted IP or a public-key signature (Cashfree calls this 2FA). The IP list lives at **Developers > Payouts > Two-Factor Authentication > IP Whitelist** in the Payouts dashboard, and you can add several IPs. Cashfree states that only IPv4 can be whitelisted. If you cannot get a fixed IP, the signature route works instead: you sign with a public key and send `X-Cf-Signature`, and the signature expires after 5 minutes, so it must be regenerated.
- **PayU Payouts.** PayU offers an IP allowlist check as an additional security layer. Its docs describe it as extra, not mandatory, but if you turn it on the same rules apply.
- **Decentro.** Decentro only accepts API calls from IPs it has whitelisted. You request the whitelisting from their operations team. Their FAQ does not give an IP limit or say anything about IPv6.

For other banks and payout providers, assume the same pattern: many Indian payout and banking APIs want a whitelisted static IP before they enable live access.

## Step 1: find the IP your payout calls really use

Do not guess from your laptop. Run this on the machine that makes the payout calls, the same container or VM (more methods in [finding your outbound IP](02-find-your-outbound-ip.md)):

```bash
# the ip the provider sees when you call it directly
curl -4 https://ifconfig.co

# the ip the provider sees when you go through a proxy
curl -x http://USER:PASS@HOST:PORT https://ifconfig.co
```

If you run on a cloud platform without a reserved egress IP, the first command can return a different address after a redeploy or autoscaling. That is the "dynamic IP" case RazorpayX mentions. Either reserve a static egress IP with your cloud provider or send payout calls through a fixed-IP proxy.

## Step 2: route only the payout client through the fixed IP

You usually do not want your whole app going through a proxy. Keep a separate HTTP session just for payouts, so a proxy outage cannot take down your checkout or your webhooks.

Python with `requests`:

```python
import os
import requests

# a dedicated session for payout calls only
payout = requests.Session()
payout.proxies = {
    "http": "http://USER:PASS@HOST:PORT",
    "https": "http://USER:PASS@HOST:PORT",
}
# ignore HTTPS_PROXY and friends so nothing overrides the setting above
payout.trust_env = False
payout.auth = (os.environ["RZP_KEY_ID"], os.environ["RZP_KEY_SECRET"])

# fetch one payout to confirm auth and ip are both accepted
r = payout.get("https://api.razorpay.com/v1/payouts/pout_XXXXXXXX", timeout=20)
print(r.status_code, r.text[:200])
```

Node.js with `undici`:

```javascript
import { fetch, ProxyAgent } from 'undici';

// only requests that pass this dispatcher use the fixed ip
const payoutAgent = new ProxyAgent('http://USER:PASS@HOST:PORT');
const auth = Buffer.from(`${process.env.RZP_KEY_ID}:${process.env.RZP_KEY_SECRET}`).toString('base64');

const res = await fetch('https://api.razorpay.com/v1/payouts/pout_XXXXXXXX', {
  dispatcher: payoutAgent,
  headers: { Authorization: `Basic ${auth}` },
});
console.log(res.status, (await res.text()).slice(0, 200));
```

Every other `fetch` in the app, without the `dispatcher` option, keeps going out directly. The same pattern works for Cashfree, PayU and Decentro: one session or agent for the payout base URL, everything else untouched.

## Webhooks go the other way

A static outbound IP only affects calls your server makes. Payout status webhooks come from the provider's own servers to yours. If you filter inbound traffic with a firewall, allowlist the provider's published webhook IPs (Razorpay, Cashfree and PayU each list theirs). An outbound proxy plays no part in this, and you should still verify webhook signatures even when you filter by IP.

## Test mode and live mode

Plan for the switch rather than finding out on launch day:

1. Build and test against test keys, which do not check IPs on RazorpayX.
2. Before going live, register the fixed IP in the live dashboard. Allow time if the provider whitelists manually, as Decentro does.
3. Make one harmless live call through the payout session, such as fetching a payout or a balance, before sending real money.
4. Keep a second registered IP (a second proxy or server) if your provider allows several. That way you can switch if one route goes down.

## Troubleshooting

- **Works in test, fails in live.** Expected on RazorpayX. Live mode enforces the allowlist and test mode does not.
- **Works from your laptop, fails from the server.** You registered your office IP. Run the `curl` checks on the server itself.
- **Works for a while, then fails after a deploy.** Your cloud egress IP changed. Use a reserved IP or a proxy.
- **Cashfree rejects an IPv6 address.** Cashfree only takes IPv4. Use an IPv4 address, or the signature method.
- **Proxy errors such as 407.** That is the proxy refusing your credentials, not the payout provider. See [the proxy troubleshooting guide](28-proxy-troubleshooting.md).

## Using a dedicated static IP

Any fixed-IP proxy, or a server with a static IP, works for payout whitelisting. TrueIP provides [dedicated static IPs for payout APIs](https://www.trueip.in/static-ip-payout-api/?utm_source=github&utm_medium=guides) from Mumbai as an authenticated HTTP proxy, one IP per account, never shared and kept the same on renewal. Since RazorpayX does not document IPv6 and Cashfree is IPv4 only, choose the IPv4 plan at ₹200 a month plus 18% GST.

## Sources

- https://razorpay.com/docs/x/dashboard/allowlist-ip/
- https://razorpay.com/docs/security/whitelists/
- https://www.cashfree.com/docs/payouts/payouts/integrations/payouts-2fa
- https://www.cashfree.com/docs/help/payouts/ip-whitelist
- https://docs.payu.in/docs/apis-used-for-payouts-integration
- https://docs.payu.in/docs/payouts-webhooks
- https://global.docs.decentro.tech/docs/general-faqs
- https://requests.readthedocs.io/en/latest/user/advanced/#proxies
- https://github.com/nodejs/undici/blob/main/docs/docs/api/ProxyAgent.md

_Maintained by [TrueIP](https://www.trueip.in/?utm_source=github&utm_medium=guides). Last checked 31 October 2026._
