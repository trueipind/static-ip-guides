# IPv4 vs IPv6 allowlists: which platforms accept IPv6?

You have a static IPv6 address, or you are deciding between IPv4 and IPv6, and you need to know whether the service you call will accept it in its IP allowlist. Some platforms accept both, some take only IPv4, and many simply do not say. The short answer: use IPv6 only where the platform's documentation says IPv6 is accepted and its API answers over IPv6. Everywhere else, including Indian government APIs and SMPP providers that don't document it, use a static IPv4.

## Two things must both be true

An IPv6 address only works for a whitelisted API if:

1. **The allowlist accepts IPv6.** The dashboard field, or the provider's whitelisting process, takes an IPv6 address or prefix.
2. **The API is reachable over IPv6.** The API hostname has an IPv6 (AAAA) record and answers on it. If it does not, your client connects over IPv4 anyway, and the provider sees a different address from the one you listed.

Plenty of platforms fail the second test even when their dashboards are modern.

## What official docs say

From each platform's own documentation, checked October 2026:

| Platform | IPv6 in allowlist? | Notes |
|---|---|---|
| AWS security groups | Yes | Rules take IPv6 ranges in CIDR notation. |
| Cloudflare IP Access rules | Yes | Single IPv6 addresses and `/64`, `/48`, `/32` ranges. |
| GitHub organisation IP allow list | Yes | GitHub is rolling out IPv6 and asks you to add any IPv6 addresses you use. |
| Microsoft Entra named locations | Yes | IPv4 and IPv6 ranges. The legacy MFA trusted IPs setting is IPv4 only. |
| Google Workspace Context-Aware Access | Yes | IPv4 or IPv6 in CIDR notation, on editions that include it. |
| Delta Exchange | Yes | IP values can be IPv4 and IPv6, as a comma-separated list. |
| Stripe API key IP restrictions | No | Specific IPv4 addresses or CIDR ranges only. |
| Cashfree Payouts | No | Cashfree says IPv4 has to be whitelisted, not IPv6. |
| Binance | Asks for IPv4 | The withdrawal restriction is described as "IPv4 format". |
| NIC e-invoice | Not stated | Asks for Indian public static IPs. Use IPv4. |
| SMPP providers (Twilio, Sinch, Infobip) | Not stated | Use IPv4. |
| RazorpayX payouts | Not stated | Use IPv4. |

In our own test from Mumbai on 29 October 2026, the public API endpoints of Binance, Bybit and WazirX did not respond over IPv6, while OKX, Delta Exchange and CoinDCX did. Treat that as a snapshot, not a promise.

If your platform is not in the table, assume IPv4 until its documentation says otherwise.

## How to test a platform yourself

### Test the allowlist field

Paste the documentation address `2001:db8::1` into the IP field and see whether the form accepts it. `2001:db8::/32` is reserved for documentation, so it can never be a real client.

- If the form rejects it as an invalid IP, the allowlist is IPv4 only.
- If it accepts it, the field at least parses IPv6. Delete the test entry straight away, and do not save it on a key that matters.

Accepting the format is not proof that IPv6 requests will be matched. Check the platform's documentation as well.

### Test the API over IPv6

```bash
# does the api hostname publish an ipv6 address?
dig +short AAAA api.example.com

# can you actually reach it over ipv6? prints headers if yes
curl -6 -sI https://api.example.com
```

If `dig` returns nothing, or `curl -6` fails to connect, the API is IPv4-only from your network and an IPv6 allowlist entry will never match.

### Test end to end

Whitelist the IPv6 address, then make a signed read-only call (fetch balance, fetch profile) from the machine or proxy that will run in production. If it fails with the platform's "IP not whitelisted" error, the request probably went out over IPv4. See [dual-stack IP mismatch](05-dual-stack-ip-mismatch.md).

## Dual-stack is where people get caught

If your machine has both IPv4 and IPv6, it may use IPv6 for an API that publishes an AAAA record and IPv4 for one that does not. It may even switch between them for the same API. You whitelisted one address, and some calls arrive from the other.

The fixes are to whitelist both addresses (if the platform accepts both), force your client to one family, or send all whitelisted calls through one proxy with one known outgoing address.

## The cost question

IPv4 addresses are scarce, and a static IPv4 address generally costs more than an IPv6 one. If every platform you need accepts IPv6 and answers over it, IPv6 is the cheaper choice. If even one important platform needs IPv4 (a payout API, Binance, NIC e-invoice, an SMPP bind), you need a static IPv4 for that one. Many people end up with IPv4 for payments and government APIs, and IPv6 only for platforms that document it.

## Troubleshooting

- **The dashboard accepted my IPv6 address but calls fail.** Check `curl -6 -sI` against the API host. If it fails, the API only listens on IPv4.
- **Calls fail at random.** Your client is switching families. Force one family, or use one proxy.
- **The provider's docs say nothing.** Use IPv4, or ask their support in writing.

## Using a dedicated static IP

Any fixed-IP proxy or server with a static IP works, as long as its address family matches what the platform accepts. TrueIP sells dedicated static IPs from Mumbai as an authenticated HTTP proxy, one IP per account and never rotated, in both families: IPv6 at ₹50 a month (₹150 quarterly, ₹300 half-yearly, ₹500 yearly) and IPv4 at ₹200 a month, plus 18% GST. Its [plan finder](https://www.trueip.in/?utm_source=github&utm_medium=guides#choose) helps you pick based on the platforms you use.

## Sources

- https://docs.aws.amazon.com/vpc/latest/userguide/security-group-rules.html
- https://developers.cloudflare.com/waf/tools/ip-access-rules/parameters/
- https://docs.github.com/en/enterprise-cloud@latest/organizations/keeping-your-organization-secure/managing-security-settings-for-your-organization/managing-allowed-ip-addresses-for-your-organization
- https://learn.microsoft.com/en-us/entra/identity/conditional-access/concept-assignment-network
- https://knowledge.workspace.google.com/admin/security/create-context-aware-access-levels
- https://docs.delta.exchange/
- https://docs.stripe.com/keys
- https://www.cashfree.com/docs/payouts/payouts/integrations/payouts-2fa
- https://www.cashfree.com/docs/help/payouts/ip-whitelist
- https://www.binance.com/en/support/faq/how-to-create-api-keys-on-binance-360002502072
- https://einv-apisandbox.nic.in/onboarding.html
- https://www.twilio.com/docs/smpp/key-concepts
- https://developers.sinch.com/docs/sms/smpp/connectivity
- https://www.infobip.com/docs/essentials/api-essentials/smpp-specification
- https://razorpay.com/docs/x/dashboard/allowlist-ip/
- https://www.rfc-editor.org/rfc/rfc3849

_Maintained by [TrueIP](https://www.trueip.in/?utm_source=github&utm_medium=guides). Last checked 31 October 2026._
