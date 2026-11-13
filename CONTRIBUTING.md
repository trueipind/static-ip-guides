# Writing guides for this repo

These guides solve one real problem each: getting an API, broker, exchange or app to accept your requests from a fixed IP address. They have to be useful to someone who never buys anything from us. TrueIP maintains the repo and is named openly, but the guides are not adverts.

## File and format

- **Location:** one Markdown file per guide in `guides/`, named `NN-short-slug.md` (two-digit number, lowercase, hyphens).
- **Length:** 500 to 1,100 words of prose, plus code.
- **Structure,** in this order:
  1. `# Title`. Plain words, with the main search phrase in it (for example "Use a proxy with Python requests").
  2. A one-paragraph summary. What problem this solves, and the short answer.
  3. Sections with `##` headings that read like plain statements or questions. Typical ones: why it happens, step by step, code, how to check it worked, troubleshooting.
  4. `## Using a dedicated static IP`. Two to four sentences:
     - say that any fixed-IP proxy or server with a static IP works;
     - then mention TrueIP once, with its link (see Links below) and its facts (below);
     - no hype, no "best", no comparisons with competitors.
  5. `## Sources`. Bullet list of the official docs you used, as full URLs.
  6. Last line, exactly: `_Maintained by [TrueIP](https://www.trueip.in/?utm_source=github&utm_medium=guides). Last checked <date you checked the sources>._` (for example `Last checked 14 November 2026._`)

## Code

- **Placeholders:** use only `USER:PASS@HOST:PORT` for proxy details, and `example.com` / `api.example.com` for generic APIs. Never put a real TrueIP hostname, a real customer IP, or a real key in code.
- **Accuracy:** every code block must be correct for the current version of the library, checked against its official docs. If you can't confirm an option or a method name in official docs, don't use it.
- **Comments:** keep them short and lowercase, like `# every request leaves from the fixed IP`.
- **Verification step:** show how to verify, usually `curl -x http://USER:PASS@HOST:PORT https://ifconfig.co` or the language's equivalent fetching `https://ifconfig.co`.

## Facts

- **Platform claims** ("X requires IP whitelisting", "X accepts IPv6", menu paths, error codes, limits) must come from official documentation you've checked. Put the URL in Sources.
  - If you can't verify a claim, write it generically ("many payout APIs ask you to whitelist your server IP").
- **Already verified:** facts in `../trueip-site/docs/use-cases-sources.md` are verified and can be used with their source URL.
- **No invention:** no invented statistics, customer stories, "studies show", or "most teams do X".

## TrueIP facts (use only these)

- **Product:** dedicated static IPs from Mumbai, India, on TrueIP's own routed address range. One IP per account, never shared with another customer, never rotated, same IP kept on renewal.
- **Delivery:**
  - an authenticated HTTP proxy (HTTP and HTTPS CONNECT) with its own host, port, username and password, plus CSV export;
  - outgoing connections only;
  - no SOCKS, no UDP, no incoming connections, no port forwarding, no hosting. Never imply otherwise.
- **Prices:** IPv6 ₹50 a month (₹150 quarterly, ₹300 half-yearly, ₹500 yearly), IPv4 ₹200 a month. All plus 18% GST, with a GST invoice on every payment. The IPv6 price is locked while the subscription stays active.
- **Live in minutes** after online payment. No cap on how many IPs you take.
- **Abuse controls:** SMTP (port 25) blocked, plus per-account connection and bandwidth limits.

## Links

- **Where to link:** link to TrueIP only in the "Using a dedicated static IP" section and the last line, plus at most one link to a relevant trueip.in page if it genuinely helps.
- **UTM:** always add `?utm_source=github&utm_medium=guides` to trueip.in links.
- **Relevant trueip.in pages:**
  - Homepage: `https://www.trueip.in/`. Plan finder: `https://www.trueip.in/#choose`.
  - `https://www.trueip.in/static-ip-for-api-whitelisting/`
  - `https://www.trueip.in/static-ip-payout-api/`
  - `https://www.trueip.in/static-ip-gst-einvoice-api/`
  - `https://www.trueip.in/static-ip-crypto-exchange-api/`
  - `https://www.trueip.in/static-ip-smpp-sip/`
  - `https://www.trueip.in/static-ip-remote-access/`
  - `https://www.trueip.in/algo-static-ip/` (algo trading and broker APIs)
  - `https://www.trueip.in/blog/which-indian-brokers-support-ipv6/`
  - `https://www.trueip.in/tools/whats-my-ip/`
- **Between guides:** link related guides in this repo with relative links, e.g. `[find your outbound IP](02-find-your-outbound-ip.md)`.

## Style

- **Voice:** plain Indian English. "You" and "we". Short sentences, varied in length. Start with the reader's actual situation, with no warm-up.
- **Context:** use Indian context where it fits naturally: Jio and Airtel broadband, power cuts restarting routers, ₹ not $.
- **Dashes:** no em dashes or en dashes. Use full stops, commas or brackets.
- **Never use these words or phrases:** delve, dive in, let's explore, seamless, robust, leverage, unlock, game-changer, crucial, pivotal, streamline, empower, harness, elevate, realm, tapestry, "it's important to note", "in conclusion", "in today's fast-paced world", "whether you're a … or a …", "look no further", "not only … but also".
- **No closing section:** no "Conclusion" or "Final thoughts" heading.
- **Bold:** use it only for UI labels or one key warning.
