# Use an authenticated proxy with .NET HttpClient

Your ASP.NET Core API or worker service calls a payment, GST or broker API that only accepts requests from a whitelisted IP. You route those calls through a fixed-IP proxy with a username and password. In .NET the proxy belongs to the handler, not to `HttpClient` itself. You create a `WebProxy`, set its `Credentials` to a `NetworkCredential`, and assign it to `SocketsHttpHandler.Proxy` or `HttpClientHandler.Proxy`. With `IHttpClientFactory`, you do the same thing inside `ConfigurePrimaryHttpMessageHandler`. .NET also reads `HTTPS_PROXY`, `HTTP_PROXY` and `NO_PROXY` from the environment if you don't set a proxy in code.

## Where the proxy setting lives

`HttpClient` sends requests through an `HttpMessageHandler`. On .NET Core 2.1 and later, the main handler is `SocketsHttpHandler`, and `HttpClientHandler` is a wrapper with a similar set of properties. Both have:

- `Proxy`: an `IWebProxy`, usually a `WebProxy`.
- `UseProxy`: whether to use a proxy at all. It defaults to `true`.

If you leave `Proxy` unset and `UseProxy` is `true`, the handler falls back to `HttpClient.DefaultProxy`, which is built from environment variables or the system settings. If you set `UseProxy = false`, no proxy is used, not even one from the environment.

## Code: a single client with an explicit proxy

```csharp
using System.Net;

var handler = new SocketsHttpHandler
{
    Proxy = new WebProxy("http://HOST:PORT")
    {
        // credentials are sent when the proxy answers 407
        Credentials = new NetworkCredential("USER", "PASS")
    },
    UseProxy = true,
    // recycle connections so dns changes are picked up
    PooledConnectionLifetime = TimeSpan.FromMinutes(5)
};

using var client = new HttpClient(handler);

string ip = await client.GetStringAsync("https://ifconfig.co/ip");
Console.WriteLine(ip.Trim());
```

Points to get right:

- **Credentials go on the `WebProxy`, not the handler.** `SocketsHttpHandler.Credentials` is for the target server. The proxy's username and password belong in `WebProxy.Credentials`.
- **Keep one long-lived client.** Microsoft's guidance is either a long-lived `HttpClient` with `PooledConnectionLifetime` set, as above, or short-lived clients from `IHttpClientFactory`. Creating a new handler per request opens a new connection, and a new tunnel through the proxy, every time.
- **Plain password strings are fine.** Because the credentials are separate from the URL, a password with `@` or `:` doesn't need encoding.

If your project still uses `HttpClientHandler`, the same properties exist on it:

```csharp
var handler = new HttpClientHandler
{
    Proxy = new WebProxy("http://HOST:PORT")
    {
        Credentials = new NetworkCredential("USER", "PASS")
    },
    UseProxy = true
};
```

## Code: IHttpClientFactory in ASP.NET Core

Most ASP.NET Core apps register clients in `Program.cs`. Give the whitelisted API its own named client, and configure the proxy only on that one:

```csharp
using System.Net;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddHttpClient("whitelisted-api", client =>
    {
        client.BaseAddress = new Uri("https://api.example.com/");
    })
    .ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler
    {
        Proxy = new WebProxy("http://HOST:PORT")
        {
            Credentials = new NetworkCredential(
                builder.Configuration["Proxy:User"],
                builder.Configuration["Proxy:Pass"])
        },
        UseProxy = true
    });

var app = builder.Build();
```

Then ask the factory for that client by name:

```csharp
public class PayoutService(IHttpClientFactory factory)
{
    public async Task<string> GetStatusAsync()
    {
        HttpClient client = factory.CreateClient("whitelisted-api");
        return await client.GetStringAsync("v1/status");
    }
}
```

Only calls through `whitelisted-api` use the proxy. Your other outbound calls, to logging services or internal APIs, go out normally. That keeps the proxy's bandwidth for the traffic that needs the fixed IP.

