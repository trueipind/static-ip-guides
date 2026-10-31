# Static IP for the GST e-invoice API (NIC direct access)

If your company is integrating its ERP directly with NIC's e-invoice system (the IRP), NIC will not give you production access until it has whitelisted your server's public IP addresses. Those IPs must be static, public and Indian, and you get at most four. This guide explains where the IP fits in NIC's onboarding, when you do not need your own IP at all, and how to make your Python or Java client send its calls from the whitelisted address.

## Do you need your own static IP?

There are two ways to reach the e-invoice system, and only one of them needs your IP.

- **Direct API access to NIC.** Your own software calls the IRP. NIC offers this to large taxpayers above its turnover threshold. Check NIC's onboarding page for the current figure, because it has been revised over time. This route needs whitelisted IPs.
- **Through a GSP or ERP provider.** You pick a GST Suvidha Provider or an ERP on the portal, and their servers talk to NIC. The GSP's servers are the ones NIC sees. Customers on this route usually do not need their own static IP, but check with your GSP, because some ask you to allow their endpoint addresses on your outbound firewall.

If you are on the GSP route and things work, you can stop here.

## How NIC onboarding works for direct access

Per NIC's onboarding page, the order is:

1. Register for the sandbox and build your integration against it.
2. Run your test cases and prepare the summary test report of the successful sandbox tests.
3. Submit the report along with up to **4 Indian public static IP addresses** for whitelisting at NIC's end.
4. NIC evaluates the report. Production access is granted after it confirms the report. NIC says verification and whitelisting may take 4 to 5 days.

NIC also says that once IPs are whitelisted, changing them takes more time. That is the real reason to choose your IPs carefully. Do not submit the address of a home connection, a cloud VM whose IP may be released, or anything you might replace in six months. NIC's page does not say whether IPv6 is accepted, so submit IPv4 addresses.

A practical layout is two IPs: one primary and one standby, on separate routes. If one goes down during month-end filing, you switch the client to the other without waiting days for NIC.

## E-way bill API

NIC's e-way bill API manual (version 1.01, dated March 2018) also says the taxpayer's or transporter's system should have a static IP, entered with your domain name when you register for API access. It aims direct access at high-volume users. The manual is old, so treat it as the general rule and confirm current details on the e-way bill portal.

## If your servers run outside India

NIC asks for Indian IPs. If your ERP or middleware runs in a cloud region outside India (Singapore or Frankfurt, say), its public IP is not Indian, even if the company is. You have two options. Move the integration to an Indian region with a reserved static IP. Or keep the servers where they are and send only the IRP calls through a proxy that leaves from an Indian static IP. NIC requires HTTPS with TLS 1.2 or higher, and that works normally through an HTTPS CONNECT proxy, because the proxy only relays the encrypted stream.

## Check the IP before you submit it

Run this from the server that will call the IRP:

```bash
# this must print the exact ip you put on the nic form
curl -x http://USER:PASS@HOST:PORT https://ifconfig.co
```

Run it a few times over a day. If the answer ever changes, that IP is not fit to submit.

## Python client

Take the IRP base URLs from NIC's API documentation. The code below uses `api.example.com` as a stand-in.

```python
import requests

IRP_BASE = "https://api.example.com"  # use the irp base url from nic's docs

irp = requests.Session()
# every irp call leaves from the whitelisted ip
irp.proxies = {
    "http": "http://USER:PASS@HOST:PORT",
    "https": "http://USER:PASS@HOST:PORT",
}
# do not let environment variables override the proxy
irp.trust_env = False

# first check: the ip nic will see
print(irp.get("https://ifconfig.co", timeout=15).text.strip())

# then your normal authentication and generate-irn calls, for example
# resp = irp.post(f"{IRP_BASE}/<auth path from nic docs>", json=payload, headers=headers, timeout=30)
```

Keep this session separate from the rest of your app, so only government API traffic uses the whitelisted IP.

## Java client

Java's built-in `HttpClient` supports an authenticated proxy, with one catch. Since JDK 8u111, Basic authentication is disabled by default for HTTPS tunnelling (the `jdk.http.auth.tunneling.disabledSchemes` property in the JDK's `net.properties`). Most username and password proxies use Basic, so without the flag below your calls fail with a 407 even though the credentials are right.

```bash
# proxy details come from the environment
export PROXY_HOST=HOST PROXY_PORT=PORT PROXY_USER=USER PROXY_PASS=PASS
# allow basic auth for https tunnels through the proxy
java -Djdk.http.auth.tunneling.disabledSchemes= -jar einvoice-client.jar
```

```java
import java.net.Authenticator;
import java.net.InetSocketAddress;
import java.net.PasswordAuthentication;
import java.net.ProxySelector;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

public class IrpClient {
    public static void main(String[] args) throws Exception {
        String host = System.getenv("PROXY_HOST");
        int port = Integer.parseInt(System.getenv("PROXY_PORT"));
        String user = System.getenv("PROXY_USER");
        char[] pass = System.getenv("PROXY_PASS").toCharArray();

        HttpClient client = HttpClient.newBuilder()
            .proxy(ProxySelector.of(new InetSocketAddress(host, port)))
            .authenticator(new Authenticator() {
                @Override
                protected PasswordAuthentication getPasswordAuthentication() {
                    // only answer the proxy's challenge
                    if (getRequestorType() == RequestorType.PROXY) {
                        return new PasswordAuthentication(user, pass);
                    }
                    return null;
                }
            })
            .build();

        // confirm the outbound ip before calling the irp
        HttpRequest req = HttpRequest.newBuilder(URI.create("https://ifconfig.co")).GET().build();
        System.out.println(client.send(req, HttpResponse.BodyHandlers.ofString()).body());
    }
}
```

Use the same `client` for your IRP requests. Older code using `HttpURLConnection` follows the same rules: set `https.proxyHost` and `https.proxyPort`, register an `Authenticator`, and pass the same `-D` flag.

## Troubleshooting

- **Sandbox works, production refuses the connection.** Either NIC has not finished whitelisting, or your calls leave from an IP you did not submit. Print the outbound IP from the production server itself.
- **407 from Java with correct credentials.** The tunnelling flag above is missing, or is set after the first request was made.
- **It broke after a server move.** Your new server has a new IP. This is why a proxy IP that stays the same across server changes saves you from repeating NIC's process.

## Using a dedicated static IP

Any Indian static IP works here: a reserved IP in an Indian cloud region, a business broadband static IP, or a fixed-IP proxy. TrueIP offers [dedicated Indian static IPs for GST e-invoice APIs](https://www.trueip.in/static-ip-gst-einvoice-api/?utm_source=github&utm_medium=guides) from Mumbai as an authenticated HTTP proxy, one IP per account and kept the same on renewal. For NIC, use the IPv4 plan (₹200 a month plus 18% GST), since NIC does not document IPv6.

## Sources

- https://einv-apisandbox.nic.in/onboarding.html
- https://docs.ewaybillgst.gov.in/Documents/EWB_API.pdf
- https://docs.cleartax.in/cleartax-docs/e-invoicing-gsp-api/e-invoicing-gsp-api-reference
- https://developer.irisgst.com/
- https://www.oracle.com/java/technologies/javase/8u111-relnotes.html
- https://docs.oracle.com/en/java/javase/21/docs/api/java.net.http/module-summary.html
- https://requests.readthedocs.io/en/latest/user/advanced/#proxies

_Maintained by [TrueIP](https://www.trueip.in/?utm_source=github&utm_medium=guides). Last checked 31 October 2026._
