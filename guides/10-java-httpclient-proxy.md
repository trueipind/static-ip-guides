# Use an authenticated proxy with Java HttpClient and OkHttp

Your Java service calls an API that only accepts requests from a whitelisted IP, so you route it through a fixed-IP proxy with a username and password. You set the proxy and an `Authenticator`, run it, and get a 407 or an `IOException` about authentication, even though the credentials are right. The cause is a JDK default that turns off Basic authentication for HTTPS tunnels. The short answer: set `-Djdk.http.auth.tunneling.disabledSchemes=` when you start the JVM, then use `ProxySelector.of(...)` and an `Authenticator` on `java.net.http.HttpClient`. OkHttp doesn't have this problem, and its setup is shown further down.

## Why the 407 happens with correct credentials

When you call an `https://` URL through an HTTP proxy, the client first sends `CONNECT api.example.com:443` to the proxy. The proxy answers 407 and asks for credentials, almost always using the Basic scheme. The client is meant to reply with a `Proxy-Authorization` header.

The JDK ships with a file called `conf/net.properties`, and it contains this line:

```properties
jdk.http.auth.tunneling.disabledSchemes=Basic
```

So by default, the JDK refuses to use Basic authentication when tunnelling HTTPS through a proxy. Your `Authenticator` is never asked, and the request fails. A related property, `jdk.http.auth.proxying.disabledSchemes`, covers plain HTTP proxying and is empty by default. That's why the same code often works for `http://` URLs and fails for `https://` ones.

The fix is to set the tunnelling property to an empty value, so no scheme is disabled.

## Step 1: re-enable Basic for tunnels

Pass the property on the command line, so it is in place before the HTTP client classes load:

```bash
# empty value means no scheme is disabled for https tunnels
java -Djdk.http.auth.tunneling.disabledSchemes= -jar app.jar
```

For a Spring Boot fat jar, a Docker image or a systemd unit, add the same flag to `JAVA_TOOL_OPTIONS` or the start command. Changing `net.properties` inside the JDK also works, but it is easy to lose on the next JDK upgrade.

The property also applies to the older `HttpURLConnection` API, since both read the same `net.properties` file.

## Step 2: HttpClient with a proxy and an Authenticator

```java
import java.net.Authenticator;
import java.net.InetSocketAddress;
import java.net.PasswordAuthentication;
import java.net.ProxySelector;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

public class EgressCheck {
    public static void main(String[] args) throws Exception {
        HttpClient client = HttpClient.newBuilder()
            // one proxy for every request from this client
            .proxy(ProxySelector.of(new InetSocketAddress("HOST", PORT)))
            .authenticator(new Authenticator() {
                @Override
                protected PasswordAuthentication getPasswordAuthentication() {
                    // only answer the proxy, never the target server
                    if (getRequestorType() == RequestorType.PROXY) {
                        return new PasswordAuthentication("USER", "PASS".toCharArray());
                    }
                    return null;
                }
            })
            .connectTimeout(Duration.ofSeconds(10))
            .build();

        HttpRequest request = HttpRequest.newBuilder(URI.create("https://ifconfig.co/ip")).build();
        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
        System.out.println(response.body().trim());
    }
}
```

A few notes on this:

- `ProxySelector.of(...)` gives you a selector that uses one proxy for all requests. If you don't call `.proxy(...)` at all, the client uses the default system selector, which reads the `https.proxyHost` and `https.proxyPort` system properties.
- Supplying your own selector switches that default off, so system properties stop affecting this client. That is usually what you want for a whitelisted API.
- Checking `getRequestorType()` stops the proxy password from being offered to the target server if it ever asks for authentication itself.
- Build the client once and reuse it. Each `HttpClient` keeps its own connection pool.

Run it with the flag from step 1. On Java 11 and later, a single-file program can be run straight from source:

```bash
java -Djdk.http.auth.tunneling.disabledSchemes= EgressCheck.java
```

The printed IP should be the proxy's fixed IP.

## OkHttp: proxy plus proxyAuthenticator

