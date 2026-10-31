# Fixed outbound IP for Docker containers and Kubernetes pods

You moved a service into Docker or Kubernetes, and the bank, broker or GST API it calls started rejecting requests with "IP not whitelisted". Containers don't have a public IP of their own. Their traffic leaves through whatever node they run on, and in a cluster that node can change on every deploy or scale-up. There are two ways to get one predictable IP: send all of the cluster's outbound traffic through a NAT gateway with a fixed public IP, or send only the whitelisted API calls through a fixed-IP proxy, set with environment variables in the container. This guide covers both, with the proxy setup for `docker run`, Compose and Kubernetes.

## Why the outbound IP keeps changing

A container's network traffic is translated to the host's address on the way out. On a single VPS that's stable enough. In a cluster it isn't:

- Pods are scheduled on any node that has room. Each node usually has its own public IP, or none, and gets its outbound address from the cloud's NAT.
- Autoscaling adds and removes nodes, and new nodes get new addresses.
- Managed node pools replace nodes during upgrades.

So today's node IPs on the whitelist can be wrong after tomorrow's deploy.

## Option 1: a NAT gateway with a fixed IP

Most cloud providers let you place nodes in private subnets and route their internet traffic through a managed NAT gateway that you attach a reserved public IP to. Everything leaving the cluster then shows that one address, or a small fixed set if you run one gateway per zone.

This suits you when many services need the same whitelisted IP, or when you can't change application settings. The trade-offs:

- It changes the network design of the whole cluster, not one service.
- Every outbound byte goes through the gateway, which usually has its own hourly and per-GB charges. Check your provider's pricing page.
- With several zones you may end up with several gateway IPs, and all of them have to be whitelisted.

The exact steps differ between providers, so follow your cloud's networking docs.

## Option 2: an HTTP proxy for just the calls that need it

If only one or two integrations need the fixed IP, it is simpler to point those at a fixed-IP proxy. Most HTTP libraries read the standard proxy environment variables, so you can often do this without code changes:

- `HTTPS_PROXY` / `https_proxy` for `https://` URLs.
- `HTTP_PROXY` / `http_proxy` for `http://` URLs.
- `NO_PROXY` / `no_proxy` for hosts that should go direct.

Set both cases. curl reads only the lowercase `http_proxy`, and not every program checks both spellings, so setting both is the safe choice. The [curl guide](09-curl-and-proxy-env-vars.md) has the details, and the [Go](11-go-http-proxy.md), [Java](10-java-httpclient-proxy.md) and [.NET](12-dotnet-httpclient-proxy.md) guides show how each runtime reads them.

### Docker: docker run

Don't put the password on the command line, where it ends up in your shell history. Use an env file instead:

```bash
# proxy.env (keep this file out of git)
HTTPS_PROXY=http://USER:PASS@HOST:PORT
https_proxy=http://USER:PASS@HOST:PORT
HTTP_PROXY=http://USER:PASS@HOST:PORT
http_proxy=http://USER:PASS@HOST:PORT
NO_PROXY=localhost,127.0.0.1,db,redis
no_proxy=localhost,127.0.0.1,db,redis
```

```bash
docker run --rm --env-file proxy.env curlimages/curl -s https://ifconfig.co
```

That command is also your test. It should print the proxy's IP.

Docker also has a client-side setting in `~/.docker/config.json`, under `proxies`, with `httpProxy`, `httpsProxy` and `noProxy` keys. Docker then sets both upper and lowercase variables in every new container and build, which is often more than you want.

Docker's docs warn that environment variables are stored in plain text in the container's configuration. Anyone who can run `docker inspect` on the host can read the proxy password.

### Docker Compose

```yaml
services:
  payouts:
    image: your-org/payouts:latest
    env_file:
      - proxy.env          # proxy settings only for this service
  db:
    image: postgres:16
```

