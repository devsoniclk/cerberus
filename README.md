# Cerberus

Your agent has a wallet. One poisoned tool result and it pays the attacker. **Cerberus stops the payment before it signs.**

Cerberus is an x402 payment firewall and wallet guard for AI agents. It sits between your agent and its wallet, enforcing spending policy, screening for prompt-injection-driven theft, and providing a hard kill switch.

## Attack Classes

| Attack | Description | Cerberus Defense |
|--------|-------------|------------------|
| **Intent Redirect** | Prompt injection tells agent to send funds to attacker | Injection detector scans for override patterns |
| **Amount Inflation** | Compromised tool returns inflated price | Intent mismatch detector compares declared vs actual amount |
| **Drain Pattern** | Many small payments slowly drain wallet | Velocity + pattern detection (dust-then-drain, rapid payments) |
| **New-Recipient Exfil** | Agent tricked into paying unknown address | `first_seen_hold` requires human approval for new addresses |

## 30-Second Quickstart

```bash
# Install
npm install cerberus

# Run with default policy
npx cerberus proxy --policy policies/default.yaml --upstream http://localhost:3000

# Or use as a library
```

```typescript
import { CerberusGuard } from 'cerberus';

const guard = new CerberusGuard({ policy: 'policies/default.yaml' });

try {
  const result = await guard.pay({
    to: '0xAPIProvider...',
    amount: 1.50,
    intent: 'pay for weather API quote $1.50',
  });
  // result.decision === 'allowed' — proceed with signing
} catch (err) {
  // Payment blocked — do not sign
}
```

## CLI

```bash
# Audit report
cerberus report --since 24h

# Emergency freeze
cerberus freeze

# Resume after freeze (requires authorization)
cerberus resume --auth <token>

# Run x402 proxy
cerberus proxy --policy cerberus.yaml --upstream https://facilitator.example.com --port 8787

# Quick address check
cerberus check 0xKnownAPI...
```

## Policy Reference

Policies are YAML files. See [`policies/default.yaml`](policies/default.yaml) for a complete example.

```yaml
defaults:
  on_violation: block          # block | allow | require_approval
  max_per_payment_usd: 5       # hard cap per transaction
  max_per_day_usd: 50          # rolling 24h cap
  max_per_hour_usd: 20         # rolling 1h cap

recipients:
  allow: ["0xKnownAPI..."]     # bypass first_seen_hold
  deny: ["0xScam..."]          # always block
  first_seen_hold: true        # require approval for unknown addresses

detectors:
  prompt_injection: true
  intent_mismatch: true
  drain_pattern: true

kill_switch:
  freeze_on_violation: true    # auto-freeze on hard block

approval:
  threshold_usd: 10            # above this, require human approval
```

## Threat Model

See [docs/threat-model.md](docs/threat-model.md) for a detailed analysis of attack vectors and defense layers.

## Architecture

```
Agent → CerberusGuard.pay() → [Detectors] → [Policy Engine] → Allow/Block/Approve
                                    ↓
                              [Kill Switch] ← auto-freeze on violation
                                    ↓
                              [Audit Log] → JSONL append-only
```

**Library mode:** Import `CerberusGuard` and call `pay()` before every x402 settlement.

**Proxy mode:** Run `cerberus proxy` as a transparent HTTP proxy in front of your x402 facilitator.

## Roadmap

- [ ] On-chain recipient reputation scoring
- [ ] ML-based injection detection
- [ ] Multi-chain support (Solana, Cosmos)
- [ ] Dashboard UI for audit visualization
- [ ] Allow-list auto-learning from successful payments
- [ ] Integration with popular agent frameworks (LangChain, CrewAI)

## License

MIT — see [LICENSE](LICENSE)