OkHttp does its own proxy handling, so the JDK property above doesn't apply to it. You give it a `java.net.Proxy` and a `proxyAuthenticator`. When the proxy answers the CONNECT with 407, OkHttp calls your authenticator and retries with the header you return.

```java
import java.net.InetSocketAddress;
import java.net.Proxy;
import okhttp3.Credentials;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;

public class OkHttpEgressCheck {
    public static void main(String[] args) throws Exception {
        OkHttpClient client = new OkHttpClient.Builder()
            .proxy(new Proxy(Proxy.Type.HTTP, new InetSocketAddress("HOST", PORT)))
            .proxyAuthenticator((route, response) -> {
                // already sent credentials once, so give up instead of looping
                if (response.request().header("Proxy-Authorization") != null) {
                    return null;
                }
                String credential = Credentials.basic("USER", "PASS");
                return response.request().newBuilder()
                    .header("Proxy-Authorization", credential)
                    .build();
            })
            .build();

        Request request = new Request.Builder().url("https://ifconfig.co/ip").build();
        try (Response response = client.newCall(request).execute()) {
            System.out.println(response.body().string().trim());
        }
    }
}
```

The `header("Proxy-Authorization")` check follows the pattern in OkHttp's own documentation. Without it, wrong credentials make OkHttp resend the same failing request until it hits its limit on follow-up requests.

OkHttp can also send the credentials before the first CONNECT. Before connecting, it calls the proxy authenticator with a fake 407 whose challenge scheme is `OkHttp-Preemptive`. The code above already handles this, because it returns a request with the header for any challenge. That saves one round trip per new connection.

## How to check it worked

1. Run either program and compare the printed IP with the proxy's IP.
2. Run the same call without the proxy. It should print your normal address, for example your office's Airtel or Jio IP.
3. Call the real API. If it still says your IP isn't whitelisted, compare the IP from step 1 with the whitelist entry, including whether it is IPv4 or IPv6.

## Troubleshooting

- **407, or an `IOException` mentioning proxy authentication, on `https://` calls only.** With HttpClient, the tunnelling property isn't set. Print `System.getProperty("jdk.http.auth.tunneling.disabledSchemes")` at startup. It should be an empty string, not `Basic` and not `null`.
- **`Authenticator` never called.** Same cause, or the client was built without `.authenticator(...)`.
- **Works locally, fails in production.** The production start command doesn't pass the `-D` flag. Check the container's `JAVA_TOOL_OPTIONS` or entrypoint.
- **Some calls skip the proxy.** You have more than one `HttpClient` or `OkHttpClient` in the app, and only one has the proxy set. Share a single configured instance.
- **Password with special characters.** Both examples take the password as a plain string, so no URL encoding is needed here.

If you also script the same API from the shell, the [curl and environment variables guide](09-curl-and-proxy-env-vars.md) covers that side.

## Using a dedicated static IP

Any proxy or server with a fixed public IP works with this setup. TrueIP, which maintains this repo, provides [dedicated static IPs for API whitelisting](https://www.trueip.in/static-ip-for-api-whitelisting/?utm_source=github&utm_medium=guides) as an authenticated HTTP proxy that supports HTTPS CONNECT, with its own host, port, username and password, so it fits both the HttpClient and OkHttp examples. The IPs are in Mumbai, never shared with another customer and never rotated. IPv6 is ₹50 a month and IPv4 ₹200 a month, plus 18% GST.

## Sources

- https://docs.oracle.com/en/java/javase/21/docs/api/java.net.http/java/net/http/HttpClient.Builder.html
- https://docs.oracle.com/en/java/javase/21/docs/api/java.net.http/module-summary.html
- https://github.com/openjdk/jdk/blob/master/src/java.base/share/conf/net.properties
- https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/net/Authenticator.html
- https://square.github.io/okhttp/
- https://github.com/square/okhttp/blob/master/okhttp/src/commonJvmAndroid/kotlin/okhttp3/Authenticator.kt

_Maintained by [TrueIP](https://www.trueip.in/?utm_source=github&utm_medium=guides). Last checked 31 October 2026._
