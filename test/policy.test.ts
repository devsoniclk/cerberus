import { describe, it, expect } from 'vitest';
import { PolicyEngine } from '../src/policy.js';

describe('PolicyEngine', () => {
  it('uses default policy when no input given', () => {
    const engine = new PolicyEngine();
    const config = engine.getConfig();
    expect(config.defaults.max_per_payment_usd).toBe(5);
    expect(config.defaults.on_violation).toBe('block');
  });

  it('blocks denied recipients', () => {
    const engine = new PolicyEngine({
      defaults: { on_violation: 'block', max_per_payment_usd: 5, max_per_day_usd: 50, max_per_hour_usd: 20 },
      recipients: { allow: [], deny: ['0xbad'], first_seen_hold: false },
      detectors: { prompt_injection: false, intent_mismatch: false, drain_pattern: false },
      kill_switch: { freeze_on_violation: false },
      approval: { threshold_usd: 10 },
    });
    const result = engine.evaluate({ to: '0xbad', amount: 1 });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('deny list');
  });

  it('allows recipients on allow list', () => {
    const engine = new PolicyEngine({
      defaults: { on_violation: 'block', max_per_payment_usd: 5, max_per_day_usd: 50, max_per_hour_usd: 20 },
      recipients: { allow: ['0xgood'], deny: [], first_seen_hold: true },
      detectors: { prompt_injection: false, intent_mismatch: false, drain_pattern: false },
      kill_switch: { freeze_on_violation: false },
      approval: { threshold_usd: 10 },
    });
    const result = engine.evaluate({ to: '0xgood', amount: 3 });
    expect(result.allowed).toBe(true);
    expect(result.requires_approval).toBe(false);
  });

  it('holds new recipients when first_seen_hold is true', () => {
    const engine = new PolicyEngine({
      defaults: { on_violation: 'block', max_per_payment_usd: 5, max_per_day_usd: 50, max_per_hour_usd: 20 },
      recipients: { allow: [], deny: [], first_seen_hold: true },
      detectors: { prompt_injection: false, intent_mismatch: false, drain_pattern: false },
      kill_switch: { freeze_on_violation: false },
      approval: { threshold_usd: 10 },
    });
    const result = engine.evaluate({ to: '0xnewaddr', amount: 1 });
    expect(result.requires_approval).toBe(true);
  });

  it('blocks payments exceeding per-payment cap', () => {
    const engine = new PolicyEngine({
      defaults: { on_violation: 'block', max_per_payment_usd: 5, max_per_day_usd: 50, max_per_hour_usd: 20 },
      recipients: { allow: [], deny: [], first_seen_hold: false },
      detectors: { prompt_injection: false, intent_mismatch: false, drain_pattern: false },
      kill_switch: { freeze_on_violation: false },
      approval: { threshold_usd: 100 },
    });
    const result = engine.evaluate({ to: '0xanyone', amount: 50 });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('per-payment cap');
  });

  it('requires approval above threshold', () => {
    const engine = new PolicyEngine({
      defaults: { on_violation: 'block', max_per_payment_usd: 100, max_per_day_usd: 1000, max_per_hour_usd: 500 },
      recipients: { allow: [], deny: [], first_seen_hold: false },
      detectors: { prompt_injection: false, intent_mismatch: false, drain_pattern: false },
      kill_switch: { freeze_on_violation: false },
      approval: { threshold_usd: 10 },
    });
    const result = engine.evaluate({ to: '0xanyone', amount: 15 });
    expect(result.requires_approval).toBe(true);
  });

  it('blocks hourly cap exceeded', () => {
    const engine = new PolicyEngine({
      defaults: { on_violation: 'block', max_per_payment_usd: 50, max_per_day_usd: 500, max_per_hour_usd: 10 },
      recipients: { allow: [], deny: [], first_seen_hold: false },
      detectors: { prompt_injection: false, intent_mismatch: false, drain_pattern: false },
      kill_switch: { freeze_on_violation: false },
      approval: { threshold_usd: 100 },
    });
    const now = Date.now();
    const recent = [
      { to: '0xa', amount: 5, timestamp: now - 1000 },
      { to: '0xb', amount: 4, timestamp: now - 2000 },
    ];
    const result = engine.evaluate({ to: '0xc', amount: 3 }, { recentPayments: recent });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Hourly spend');
  });
});
