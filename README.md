# cerberus

x402 payment firewall for AI agents.

Your agent has a wallet. That means any tool result it trusts can redirect where the money goes. Cerberus sits between your agent and the payment call, checks the intent against the actual transaction, and blocks the ones that don't match.

```bash
npm install cerberus
```

```typescript
import { CerberusGuard } from 'cerberus';

const guard = new CerberusGuard({ policy: 'cerberus.yaml' });

const result = await guard.pay({
  to: '0xAPIProvider...',
  amount: 1.50,
  intent: 'pay for weather API quote $1.50',
});
// throws if blocked, returns decision if allowed
```

---

## What it catches

**Intent redirect.** Prompt injection in a tool result tells the agent to pay a different address. The injection detector scans for override patterns before the payment is constructed.

**Amount inflation.** A compromised tool returns a higher price than the actual API costs. The intent mismatch detector compares the declared intent amount against the actual transaction amount.

**Drain patterns.** Many small payments in quick succession to the same or similar addresses. Velocity limits + dust-then-drain pattern detection.

**New recipient exfil.** Agent is tricked into paying an address it's never paid before. `first_seen_hold: true` in policy requires human approval for new recipients.

---

## Policy

```yaml
defaults:
  on_violation: block
  max_per_payment_usd: 5
  max_per_day_usd: 50

recipients:
  allow: ["0xKnownAPI..."]      # skip first_seen_hold for these
  deny:  ["0xKnownScam..."]     # always block
  first_seen_hold: true

detectors:
  prompt_injection: true
  intent_mismatch: true
  drain_pattern: true

kill_switch:
  freeze_on_violation: true     # auto-freeze wallet on hard block

approval:
  threshold_usd: 10             # require human confirmation above this
```

## CLI

```bash
cerberus report --since 24h     # audit log
cerberus freeze                 # emergency wallet freeze
cerberus resume --auth <token>  # resume after freeze
cerberus check 0xAddress        # quick recipient check
cerberus proxy --policy cerberus.yaml --upstream https://facilitator.example.com
```

## Proxy vs library mode

Library mode: call `guard.pay()` before every payment in your agent code.

Proxy mode: run `cerberus proxy` as a transparent HTTP proxy in front of your x402 facilitator. Nothing in your agent code changes — the proxy intercepts.

Threat model in [docs/threat-model.md](docs/threat-model.md).

## License

MIT
