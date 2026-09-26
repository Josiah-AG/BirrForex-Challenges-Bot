# Encrypted shared VPS ingress

Caddy 2.11.4 is checksum-verified and runs visibly in the Administrator desktop session on HTTPS port 80, proxying only to the existing loopback router. The internal CA automatically renews leaf certificates. Its root certificate must be retrieved over verified SSH and configured as VPS_TLS_CA_PEM in MyFxPath; never disable certificate verification. The CA private key stays in the ACL-protected ProgramData directory. Do not commit it.

Install once with elevated `install_tls.ps1`. Keep the visible console open. The task also launches it when Administrator logs in. This does not change MT5/router/worker startup or terminal counts. Certificate state must survive upgrades. Monitor ingress health and certificate expiry in the existing VPS reporting.

Rollback before client cutover: stop only the named TLS task/Caddy PID and remove only the WinnerPip-TLS-Ingress firewall rule. Preserve the protected certificate directory. After cutover, stop ingress only after restoring a validated encrypted client path or disabling new imports; do not silently restore credential-bearing plaintext requests. Existing router port 8000 remains for the legacy companion app during its separate migration.
