# Use an authenticated HTTP proxy in Node.js (axios, fetch, ws)

Your Node.js service calls an API that only accepts whitelisted IPs, and you need those calls to leave from a fixed IP through an HTTP proxy with a username and password. Node's HTTP clients don't all handle proxies the same way, so this guide gives a working setup for axios, for `fetch` through undici, and for websockets with `ws`, plus how to check the egress IP. The short answer: create one proxy agent from `http://USER:PASS@HOST:PORT` and hand it to every client that talks to the whitelisted API.

## How HTTPS through a proxy works

For an `https://` URL, the client sends `CONNECT api.example.com:443` to the proxy, with a `Proxy-Authorization` header carrying your proxy username and password. The proxy opens a TCP connection to the API and then relays bytes. TLS runs between your process and the API server, so the proxy can't read your API keys or responses. The API sees the proxy's outgoing IP.

Install the packages used below:

```bash
npm install axios https-proxy-agent undici ws
```

## axios with https-proxy-agent

`https-proxy-agent` gives you an agent that tunnels HTTPS through an HTTP proxy with CONNECT. Credentials in the URL are sent as a Basic `Proxy-Authorization` header.

```javascript
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

const agent = new HttpsProxyAgent('http://USER:PASS@HOST:PORT');

// proxy: false stops axios applying its own proxy logic or env vars on top
const api = axios.create({
  baseURL: 'https://api.example.com',
  httpsAgent: agent,
  proxy: false,
  timeout: 15000,
});

const res = await api.get('/v1/account');
console.log(res.status);
```

`proxy: false` matters. Without it, axios also looks at its own `proxy` setting and the `http_proxy` and `https_proxy` environment variables, and may apply its own proxy handling on top of the agent. axios documents `false` as the way to disable its proxy handling, environment variables included.

axios also has a built-in `proxy` option (`protocol`, `host`, `port`, `auth: { username, password }`). We use the agent approach here because the same agent object can be reused for `ws` and Node's `https` module.

## fetch with undici ProxyAgent

Node's built-in `fetch` is powered by undici. The `undici` package exports a `ProxyAgent` that you pass as the `dispatcher`:

```javascript
import { fetch, ProxyAgent } from 'undici';

// credentials in the uri become the proxy-authorization header
const dispatcher = new ProxyAgent('http://USER:PASS@HOST:PORT');

const res = await fetch('https://api.example.com/v1/account', { dispatcher });
console.log(res.status);
```

`ProxyAgent` also accepts an options object with `uri`, and a `token` option for a preformatted `Proxy-Authorization` value. If you pass neither `token` nor `auth`, undici builds the header from the username and password in the URI. The older `auth` option is marked deprecated in favour of `token`.

To route all undici requests through the proxy without passing `dispatcher` each time:

```javascript
import { ProxyAgent, setGlobalDispatcher } from 'undici';

// every undici request in this process now uses the proxy
setGlobalDispatcher(new ProxyAgent('http://USER:PASS@HOST:PORT'));
```

We import `fetch` from `undici` above instead of using the global one, so the dispatcher and the fetch implementation come from the same package version.

## Websockets with ws

Exchange feeds and trading APIs often have a websocket next to the REST API. If the REST calls go through the proxy and the websocket connects directly, the websocket comes from your own IP and may be rejected. `ws` passes extra options through to Node's `https.request`, so an agent works:

```javascript
import WebSocket from 'ws';
import { HttpsProxyAgent } from 'https-proxy-agent';

const agent = new HttpsProxyAgent('http://USER:PASS@HOST:PORT');

// the websocket handshake also leaves from the fixed ip
const ws = new WebSocket('wss://stream.example.com/ws', { agent });

ws.on('open', () => console.log('connected'));
ws.on('message', (data) => console.log(data.toString()));
```

## Environment variables

undici has an `EnvHttpProxyAgent` that reads `http_proxy`, `https_proxy` and `no_proxy` (uppercase also works, and lowercase wins if both are set):

```javascript
import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';

// picks up HTTPS_PROXY and NO_PROXY from the environment
setGlobalDispatcher(new EnvHttpProxyAgent());
```

Recent Node versions (from 22.21 and 24.5) can also read these variables themselves when started with `NODE_USE_ENV_PROXY=1` or `--use-env-proxy`. The docs mark this as active development, so test it on your exact Node version before relying on it:

```bash
NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://USER:PASS@HOST:PORT node bot.js
```

As with any setup, a `NO_PROXY` entry that matches the API host sends those calls direct, from your own IP.

## Passwords with special characters

If the password contains `@`, `:`, `/`, `#` or `%`, encode the username and password before building the URL:

```javascript
const user = encodeURIComponent('my.user');
const pass = encodeURIComponent('p@ss:w/rd#1');

// encoded credentials, plain host and port
const proxyUrl = `http://${user}:${pass}@HOST:PORT`;
```

undici and https-proxy-agent both decode the credentials before building the `Proxy-Authorization` header.

## How to check it worked

Fetch `https://ifconfig.co` through the same agent your code uses:

```javascript
import { fetch, ProxyAgent } from 'undici';

const dispatcher = new ProxyAgent('http://USER:PASS@HOST:PORT');
// should print the proxy's fixed ip, not your own
console.log((await (await fetch('https://ifconfig.co', { dispatcher })).text()).trim());
```

Or from the shell, on the same machine:

```bash
curl -x http://USER:PASS@HOST:PORT https://ifconfig.co
```

Whitelist that address, then make one signed read-only call to the real API, and open the websocket to confirm it is accepted too.

## Troubleshooting

- **407 from the proxy.** Wrong credentials, or special characters not encoded.
- **REST works, websocket rejected.** The websocket is not using the agent. Pass `{ agent }` to `ws`, or set your SDK's websocket proxy option.
- **Random "IP not whitelisted" failures.** Some code path skips the proxy, or calls go direct over IPv6. See [dual-stack IP mismatch](05-dual-stack-ip-mismatch.md).
- **An SDK ignores your agent.** Many API SDKs wrap axios or fetch. Check the SDK's docs for an `httpsAgent`, `dispatcher` or proxy option.

## Using a dedicated static IP

Any fixed-IP HTTP proxy, or a server with a static IP, works with the code above. [TrueIP](https://www.trueip.in/?utm_source=github&utm_medium=guides) provides dedicated static IPs from Mumbai as an authenticated HTTP proxy (HTTP and HTTPS CONNECT, no SOCKS) with its own host, port, username and password, for outgoing connections only, one IP per account and never rotated. IPv6 is ₹50 a month and IPv4 ₹200 a month, plus 18% GST.

## Sources

- https://github.com/TooTallNate/proxy-agents/tree/main/packages/https-proxy-agent
- https://axios.rest/pages/advanced/request-config
- https://github.com/nodejs/undici/blob/main/docs/docs/api/ProxyAgent.md
- https://github.com/nodejs/undici/blob/main/docs/docs/api/EnvHttpProxyAgent.md
- https://github.com/websockets/ws/blob/master/doc/ws.md
- https://nodejs.org/api/http.html#built-in-proxy-support
- https://nodejs.org/api/cli.html#node_use_env_proxy1
- https://www.rfc-editor.org/rfc/rfc9110#section-9.3.6

_Maintained by [TrueIP](https://www.trueip.in/?utm_source=github&utm_medium=guides). Last checked 31 October 2026._