Only the `payouts` service gets the proxy. The database and other services connect directly. (Postgres connections don't use HTTP proxy variables anyway. `db` and `redis` are in `NO_PROXY` for any HTTP calls to those hosts.)

### Kubernetes: proxy settings from a Secret

Store the proxy URL in a Secret:

```bash
kubectl create secret generic egress-proxy \
  --from-literal=url='http://USER:PASS@HOST:PORT'
```

Then load it into the container's environment with `secretKeyRef`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: payouts
spec:
  replicas: 2
  selector:
    matchLabels:
      app: payouts
  template:
    metadata:
      labels:
        app: payouts
    spec:
      containers:
        - name: payouts
          image: your-org/payouts:latest
          env:
            - name: HTTPS_PROXY
              valueFrom:
                secretKeyRef:
                  name: egress-proxy
                  key: url
            - name: https_proxy
              valueFrom:
                secretKeyRef:
                  name: egress-proxy
                  key: url
            - name: HTTP_PROXY
              valueFrom:
                secretKeyRef:
                  name: egress-proxy
                  key: url
            - name: http_proxy
              valueFrom:
                secretKeyRef:
                  name: egress-proxy
                  key: url
            # cluster traffic must not go through the proxy
            - name: NO_PROXY
              value: "localhost,127.0.0.1,.svc,.cluster.local,10.0.0.0/8"
            - name: no_proxy
              value: "localhost,127.0.0.1,.svc,.cluster.local,10.0.0.0/8"
```

If you'd rather keep all the variables in the Secret itself, `envFrom` with a `secretRef` loads every key in the Secret as an environment variable. The key names then have to be the variable names, like `HTTPS_PROXY`.

## Getting NO_PROXY right inside a cluster

Once `HTTPS_PROXY` is set, every client in the pod that honours it sends traffic to the proxy, including calls to other services and the Kubernetes API. The proxy is on the public internet and can't reach any of them.

Entries that usually belong in `NO_PROXY`:

- `localhost` and `127.0.0.1`.
- `.svc` and `.cluster.local`, so service names like `orders.default.svc.cluster.local` go direct. `cluster.local` is the default cluster domain, but your cluster may use another one.
- Your pod and service IP ranges. Clients often connect by IP, and the Kubernetes API address injected into pods (`KUBERNETES_SERVICE_HOST`) is an IP.

CIDR ranges need care, because support varies:

- curl accepts CIDR in `NO_PROXY` from version 7.86.0.
- Go's proxy handling accepts CIDR ranges.
- .NET's docs describe host names with a leading dot for subdomains, and say `*` wildcards aren't supported. They don't mention CIDR.
- Node's built-in proxy support lists exact IPs and IP ranges like `192.168.1.1-192.168.1.100`, but not CIDR.

So if your stack mixes languages, list the specific IPs or ranges in each tool's own format, and test from inside the pod.

## How to check it worked

Run a check from inside a pod, using the same environment:

```bash
kubectl exec deploy/payouts -- sh -c 'curl -s https://ifconfig.co'
```

If your image has no curl, log `https://ifconfig.co/ip` from your app at startup instead. Then check that a cluster-internal call still works, so you know `NO_PROXY` is right.

## Troubleshooting

- **The egress IP is a node IP.** The variables aren't set in the running pod. Check with `kubectl exec ... -- env | grep -i proxy`. Pods only pick up Secret changes in environment variables when they restart.
- **Internal calls time out after adding the proxy.** A service name or IP is missing from `NO_PROXY`.
- **One language works and another doesn't.** That runtime reads a different case of the variable, or doesn't understand your `NO_PROXY` format.
- **407 from the proxy.** Wrong credentials, or special characters in the password that need percent-encoding in the URL.

## Using a dedicated static IP

Either option needs a public IP that doesn't change, from a NAT gateway, your own server or a fixed-IP proxy. TrueIP, which maintains this repo, provides [dedicated static IPs for API whitelisting](https://www.trueip.in/static-ip-for-api-whitelisting/?utm_source=github&utm_medium=guides) as an authenticated HTTP proxy (HTTP and HTTPS CONNECT), which fits Option 2 and the Secret above. It handles outgoing connections only, the IP is in Mumbai and dedicated to one account, and IPv6 is ₹50 a month and IPv4 ₹200 a month, plus 18% GST.

## Sources

- https://docs.docker.com/engine/cli/proxy/
- https://docs.docker.com/reference/cli/docker/container/run/
- https://docs.docker.com/reference/compose-file/services/
- https://kubernetes.io/docs/tasks/inject-data-application/distribute-credentials-secure/
- https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/
- https://kubernetes.io/docs/concepts/services-networking/service/#environment-variables
- https://curl.se/docs/manpage.html
- https://pkg.go.dev/golang.org/x/net/http/httpproxy
- https://learn.microsoft.com/en-us/dotnet/api/system.net.http.httpclient.defaultproxy
- https://nodejs.org/api/http.html

_Maintained by [TrueIP](https://www.trueip.in/?utm_source=github&utm_medium=guides). Last checked 31 October 2026._
