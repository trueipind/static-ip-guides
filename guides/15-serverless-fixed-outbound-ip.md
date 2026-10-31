# Fixed outbound IP for serverless functions (AWS Lambda, Vercel, Cloudflare Workers)

You wrote a small function to call a payout, GST or exchange API, and that API wants your server's IP on a whitelist. With serverless there is no server IP to give them, because each invocation leaves from whatever address the platform happens to use. You have three ways out: put the function behind a NAT gateway with a fixed IP (on AWS, a VPC plus a NAT gateway with an Elastic IP), buy the platform's static egress add-on if it has one, or send just the whitelisted calls through a fixed-IP HTTP proxy from your function code. The last one works on most platforms that run Node or Python with normal outbound TCP.

## Why serverless functions have no fixed outbound IP

Serverless platforms run your code wherever they have capacity, and they don't promise a source address. Vercel's docs, for example, say functions send outbound requests from a dynamic range of addresses, with no published list to allowlist. AWS Lambda, by default, runs functions in a Lambda-managed network with internet access, but not on an address you control. The address you see today can be different on the next cold start.

## Option 1: AWS Lambda in a VPC with a NAT gateway

On AWS, the standard pattern from the Lambda docs is:

1. Create a VPC with public and private subnets.
2. Put a NAT gateway in a public subnet, and give it an Elastic IP.
3. Route the private subnets' internet traffic (`0.0.0.0/0`) to the NAT gateway.
4. Attach the function to the **private** subnets, with a security group that allows outbound traffic.

AWS is explicit that a function in a public subnet gets no internet access. Once it's in the private subnets, the API sees the NAT gateway's Elastic IP. If you create one NAT gateway per Availability Zone for resilience, which the Lambda docs suggest, you get one Elastic IP per zone, and all of them go on the whitelist.

NAT gateways are billed per hour and per GB processed, so check AWS's pricing for your region before choosing this for a low-traffic function.

## Option 2: the platform's static IP add-on

Some platforms sell fixed egress as a feature. Vercel, for instance, documents a Static IPs option on paid plans. Search your provider's networking docs for "static IP" or "static egress", and check which function types it covers.

## Option 3: a fixed-IP proxy from your function code

If only one or two API calls need a fixed IP, a proxy is usually the smallest change. You route just those requests through an HTTP proxy with a username and password. Store the proxy URL as an environment variable or secret in the function's configuration, not in the code.

### Node.js (Lambda, Vercel or Netlify functions)

Using the `undici` package's `ProxyAgent`, which tunnels HTTPS with CONNECT and builds `Proxy-Authorization` from credentials in the URL:

```js
import { fetch, ProxyAgent } from 'undici';

// create once, outside the handler, so warm invocations reuse it
const proxy = new ProxyAgent(process.env.PROXY_URL); // http://USER:PASS@HOST:PORT

export const handler = async () => {
  // only this call goes through the fixed ip
  const res = await fetch('https://ifconfig.co/ip', { dispatcher: proxy });
  const ip = (await res.text()).trim();
  return { statusCode: 200, body: ip };
};
```

Node 22.21.0 and 24.5.0 added built-in proxy support: setting `NODE_USE_ENV_PROXY=1` along with `HTTPS_PROXY` makes the built-in `fetch()` and `https.request()` use the proxy. It is marked as still in active development, and it affects every request in the process, so the explicit `ProxyAgent` above is easier to reason about. Check which Node version your platform's runtime actually ships before relying on it.

### Python (Lambda)

With `requests`, which you bundle with your function or add as a layer:

```python
import os
import requests

# http://USER:PASS@HOST:PORT, set in the function's environment
PROXIES = {
    "http": os.environ["PROXY_URL"],
    "https": os.environ["PROXY_URL"],
}

session = requests.Session()  # reused across warm invocations

def lambda_handler(event, context):
    # only calls given proxies= go through the fixed ip
    ip = session.get("https://ifconfig.co/ip", proxies=PROXIES, timeout=10).text.strip()
    return {"statusCode": 200, "body": ip}
```

Pass `proxies=` on each request, as above. The requests docs warn that proxies set on `session.proxies` can be overwritten by proxy environment variables. Also avoid setting `HTTPS_PROXY` as a function-wide environment variable unless you want everything to use the proxy. `requests` reads it automatically, and so may other libraries in the function, including SDK clients for other cloud services.

### Cloudflare Workers

Workers are different. Their `fetch()` isn't Node's, and Cloudflare's docs don't describe any setting to send `fetch()` through an HTTP forward proxy. Workers do have a raw TCP sockets API, `connect()` from `cloudflare:sockets`, but speaking CONNECT and TLS over it yourself is far from a config change, and Cloudflare recommends `fetch` over sockets for HTTP on ports 80 and 443.

If a Worker has to call a whitelisted API, the usual answer is to have it call a small backend of yours, on a server or a function that can use a proxy, and let that backend make the whitelisted request.

## Credentials and cold starts

- **Keep the proxy URL secret.** Use the platform's secret or environment variable store. On AWS, Secrets Manager or SSM Parameter Store are common choices.
- **Encode special characters.** If the password has `@`, `:` or `#`, percent-encode it in the URL (`@` as `%40`). undici's docs say it decodes the credentials again.
- **Create clients outside the handler.** Then warm invocations reuse the tunnel instead of opening a new one.
- **Set timeouts.** A function waiting forever on a stuck proxy connection still costs you execution time.

## How to check it worked

Deploy the function with the `ifconfig.co/ip` call above and invoke it a few times, including after a fresh deploy, so you hit a cold start. Every response should show the same IP, and it should be the proxy's IP or the NAT gateway's Elastic IP. If you see different addresses across calls, some requests aren't going through the proxy or NAT.

## Troubleshooting

- **Lambda times out after you attach it to a VPC.** The function is in a subnet without a route to a NAT gateway, or in a public subnet. The Lambda docs show a test function and the timeout error you get when this happens.
- **407 from the proxy.** Wrong credentials, or a password with an unencoded special character.
- **Same code works locally, not in the function.** The environment variable isn't set in the deployed function's configuration, or it was set for a different stage.

For proxies in containers instead of functions, see [Docker and Kubernetes egress](14-docker-kubernetes-fixed-egress.md).

## Using a dedicated static IP

Any fixed-IP proxy, or a server with a static IP, works for Option 3. TrueIP, which maintains this repo, provides [dedicated static IPs for API whitelisting](https://www.trueip.in/static-ip-for-api-whitelisting/?utm_source=github&utm_medium=guides) as an authenticated HTTP proxy (HTTP and HTTPS CONNECT) with its own host, port, username and password, which you put in `PROXY_URL`. The IP is in Mumbai, belongs to one account and isn't rotated. IPv6 is ₹50 a month and IPv4 ₹200 a month, plus 18% GST, and it is live within minutes of payment.

## Sources

- https://docs.aws.amazon.com/lambda/latest/dg/configuration-vpc-internet.html
- https://vercel.com/kb/guide/how-to-allowlist-deployment-ip-address
- https://vercel.com/docs/networking/static-ips
- https://github.com/nodejs/undici/blob/main/docs/docs/api/ProxyAgent.md
- https://nodejs.org/api/http.html#built-in-proxy-support
- https://requests.readthedocs.io/en/latest/user/advanced/#proxies
- https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/
- https://developers.cloudflare.com/workers/runtime-apis/fetch/

_Maintained by [TrueIP](https://www.trueip.in/?utm_source=github&utm_medium=guides). Last checked 31 October 2026._
