import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

export interface RecipientPolicy {
  allow: string[];
  deny: string[];
  first_seen_hold: boolean;
}

export interface ApprovalPolicy {
  threshold_usd: number;
}

export interface PolicyConfig {
  defaults: {
    on_violation: 'block' | 'allow' | 'require_approval';
    max_per_payment_usd: number;
    max_per_day_usd: number;
    max_per_hour_usd: number;
  };
  recipients: RecipientPolicy;
  detectors: {
    prompt_injection: boolean;
    intent_mismatch: boolean;
    drain_pattern: boolean;
  };
  kill_switch: {
    freeze_on_violation: boolean;
  };
  approval: ApprovalPolicy;
}

export interface PaymentContext {
  to: string;
  amount: number;
  token?: string;
  chain?: string;
  intent?: string;
  timestamp?: number;
}

export interface PolicyEvaluation {
  allowed: boolean;
  reason: string;
  requires_approval: boolean;
}

const DEFAULT_POLICY: PolicyConfig = {
  defaults: {
    on_violation: 'block',
    max_per_payment_usd: 5,
    max_per_day_usd: 50,
    max_per_hour_usd: 20,
  },
  recipients: { allow: [], deny: [], first_seen_hold: true },
  detectors: { prompt_injection: true, intent_mismatch: true, drain_pattern: true },
  kill_switch: { freeze_on_violation: true },
  approval: { threshold_usd: 10 },
};

export class PolicyEngine {
  private config: PolicyConfig;
  private knownRecipients: Set<string> = new Set();

  constructor(input?: string | PolicyConfig) {
    if (!input) {
      this.config = { ...DEFAULT_POLICY };
    } else if (typeof input === 'string') {
      const raw = fs.readFileSync(path.resolve(input), 'utf-8');
      const parsed = YAML.parse(raw) as Partial<PolicyConfig>;
      this.config = this.mergeDefaults(parsed);
    } else {
      this.config = this.mergeDefaults(input);
    }
  }

  private mergeDefaults(partial: Partial<PolicyConfig>): PolicyConfig {
    return {
      defaults: { ...DEFAULT_POLICY.defaults, ...partial.defaults },
      recipients: { ...DEFAULT_POLICY.recipients, ...partial.recipients },
      detectors: { ...DEFAULT_POLICY.detectors, ...partial.detectors },
      kill_switch: { ...DEFAULT_POLICY.kill_switch, ...partial.kill_switch },
      approval: { ...DEFAULT_POLICY.approval, ...partial.approval },
    };
  }

  getConfig(): PolicyConfig {
    return this.config;
  }

  markKnown(address: string): void {
    this.knownRecipients.add(address.toLowerCase());
  }

  evaluate(payment: PaymentContext, context?: { recentPayments?: PaymentContext[] }): PolicyEvaluation {
    const to = payment.to.toLowerCase();

    // Deny list
    if (this.config.recipients.deny.map(a => a.toLowerCase()).includes(to)) {
      return { allowed: false, reason: `Recipient ${payment.to} is on deny list`, requires_approval: false };
    }

    // Allow list bypass
    const onAllowList = this.config.recipients.allow.length > 0 &&
      this.config.recipients.allow.map(a => a.toLowerCase()).includes(to);

    // First-seen hold
    if (this.config.recipients.first_seen_hold && !onAllowList && !this.knownRecipients.has(to)) {
      return { allowed: false, reason: `New recipient ${payment.to} requires approval (first_seen_hold)`, requires_approval: true };
    }

    // Per-payment cap
    if (payment.amount > this.config.defaults.max_per_payment_usd) {
      return { allowed: false, reason: `Amount $${payment.amount} exceeds per-payment cap $${this.config.defaults.max_per_payment_usd}`, requires_approval: false };
    }

    // Approval threshold
    if (payment.amount > this.config.approval.threshold_usd) {
      return { allowed: false, reason: `Amount $${payment.amount} exceeds approval threshold $${this.config.approval.threshold_usd}`, requires_approval: true };
    }

    // Per-hour / per-day caps
    if (context?.recentPayments) {
      const now = payment.timestamp ?? Date.now();
      const hourAgo = now - 3600_000;
      const dayAgo = now - 86400_000;

      const hourlyTotal = context.recentPayments
        .filter(p => (p.timestamp ?? now) >= hourAgo)
        .reduce((sum, p) => sum + p.amount, 0) + payment.amount;

      const dailyTotal = context.recentPayments
        .filter(p => (p.timestamp ?? now) >= dayAgo)
        .reduce((sum, p) => sum + p.amount, 0) + payment.amount;

      if (hourlyTotal > this.config.defaults.max_per_hour_usd) {
        return { allowed: false, reason: `Hourly spend $${hourlyTotal.toFixed(2)} exceeds cap $${this.config.defaults.max_per_hour_usd}`, requires_approval: false };
      }
      if (dailyTotal > this.config.defaults.max_per_day_usd) {
        return { allowed: false, reason: `Daily spend $${dailyTotal.toFixed(2)} exceeds cap $${this.config.defaults.max_per_day_usd}`, requires_approval: false };
      }
    }

    if (onAllowList) {
      return { allowed: true, reason: 'Recipient on allow list', requires_approval: false };
    }

    return { allowed: true, reason: 'Within policy', requires_approval: false };
  }
}
