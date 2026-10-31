# Use a proxy with curl and the HTTPS_PROXY environment variables

You have a fixed-IP proxy and an API that only accepts calls from that IP. You want curl, wget, pip or git to go through it, from a shell script or a cron job. The short answer: pass `-x http://USER:PASS@HOST:PORT` to curl for a one-off request, or export `https_proxy` and `http_proxy` (lowercase is the safe choice) so that every tool in that shell picks them up. Then confirm with `curl -v` that the CONNECT succeeds and that `https://ifconfig.co` shows the proxy's IP, not yours.

## The one-line version

```bash
# every request leaves from the proxy's fixed ip
curl -x http://USER:PASS@HOST:PORT https://ifconfig.co
```

If you'd rather keep the credentials out of the URL, curl has a separate flag for them:

```bash
curl -x http://HOST:PORT --proxy-user 'USER:PASS' https://api.example.com/v1/status
```

A few things worth knowing about `-x` (also spelled `--proxy`):

- With no scheme, or with `http://`, curl treats it as an HTTP proxy.
- If you leave out the port, curl assumes **1080**, not 80 or 8080. Always write the port.
- `-x` overrides any proxy environment variable. Setting `-x ""` turns the proxy off for that call.
- For an `https://` URL, curl opens a tunnel with the HTTP `CONNECT` method. The proxy only sees the host name and port. Your request and the API's reply stay encrypted end to end.

## Passwords with special characters

Proxy passwords often contain `@`, `:` or `#`. Inside a URL these characters break the parsing, because `@` marks the end of the credentials and `:` separates user from password.

curl URL-decodes the user and password in the proxy string, so you percent-encode them first. `@` becomes `%40`, `:` becomes `%3A`, `#` becomes `%23`. A password of `p@ss:wd` goes in as `p%40ss%3Awd`:

```bash
curl -x 'http://USER:p%40ss%3Awd@HOST:PORT' https://ifconfig.co
```

`--proxy-user` is a little more forgiving. You can type `@` and `#` as they are, in single quotes so the shell leaves them alone, and the password can contain a colon because curl splits at the first one. curl still URL-decodes these values, though, so a `%` in the password must be written as `%25`. The URL encoding rule applies to every tool below that reads a proxy URL.

## The environment variables

Setting the proxy once in the environment saves you from editing every command. curl's own rules, from its manual:

| Variable | Used for | Case |
|---|---|---|
| `http_proxy` | `http://` URLs | lowercase only |
| `HTTPS_PROXY` / `https_proxy` | `https://` URLs | either; lowercase wins if both are set |
| `ALL_PROXY` / `all_proxy` | any scheme without its own variable | either |
| `NO_PROXY` / `no_proxy` | hosts to reach directly | either |

The `http_proxy` exception has a security background. Under CGI, request headers become environment variables, so an incoming `Proxy:` header can show up as `HTTP_PROXY`. Guzzle's docs give this reason for reading `HTTP_PROXY` only on the command line, and Go's proxy code refuses it when it detects CGI.

The most common mistake is setting only `http_proxy` and then calling an `https://` API. curl picks the variable that matches the URL's scheme, so the HTTPS call goes out directly from your own IP and the API rejects it. Set both:

```bash
# set both, lowercase is honoured by the widest set of tools
export http_proxy='http://USER:PASS@HOST:PORT'
export https_proxy='http://USER:PASS@HOST:PORT'
export no_proxy='localhost,127.0.0.1,.internal.example.com'

curl https://ifconfig.co
```

Note that `https_proxy` still starts with `http://`. The variable name refers to the URL you are fetching. The value describes how to talk to the proxy, and an HTTP proxy is reached over plain HTTP before the tunnel opens.

## Which other tools honour these

Not every program reads the same variables, so check before you rely on them.

- **wget** documents the lowercase `http_proxy`, `https_proxy` and `no_proxy`. It accepts credentials in the proxy URL, or through `--proxy-user` and `--proxy-password`. Only Basic proxy authentication is implemented.
- **pip** reads `http_proxy`, `https_proxy` and `no_proxy`, and also takes `--proxy` in the form `scheme://[user:passwd@]proxy.server:port`.
- **git** uses curl underneath. It honours `http_proxy`, `https_proxy` and `all_proxy`, and `git config http.proxy` overrides them.

