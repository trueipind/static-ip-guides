# Use a proxy with PHP cURL, Guzzle and the Laravel HTTP client

Your PHP app, maybe a Laravel billing panel or a WordPress plugin calling a payout API, has to send requests from a whitelisted IP. Your hosting server's IP changes, or it is shared, so you route those calls through a fixed-IP proxy with a username and password. With raw cURL you set `CURLOPT_PROXY` and `CURLOPT_PROXYUSERPWD`. With Guzzle you pass a `proxy` request option, as a string or as a per-scheme array. With Laravel's `Http` facade you pass the same Guzzle option through `withOptions()`. All three end up using libcurl, and all three tunnel HTTPS through the proxy with CONNECT.

## Plain PHP cURL

```php
<?php
$ch = curl_init('https://ifconfig.co/ip');

curl_setopt_array($ch, [
    // proxy host and port, an http proxy by default
    CURLOPT_PROXY          => 'HOST:PORT',
    // proxy credentials, kept separate from the url
    CURLOPT_PROXYUSERPWD   => 'USER:PASS',
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CONNECTTIMEOUT => 10,
    CURLOPT_TIMEOUT        => 20,
]);

$ip = curl_exec($ch);

if ($ip === false) {
    echo 'curl error: ' . curl_error($ch) . PHP_EOL;
} else {
    echo trim($ip) . PHP_EOL;
}
```

What each proxy option does, from the PHP manual:

- `CURLOPT_PROXY` is the proxy to send requests through. libcurl accepts `host:port`, and an optional scheme prefix such as `http://`. If you leave out the port, libcurl uses 1080, so always include it.
- `CURLOPT_PROXYUSERPWD` is the proxy username and password, formatted as `username:password`. libcurl URL-decodes it, which matters for special characters (see below).
- `CURLOPT_PROXYTYPE` defaults to `CURLPROXY_HTTP`, which is what you want for an HTTP proxy. You don't need to set it.
- `CURLOPT_PROXYAUTH` defaults to `CURLAUTH_BASIC`, which is what most authenticated proxies use.

### Do you need CURLOPT_HTTPPROXYTUNNEL?

For `https://` URLs, no. curl uses a CONNECT tunnel through an HTTP proxy for HTTPS anyway, so the request and response stay encrypted between you and the API.

`CURLOPT_HTTPPROXYTUNNEL` makes libcurl tunnel *all* traffic with CONNECT, including plain `http://`. Without it, plain HTTP requests are sent to the proxy as ordinary proxy requests. Turn it on only if your proxy expects every connection to be a tunnel, or if you're using a non-HTTP protocol through it. libcurl's docs note that many proxies only allow CONNECT to ports 80 and 443.

### Seeing what happens

Set `CURLOPT_VERBOSE => true` while debugging. libcurl writes the CONNECT request and the proxy's reply to `STDERR`. A `HTTP/1.1 407` there means the credentials were refused. A `200` followed by the TLS handshake means the tunnel is up.

## Guzzle

Guzzle's `proxy` request option takes either a string or an array.

A string applies to every scheme. Credentials go in the URL:

```php
<?php
use GuzzleHttp\Client;

$client = new Client(['timeout' => 20]);

// every request from this call leaves from the fixed ip
$response = $client->request('GET', 'https://ifconfig.co/ip', [
    'proxy' => 'http://USER:PASS@HOST:PORT',
]);

echo trim((string) $response->getBody()) . PHP_EOL;
```

An array lets you set a proxy per scheme and list hosts to skip with a `no` key:

```php
$response = $client->request('GET', 'https://api.example.com/v1/status', [
    'proxy' => [
        'http'  => 'http://USER:PASS@HOST:PORT',
        'https' => 'http://USER:PASS@HOST:PORT',
        'no'    => ['localhost', '.internal.example.com'],
    ],
]);
```

To apply it to every request from a client, pass `'proxy' => ...` in the `new Client([...])` options instead.

Two details from Guzzle's docs:

- Guzzle fills `no` from the `NO_PROXY` environment variable automatically. Once you pass your own `proxy` option, you have to supply `no` yourself, for example `explode(',', getenv('NO_PROXY'))`.
- Guzzle reads `HTTPS_PROXY` from the environment, but `HTTP_PROXY` only under the CLI SAPI. On a web server, an incoming `Proxy:` request header can turn up as `HTTP_PROXY` under CGI, so Guzzle ignores it there. Set the option in code for anything served by PHP-FPM or Apache.