Keep `Proxy:User` and `Proxy:Pass` in user secrets, environment variables or your secret store, not in a committed `appsettings.json`.

## Using environment variables instead

If you don't set a proxy in code, `HttpClient.DefaultProxy` is built from the environment first. On Linux, if the variables aren't set, no proxy is used. On Windows and macOS it falls back to the system proxy settings. The variables are:

- `HTTP_PROXY` for HTTP requests, `HTTPS_PROXY` for HTTPS requests.
- `ALL_PROXY` for either, if the specific one isn't set.
- `NO_PROXY`, a comma-separated list of hosts to skip.

On systems with case-sensitive variable names, .NET accepts all lowercase or all uppercase, and checks lowercase first. The value can include credentials, as `http://USER:PASS@HOST:PORT`.

`NO_PROXY` in .NET behaves differently from curl. Microsoft's docs say asterisks aren't supported as wildcards, and a leading dot is needed to match subdomains. `.example.com` matches `www.example.com` but not `example.com`, and `example.com` without the dot doesn't match `www.example.com`. If you need both, list both.

This route is handy in containers, where you set the variables in the deployment instead of the code. The catch is that every `HttpClient` in the process, including SDKs you don't control, now goes through the proxy unless `NO_PROXY` excludes it.

## How to check it worked

Call `https://ifconfig.co/ip` with the same client, or the same named client, that calls the real API. Log the result at startup:

```csharp
// log the egress ip once so a bad deploy is obvious
var probe = factory.CreateClient("whitelisted-api");
string egress = await probe.GetStringAsync("https://ifconfig.co/ip");
logger.LogInformation("Egress IP for whitelisted-api: {Ip}", egress.Trim());
```

An absolute URL overrides the client's `BaseAddress`, so this works on the named client too. The logged IP should match the one on the API provider's whitelist.

## Troubleshooting

- **`HttpRequestException` with status 407.** The proxy rejected the credentials, or they were put on the handler instead of the `WebProxy`.
- **The IP is your server's own.** `UseProxy` is `false`, or the call went through a different client than the one you configured. With the factory, check the client name.
- **Works on your Windows laptop, not on Linux.** On Windows the default proxy can come from your system settings. On Linux there is no such fallback, so set the proxy in code or through the environment.
- **`NO_PROXY` entries don't match.** Remember the leading dot for subdomains, and no `*` wildcards.
- **Some requests are slow to start.** That's the CONNECT round trip on a new connection. Reusing one handler keeps connections, and their tunnels, open between requests.

For other stacks, see the guides for [Java](10-java-httpclient-proxy.md) and [Go](11-go-http-proxy.md).

## Using a dedicated static IP

Any proxy or server with a fixed public IP works with these examples. TrueIP, which maintains this repo, offers [dedicated static IPs for API whitelisting](https://www.trueip.in/static-ip-for-api-whitelisting/?utm_source=github&utm_medium=guides) as an authenticated HTTP proxy with HTTPS CONNECT, with a separate host, port, username and password that map directly onto `WebProxy` and `NetworkCredential`. Each IP is from Mumbai, belongs to a single account and isn't rotated. IPv6 is ₹50 a month and IPv4 ₹200 a month, plus 18% GST, with a GST invoice on every payment.

## Sources

- https://learn.microsoft.com/en-us/dotnet/api/system.net.http.httpclient.defaultproxy
- https://learn.microsoft.com/en-us/dotnet/api/system.net.http.httpclienthandler.useproxy
- https://learn.microsoft.com/en-us/dotnet/api/system.net.http.socketshttphandler
- https://learn.microsoft.com/en-us/dotnet/api/system.net.webproxy.-ctor
- https://learn.microsoft.com/en-us/dotnet/core/extensions/httpclient-factory
- https://learn.microsoft.com/en-us/dotnet/fundamentals/networking/http/httpclient-guidelines

_Maintained by [TrueIP](https://www.trueip.in/?utm_source=github&utm_medium=guides). Last checked 31 October 2026._
