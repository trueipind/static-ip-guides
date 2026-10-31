# Use an authenticated HTTP proxy in Go net/http

Your Go program calls an API that accepts requests only from a whitelisted IP, and that IP belongs to a proxy with a username and password. In Go there's no separate "proxy credentials" setting. You put the username and password in the proxy URL, hand it to `http.ProxyURL`, and set that as the `Proxy` field of an `http.Transport`. Go then sends a `Proxy-Authorization: Basic ...` header on its own, including on the CONNECT request it uses for `https://` URLs. If you prefer environment variables, the default transport already reads `HTTPS_PROXY`, `HTTP_PROXY` and `NO_PROXY`.

## How Go decides on a proxy

The `Transport.Proxy` field is a function that returns the proxy URL for each request. Go's documentation says three things about it that matter here:

- The proxy type comes from the URL scheme. `http`, `https`, `socks5` and `socks5h` are supported, and an empty scheme means `http`.
- If the proxy URL has a userinfo part (`user:pass@`), Go passes the username and password in a `Proxy-Authorization` header.
- If `Proxy` is nil, or returns a nil URL, no proxy is used.

Inside `net/http`, a helper called `proxyAuth()` builds `"Basic " + base64(user:pass)` from the URL's user info. That header goes on plain HTTP requests sent to the proxy, and on the CONNECT request for HTTPS tunnels. You don't need to set it yourself.

`http.DefaultTransport`, which `http.Get` and a zero `http.Client` use, sets `Proxy: http.ProxyFromEnvironment`. So environment variables work out of the box, and setting `Proxy` on a transport overrides them.

## Code: a fixed proxy in the program

```go
package main

import (
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

func main() {
	// url.UserPassword escapes special characters for you
	proxyURL := &url.URL{
		Scheme: "http",
		User:   url.UserPassword("USER", "PASS"),
		Host:   "HOST:PORT",
	}

	// start from the default transport so pooling and timeouts stay sensible
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.Proxy = http.ProxyURL(proxyURL)

	client := &http.Client{
		Transport: transport,
		Timeout:   15 * time.Second,
	}

	resp, err := client.Get("https://ifconfig.co/ip")
	if err != nil {
		fmt.Println("request failed:", err)
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	fmt.Println(resp.Status, string(body))
}
```

Why it is written this way:

- **`url.UserPassword` instead of a string.** Proxy passwords often contain `@`, `:` or `#`. Building the URL from parts means you never have to percent-encode by hand. If you do use `url.Parse("http://USER:PASS@HOST:PORT")`, encode the special characters first (`@` as `%40` and so on).
- **`Clone()` of the default transport.** A bare `&http.Transport{}` has no dial timeout, no idle connection settings and no HTTP/2 attempt. Cloning keeps those defaults and changes only the proxy.
- **One client, reused.** Create the client once at startup and share it. Each transport has its own connection pool, and a new one per request opens a new tunnel through the proxy every time.

## Code: proxy from the environment

If you deploy the same binary in many places, it is often simpler to leave the code alone and set the proxy outside it:

```bash
export HTTPS_PROXY='http://USER:PASS@HOST:PORT'
export HTTP_PROXY='http://USER:PASS@HOST:PORT'
export NO_PROXY='localhost,127.0.0.1,.internal.example.com'
./your-app
```

Plain `http.Get` will now go through the proxy. To keep this behaviour on a custom transport, set `transport.Proxy = http.ProxyFromEnvironment`.

The rules, from Go's docs:

- Go reads `HTTP_PROXY`, `HTTPS_PROXY` and `NO_PROXY`, or their lowercase versions. Lowercase takes precedence.
- Each request uses the variable matching its own scheme. An `https://` call uses `HTTPS_PROXY` only. If you set only `HTTP_PROXY`, HTTPS calls go out directly from your own IP.
- A value can be a full URL or just `host:port`, in which case `http` is assumed.
- Requests to `localhost` (with or without a port) never use the environment proxy.
- `NO_PROXY` accepts host names, IP addresses and CIDR ranges like `10.0.0.0/8`. A domain matches itself and its subdomains. A leading dot, as in `.example.com`, matches subdomains only. A single `*` disables proxying.
- If the process is running as a CGI handler (Go checks for a `REQUEST_METHOD` variable), Go returns an error instead of using `HTTP_PROXY` for plain HTTP requests, because a client request could have set it.

## Extra headers on the CONNECT request

Most proxies only need the `Proxy-Authorization` header, which Go already sends. If yours wants something more on the tunnel request, `Transport.ProxyConnectHeader` takes extra headers to send during CONNECT. For headers that change per request, there's `GetProxyConnectHeader`. You won't need either for a standard username and password proxy.

## How to check it worked

Run the program above. It should print `200 OK` and the proxy's IP. Then run it with `transport.Proxy = nil` and compare. The second run should show your own address, for example your home Airtel or Jio IP.

You can make the check part of your startup, so a misconfigured deploy fails loudly:

```go
// fail fast if traffic is not leaving from the whitelisted ip
const expectedIP = "PROXY_IP_HERE"
if got := strings.TrimSpace(string(body)); got != expectedIP {
	log.Fatalf("egress ip is %s, expected %s", got, expectedIP)
}
```

(Add `"log"` and `"strings"` to the imports if you use this.)

## Troubleshooting

- **`proxyconnect tcp: ... connection refused`.** Go couldn't reach the proxy at all. Check host and port, and whether a firewall blocks outbound traffic to that port.
- **`Proxy Authentication Required` (407).** The credentials were sent but rejected. Check for a typo, and print `proxyURL.Redacted()` to see the URL Go is using with the password masked.
- **HTTPS calls skip the proxy.** Only `HTTP_PROXY` is set, or the host matches an entry in `NO_PROXY`.
- **The environment change isn't picked up.** `ProxyFromEnvironment` reads the variables once per process. Restart the program after changing them.
- **Calls to a local mock server go through the proxy.** Add its host to `NO_PROXY`. `localhost` itself is already excluded.

For the shell side of the same setup, see [curl and proxy environment variables](09-curl-and-proxy-env-vars.md). For services in containers, see [Docker and Kubernetes egress](14-docker-kubernetes-fixed-egress.md).

## Using a dedicated static IP

Any proxy or server with a fixed public IP works with this code. TrueIP, which maintains this repo, sells [static IPs for API whitelisting](https://www.trueip.in/static-ip-for-api-whitelisting/?utm_source=github&utm_medium=guides) delivered as an authenticated HTTP proxy with HTTPS CONNECT, each with its own host, port, username and password, which slot straight into `url.UserPassword` above. The IPs come from Mumbai, are dedicated to one account and stay the same on renewal. IPv6 is ₹50 a month and IPv4 ₹200 a month, plus 18% GST.

## Sources

- https://pkg.go.dev/net/http#Transport
- https://pkg.go.dev/net/http#ProxyFromEnvironment
- https://pkg.go.dev/net/http#ProxyURL
- https://pkg.go.dev/golang.org/x/net/http/httpproxy
- https://github.com/golang/go/blob/master/src/net/http/transport.go
- https://pkg.go.dev/net/url#UserPassword

_Maintained by [TrueIP](https://www.trueip.in/?utm_source=github&utm_medium=guides). Last checked 31 October 2026._
