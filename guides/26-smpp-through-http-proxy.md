# Run SMPP through an HTTP proxy with a socat or ncat tunnel

Your SMS provider will only accept an SMPP bind from IP addresses it has registered, and your server either has no fixed IP or sits behind a NAT you do not control. A fixed-IP HTTP proxy can solve this, but SMPP clients cannot use an HTTP proxy by themselves. The answer is a small local tunnel: socat or ncat listens on a local port, opens an HTTP CONNECT through the proxy to the SMSC, and your SMPP client connects to the local port as if it were the SMSC. This guide shows the commands, a systemd unit to keep the tunnel up, and the one thing this cannot do: voice over SIP.

## Why SMPP libraries ignore HTTP proxies

SMPP is a binary protocol over a plain TCP connection. IANA assigns it port 2775, though providers often use other ports. HTTP proxy settings in most software only apply to HTTP requests, so SMPP clients never look at them:

- **python-smpplib** opens a raw `socket.AF_INET` TCP socket straight to the host. There is no proxy option, and it is IPv4 only.
- **jsmpp** (Java) uses `new Socket(host, port)` in its default connection factory. You could write your own `ConnectionFactory` that tunnels, but nothing is built in.
- **node `smpp`** has a "proxy protocol" option, but that is HAProxy's PROXY protocol on the server side, not an HTTP CONNECT client.
- **Kannel** has `http-proxy-*` settings, but they apply to Kannel's own HTTP requests, not to its SMSC links.

HTTP CONNECT, on the other hand, asks the proxy to open a TCP connection and then blindly relay bytes in both directions. The proxy does not care that the bytes are SMPP. So the plan is to let a tunnel tool speak CONNECT, and let your SMPP client speak plain TCP to the tunnel.

## Before you start

- Ask the proxy provider whether CONNECT is allowed to your SMSC's port. Some proxies only allow 443.
- Find out the IP the SMSC will see, then register it with the provider:

```bash
curl -x http://USER:PASS@HOST:PORT https://ifconfig.co
```

- Note your SMSC's hostname and port from the provider's onboarding sheet. Below, `smsc.example.com:2775` stands in for it.

## Option 1: socat

socat's `PROXY` address sends an HTTP CONNECT, with `proxyport` and `proxyauth` options:

```bash
# listen on localhost:2775 and tunnel each connection to the smsc through the proxy
socat TCP-LISTEN:2775,bind=127.0.0.1,reuseaddr,fork \
  PROXY:HOST:smsc.example.com:2775,proxyport=PORT,proxyauth=USER:PASS
```

`fork` gives each SMPP bind its own tunnel, so a transmitter and a receiver bind can run side by side. `bind=127.0.0.1` keeps the port off your public interface. Do not drop that.

## Option 2: ncat

ncat (from the Nmap project) can do the same with `--proxy-type http`:

```bash
# one listener, and a new proxied connection for each client
ncat -l 127.0.0.1 2775 --keep-open \
  --sh-exec "ncat --proxy HOST:PORT --proxy-type http --proxy-auth USER:PASS smsc.example.com 2775"
```

Pick whichever tool your distribution ships. Both are standard packages on Debian, Ubuntu and RHEL-family systems.

## Point your SMPP client at the tunnel

Change only the host and port. Your system ID, password and bind type stay the same.

```python
import smpplib.client

# the tunnel forwards this to the real smsc via the fixed ip
client = smpplib.client.Client("127.0.0.1", 2775)
client.connect()
client.bind_transceiver(system_id="YOUR_SYSTEM_ID", password="YOUR_SMPP_PASSWORD")
print("bound")
client.unbind()
client.disconnect()
```

If the bind succeeds, the SMSC accepted your fixed IP. If the TCP connect works but the provider closes the connection straight away, the IP you registered is probably not the one the proxy uses.

## Keep the tunnel running with systemd

A tunnel you start by hand dies with your SSH session. Put the proxy details in a root-only file and run socat as a service:

```bash
# /etc/smpp-tunnel.env  (chmod 600)
PROXY_HOST=HOST
PROXY_PORT=PORT
PROXY_AUTH=USER:PASS
```

