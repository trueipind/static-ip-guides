# Give your team access to IP-restricted apps from one fixed IP

Your company locked Zoho, Microsoft 365 or Google Workspace to the office IP, and now half the team works from home on Jio and Airtel connections whose IPs change every few days. Adding each person's home IP is a losing game. A simpler setup is one fixed outbound IP on the allowlist, and each staff member's browser sends just that app's traffic through it. This guide covers the allowlist settings, the per-user browser setup on Windows and macOS, a PAC file that sends only the ERP domain through the proxy, and what to do about RDP-based tools like Tally on cloud.

## What this does and does not do

This gives staff a fixed **outgoing** IP for web apps that check where you sign in from. It does not connect anyone into the office network: no file server, printers or Tally machine on the office LAN. For that you need a VPN that terminates in the office. An outbound proxy is not a VPN.

## Step 1: put the fixed IP on the app's allowlist

First find the address the app will see:

```bash
curl -x http://USER:PASS@HOST:PORT https://ifconfig.co
```

Then add it in the app's admin settings. Keep the office IP on the list too, so nobody is locked out while you test.

- **Zoho.** Zoho Accounts lets admins restrict sign-in to allowed IPs, and asks that these be static gateway addresses. Zoho CRM also has its own Allowed IPs setting per user, role or group. The Accounts page lists prefixes from /0 to /32, which suggests IPv4 only, so use an IPv4 address for Zoho.
- **Microsoft 365 (Entra ID).** Create a named location in Conditional Access containing the fixed IP, and use it in your policy. Named locations accept IPv4 and IPv6 ranges (IPv6 in CIDR notation). Microsoft documents that when traffic goes through a proxy, Entra evaluates the proxy's IP, which is exactly what you want here.
- **Google Workspace.** Context-aware access levels can require an IPv4 or IPv6 address or prefix in CIDR notation. This is available on Enterprise-tier editions, so check yours.

## Step 2: set up each person's browser

You do not need the whole laptop going through the proxy. Three options, simplest first.

**macOS system proxy.** In **System Settings > Network**, pick the active network, open **Details > Proxies**, turn on **Web proxy (HTTP)** and **Secure web proxy (HTTPS)**, enter the host and port, and turn on **Proxy server requires password** with the username and password. Safari uses this directly. This sends all browser traffic through the proxy, which is fine for a work-only laptop.

**Windows system proxy.** In **Settings > Network & internet > Proxy**, under **Manual proxy setup**, select **Set up** next to **Use a proxy server** and enter the address and port. Windows has no username or password field here. The browser asks for the proxy credentials when it first connects.

**A separate Chrome work profile (recommended).** Chrome follows the system proxy by default, but you can start a separate Chrome with its own proxy and its own profile folder. Personal browsing stays direct and the work window goes through the fixed IP.

```bash
# macOS: a separate chrome instance for the erp, through the proxy
open -na "Google Chrome" --args \
  --user-data-dir="$HOME/ChromeWork" \
  --proxy-server="http://HOST:PORT"
```

```bat
:: windows: put this in a desktop shortcut's target
"C:\Program Files\Google\Chrome\Application\chrome.exe" --user-data-dir="%LOCALAPPDATA%\ChromeWork" --proxy-server="http://HOST:PORT"
```

The `--user-data-dir` matters. Without it, an already open Chrome ignores the flags and opens another window of the existing instance.

### A note on credentials in Chrome

Chrome does not use credentials embedded in proxy settings. That includes a username and password saved in macOS proxy settings, and `user:pass@` inside `--proxy-server`. Instead it shows a sign-in prompt the first time the proxy asks. Staff type the proxy username and password once, and Chrome can save them in that profile.

## Step 3 (optional): send only the ERP domain through the proxy

A PAC file is a small JavaScript function the browser calls for every URL. It can send just your restricted apps through the proxy and everything else direct. That way video calls and downloads do not use the proxy's bandwidth.

```javascript
// proxy.pac: only the listed domains use the fixed ip
function FindProxyForURL(url, host) {
  if (dnsDomainIs(host, ".zoho.in") ||
      dnsDomainIs(host, ".zoho.com") ||
      host == "erp.example.com") {
    return "PROXY HOST:PORT";
  }
  return "DIRECT";
}
```