```bash
wget --proxy-user='USER' --proxy-password='PASS' -qO- https://ifconfig.co
pip install --proxy http://USER:PASS@HOST:PORT requests
git config --global http.proxy http://USER:PASS@HOST:PORT
```

Be careful with `git config --global`. It writes the password into `~/.gitconfig` in plain text, and every clone from then on goes through the proxy. Scope it to one remote if that is all you need.

## NO_PROXY, and what it matches

`no_proxy` is a comma-separated list. In curl, each entry matches that host name or any host under it, so `example.com` covers `www.example.com` too. A lone `*` disables the proxy for everything. From curl 7.86.0 you can also give IP ranges in CIDR form, like `192.168.0.0/16`. Older curl versions, and some other tools, don't understand CIDR, so test it on your machine with `curl --version` before relying on it.

## How to check it worked

`-v` shows the conversation with the proxy before the TLS handshake:

```bash
curl -v -x http://USER:PASS@HOST:PORT https://ifconfig.co
```

In the output, look for:

- `> CONNECT ifconfig.co:443 HTTP/1.1`. curl is asking the proxy to open the tunnel.
- `< HTTP/1.1 200` right after it. The proxy accepted your credentials and the tunnel is up.
- At the very end, the IP printed by ifconfig.co. It should be the proxy's fixed IP.

If you see `HTTP/1.1 407` instead, the proxy rejected the credentials. Typical causes are a typo, a password with an unencoded `@` or `:`, or an expired subscription. Percent-encode the credentials, or move them to `--proxy-user`, then check the details again.

If the tunnel is never attempted and ifconfig.co shows your Jio or Airtel address, curl isn't using the proxy at all. Check `env | grep -i proxy` for a missing `https_proxy` or a `no_proxy` entry that matches the host.

## Troubleshooting

- **Works in your terminal, fails in cron.** Cron doesn't load your shell profile, so the exported variables aren't there. Set them at the top of the crontab or inside the script.
- **`sudo` loses the variables.** By default sudo resets the environment. Use `sudo -E` or pass `-x` explicitly.
- **Connection refused on the proxy port.** Check you wrote the port. Without one, curl tries 1080.
- **API still says "IP not whitelisted".** Print the IP from ifconfig.co through the proxy and make sure that exact address, IPv4 or IPv6, is the one on the whitelist.

For language-specific setups, see the guides for [Go](11-go-http-proxy.md), [Java](10-java-httpclient-proxy.md) and [containers](14-docker-kubernetes-fixed-egress.md).

## Using a dedicated static IP

Any proxy or server with a fixed public IP works with everything above. TrueIP, which maintains this repo, offers [dedicated static IPs from Mumbai](https://www.trueip.in/static-ip-for-api-whitelisting/?utm_source=github&utm_medium=guides) delivered as an authenticated HTTP proxy (HTTP and HTTPS CONNECT) with its own host, port, username and password, so the `-x` and `https_proxy` examples work as written. Each IP belongs to one account, is never rotated and stays the same on renewal. IPv6 costs ₹50 a month and IPv4 ₹200 a month, plus 18% GST.

## Sources

- https://curl.se/docs/manpage.html
- https://everything.curl.dev/usingcurl/proxies/http.html
- https://curl.se/libcurl/c/CURLOPT_PROXYUSERPWD.html
- https://www.gnu.org/software/wget/manual/html_node/Proxies.html
- https://www.gnu.org/software/wget/manual/wget.html
- https://pip.pypa.io/en/stable/user_guide/
- https://git-scm.com/docs/git-config
- https://docs.guzzlephp.org/en/stable/quickstart.html
- https://pkg.go.dev/golang.org/x/net/http/httpproxy

_Maintained by [TrueIP](https://www.trueip.in/?utm_source=github&utm_medium=guides). Last checked 31 October 2026._
