# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Cerberus, please report it responsibly:

1. **Do NOT open a public GitHub issue.**
2. Email security concerns to the maintainers privately.
3. Include a description of the vulnerability, steps to reproduce, and potential impact.
4. We will acknowledge within 48 hours and aim to patch critical issues within 7 days.

## Scope

Cerberus is a defense-in-depth layer. It does **not** replace:
- Secure key management (hardware wallets, HSMs, MPC)
- Proper agent sandboxing
- Input validation in upstream tools
- On-chain multisig / timelock mechanisms

## Known Limitations

- **Regex-based injection detection** may miss novel attack patterns. We recommend supplementing with ML-based detection for high-value deployments.
- **USD price estimates** rely on external price feeds; token volatility may cause caps to be inaccurate.
- **In-memory drain detection** resets on restart. Use persistent storage for production.
- **No cryptographic verification** of payment requests — Cerberus inspects content, not signatures.

## Best Practices

1. Always run Cerberus in proxy mode for production
2. Use the kill switch freeze_on_violation feature
3. Review audit logs daily
4. Keep policies conservative; loosen only with evidence
5. Combine with on-chain controls (multisig, spending limits)