```ini
# /etc/systemd/system/smpp-tunnel-smsc1.service
[Unit]
Description=SMPP tunnel to smsc1 through HTTP proxy
Wants=network-online.target
After=network-online.target

[Service]
EnvironmentFile=/etc/smpp-tunnel.env
ExecStart=/usr/bin/socat TCP-LISTEN:2775,bind=127.0.0.1,reuseaddr,fork PROXY:${PROXY_HOST}:smsc.example.com:2775,proxyport=${PROXY_PORT},proxyauth=${PROXY_AUTH}
Restart=always
RestartSec=5
DynamicUser=yes

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now smpp-tunnel-smsc1
systemctl status smpp-tunnel-smsc1
```

Check the socat path with `command -v socat` first. On some systems it is in `/usr/local/bin`. Keep your client's `enquire_link` interval short (30 to 60 seconds is common), so idle binds do not get closed by a timeout somewhere along the path.

## One tunnel per SMSC

If you connect to more than one SMSC, or a primary and a backup host, run one tunnel each on its own local port: `127.0.0.1:2775` for smsc1, `127.0.0.1:2776` for smsc2, and so on. Copy the unit file with a new name and port. Do not try to share one local port between destinations. The tunnel has no idea which SMSC your client meant.

## TLS-wrapped SMPP

Some providers require TLS on the SMPP connection. Twilio, for example, requires TLS 1.2 or higher. The tunnel still works, because CONNECT carries the TLS bytes untouched. The catch is the server name. Your client connects to `127.0.0.1`, so certificate checks fail, or the server gets the wrong SNI. Either set the TLS server name in your client to the SMSC's real hostname, or add a hosts-file entry mapping that hostname to `127.0.0.1` and connect by name. The tunnel itself passes the hostname to the proxy, so the local hosts entry does not affect where it connects.

## Providers that allowlist your IP

Some providers state this plainly. Twilio's SMPP only accepts connections from a predetermined set of IPs. Sinch restricts SMPP access to pre-registered client IPs by default. Infobip safelists your source IPs if you send from static IPs. None of these pages mention IPv6 for the allowlist, so register an IPv4 address. Some Indian aggregators work the other way round and ask you to whitelist their IPs on your firewall. Read your provider's sheet carefully.

## SIP trunks and voice will not work this way

SIP signalling commonly runs over UDP on port 5060, and the voice itself (RTP) runs over UDP too. A SIP trunk also needs the provider to reach you with incoming calls and media. An HTTP proxy only carries outgoing TCP through CONNECT. It has no UDP and accepts no inbound connections. So you cannot put a SIP trunk or RTP voice behind it, not with socat, not with any tunnel. For SIP you need a server or router with its own static public IP and the right ports open, or a provider that registers your SIP account without IP allowlisting.

## Using a dedicated static IP

Any fixed-IP HTTP proxy that allows CONNECT to your SMSC's port works, as does a server with its own static IP. TrueIP provides [dedicated static IPs for SMPP binds](https://www.trueip.in/static-ip-smpp-sip/?utm_source=github&utm_medium=guides) from Mumbai as an authenticated HTTP proxy, outgoing TCP only, with one IP per account that is never rotated. Since the SMS providers above document IPv4 allowlists, use the IPv4 plan at ₹200 a month plus 18% GST, and note that this covers SMPP only, not SIP voice.

## Sources

- https://smpp.org/
- https://www.iana.org/assignments/service-names-port-numbers/service-names-port-numbers.csv
- https://github.com/python-smpplib/python-smpplib/blob/master/smpplib/client.py
- https://github.com/opentelecoms-org/jsmpp/blob/master/jsmpp/src/main/java/org/jsmpp/session/connection/socket/SocketConnectionFactory.java
- https://github.com/farhadi/node-smpp
- https://www.kannel.org/download/1.4.5/userguide-1.4.5/userguide.html
- http://www.dest-unreach.org/socat/doc/socat.html
- https://nmap.org/book/ncat-man.html#ncat-man-proxy-options
- https://www.rfc-editor.org/rfc/rfc9110#section-9.3.6
- https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html
- https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html
- https://www.twilio.com/docs/smpp/key-concepts
- https://developers.sinch.com/docs/sms/smpp/connectivity
- https://www.infobip.com/docs/essentials/api-essentials/smpp-specification
- https://www.rfc-editor.org/rfc/rfc3261
- https://www.rfc-editor.org/rfc/rfc3550

_Maintained by [TrueIP](https://www.trueip.in/?utm_source=github&utm_medium=guides). Last checked 31 October 2026._