Adjust the domains to what your app uses (the developer tools Network tab shows them during sign-in). Note that `dnsDomainIs(host, ".zoho.com")` matches subdomains like `accounts.zoho.com` but not the bare `zoho.com`. Add that separately if you need it.

Host the file on any internal or company web server that serves plain HTTP or HTTPS, then point browsers at it:

```bash
# chrome with a pac file instead of a single proxy
open -na "Google Chrome" --args \
  --user-data-dir="$HOME/ChromeWork" \
  --proxy-pac-url="https://intranet.example.com/proxy.pac"
```

On Windows you can instead set the PAC URL under **Use setup script** in the same Proxy settings page, and on macOS with **Automatic proxy configuration**. Credentials still come from the browser's prompt.

## Remote desktop and Tally on cloud

Tally's own cloud access (TallyPrime Cloud Access) connects either through Microsoft Remote Desktop or through Google Chrome. If your hosted Tally only accepts your fixed IP, the Chrome route is the easy one: use the Chrome work profile above.

The Remote Desktop client (`mstsc`) cannot be pointed at an HTTP proxy. Its RDP file properties have no general proxy setting, only a Kerberos KDC proxy, and RD Gateway is a server-side role, not a client option. If you must use RDP through a fixed IP, a local tunnel can carry it, the same way as in [the SMPP tunnel guide](26-smpp-through-http-proxy.md). Treat this as advanced and test it before relying on it:

```bash
# local port 13389 -> rdp host through the proxy (tcp only)
ncat -l 127.0.0.1 13389 --keep-open \
  --sh-exec "ncat --proxy HOST:PORT --proxy-type http --proxy-auth USER:PASS rdp.example.com 3389"
```

Then connect Remote Desktop to `127.0.0.1:13389`. The tunnel carries TCP only (RDP normally also uses UDP), so expect it to feel slower, and the proxy must allow CONNECT to port 3389.

## How to check it worked

- In the work profile, open `https://ifconfig.co`. It should show the fixed IP. With a PAC file it will show the home IP unless you add that domain to the PAC (which is a good way to confirm the PAC is selective).
- Sign in from home with the office IP temporarily removed from the allowlist.
- In Entra, the sign-in logs show the IP each sign-in came from. It should be the proxy's.

## Using a dedicated static IP

Any fixed-IP proxy works for this, as does a small server with a static IP running a proxy. TrueIP provides [dedicated static IPs for team access to IP-restricted apps](https://www.trueip.in/static-ip-remote-access/?utm_source=github&utm_medium=guides) from Mumbai as an authenticated HTTP proxy, one IP per account and never rotated, so the allowlist entry stays valid. IPv6 is ₹50 a month for Entra and Google Workspace, and IPv4 is ₹200 a month for Zoho (both plus 18% GST).

## Sources

- https://help.zoho.com/portal/en/kb/accounts/manage-your-zoho-account/articles/ip-restrictions
- https://help.zoho.com/portal/en/kb/crm-v2-1/security-control/configure-allowed-ips/articles/crm-v2-configure-allowed-ips
- https://learn.microsoft.com/en-us/entra/identity/conditional-access/concept-assignment-network
- https://knowledge.workspace.google.com/admin/security/create-context-aware-access-levels
- https://support.apple.com/guide/mac-help/change-proxy-settings-on-mac-mchlp2591/mac
- https://support.microsoft.com/en-us/windows/use-a-proxy-server-in-windows-03096c53-0554-4ffe-b6ab-8b1deee8dae1
- https://chromium.googlesource.com/chromium/src/+/main/net/docs/proxy.md
- https://www.chromium.org/developers/design-documents/network-settings/
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Proxy_servers_and_tunneling/Proxy_Auto-Configuration_PAC_file
- https://help.tallysolutions.com/getting-started-with-tallyprime-cloud-access/
- https://learn.microsoft.com/en-us/azure/virtual-desktop/rdp-properties
- https://learn.microsoft.com/en-us/windows-server/remote/remote-desktop-services/remote-desktop-gateway-role
- https://nmap.org/book/ncat-man.html

_Maintained by [TrueIP](https://www.trueip.in/?utm_source=github&utm_medium=guides). Last checked 31 October 2026._