### Passwords with special characters

When credentials sit inside a URL, characters like `@`, `:` and `#` have to be percent-encoded. `rawurlencode()` does it:

```php
$proxy = sprintf(
    'http://%s:%s@%s',
    rawurlencode(getenv('PROXY_USER')),
    rawurlencode(getenv('PROXY_PASS')),
    'HOST:PORT'
);
```

`CURLOPT_PROXYUSERPWD` needs the same care. libcurl URL-decodes both the name and the password before using them, so a `%` in the password, or a colon in the username, has to be encoded. The safe habit is to encode both parts:

```php
curl_setopt($ch, CURLOPT_PROXYUSERPWD,
    rawurlencode(getenv('PROXY_USER')) . ':' . rawurlencode(getenv('PROXY_PASS')));
```

## Laravel HTTP client

Laravel's `Http` facade wraps Guzzle. `withOptions()` passes Guzzle request options through, so the `proxy` option works unchanged:

```php
use Illuminate\Support\Facades\Http;

$response = Http::withOptions([
    'proxy' => 'http://USER:PASS@HOST:PORT',
])->get('https://ifconfig.co/ip');

logger()->info('egress ip', ['ip' => trim($response->body())]);
```

For one integration, wrap it in a small service class or a macro so every call to that API gets the proxy. Avoid `Http::globalOptions()` for this unless you really want all outbound calls through the proxy. That includes webhooks you send, mail APIs and error reporting. Keep the proxy URL in `.env` and read it through a config file, so it doesn't end up in your repository.

## How to check it worked

Each example above fetches `https://ifconfig.co/ip`. Compare the result with the proxy's IP. From the server's shell, the same check is:

```bash
curl -x http://USER:PASS@HOST:PORT https://ifconfig.co
```

If both print the proxy's IP but the API still rejects you, check that the whitelist has that exact address, and whether it is IPv4 or IPv6.

## Troubleshooting

- **A 407 error after CONNECT** (the exact wording depends on your libcurl version). Wrong credentials, or a special character in the password that wasn't encoded.
- **The IP shown is your hosting server's.** The option didn't reach the request. In Laravel, check you called `withOptions()` on the same chain that sends the request.
- **Works in `php artisan tinker`, fails on the website.** You're relying on `HTTP_PROXY` from the environment, which Guzzle only reads on the CLI. Set `proxy` in code.
- **Timeouts on shared hosting.** Some hosts block outbound connections to unusual ports. Ask whether the proxy's port is open, or test with `curl -v` over SSH.

For the shell and environment variable side, see [curl and proxy environment variables](09-curl-and-proxy-env-vars.md).

## Using a dedicated static IP

Any proxy or server with a fixed public IP works with this code. TrueIP, which maintains this repo, provides [static IPs for API whitelisting](https://www.trueip.in/static-ip-for-api-whitelisting/?utm_source=github&utm_medium=guides) as an authenticated HTTP proxy (HTTP and HTTPS CONNECT) with its own host, port, username and password, which fit `CURLOPT_PROXY` or Guzzle's `proxy` option directly. The IPs are from Mumbai, dedicated to one account and kept on renewal. IPv6 is ₹50 a month and IPv4 ₹200 a month, plus 18% GST.

## Sources

- https://www.php.net/manual/en/curl.constants.php
- https://www.php.net/manual/en/function.curl-setopt.php
- https://curl.se/libcurl/c/CURLOPT_PROXY.html
- https://curl.se/libcurl/c/CURLOPT_PROXYUSERPWD.html
- https://curl.se/libcurl/c/CURLOPT_HTTPPROXYTUNNEL.html
- https://everything.curl.dev/usingcurl/proxies/http.html
- https://docs.guzzlephp.org/en/stable/request-options.html#proxy
- https://docs.guzzlephp.org/en/stable/quickstart.html#environment-variables
- https://laravel.com/docs/http-client#guzzle-options

_Maintained by [TrueIP](https://www.trueip.in/?utm_source=github&utm_medium=guides). Last checked 31 October 2026._
