import type { DetectorResult } from './injection.js';

interface PaymentRecord {
  to: string;
  amount: number;
  timestamp: number;
}

const DUST_THRESHOLD = 0.10; // $0.10
const RAPID_WINDOW_MS = 60_000; // 1 minute
const RAPID_COUNT = 5;
const VELOCITY_WINDOW_MS = 300_000; // 5 minutes
const VELOCITY_SPIKE_FACTOR = 5;

export class DrainPatternDetector {
  private history: PaymentRecord[] = [];
  private readonly maxHistory: number;

  constructor(maxHistory = 1000) {
    this.maxHistory = maxHistory;
  }

  record(payment: { to: string; amount: number; timestamp?: number }): void {
    this.history.push({
      to: payment.to.toLowerCase(),
      amount: payment.amount,
      timestamp: payment.timestamp ?? Date.now(),
    });
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(-this.maxHistory);
    }
  }

  analyze(current: { to: string; amount: number; timestamp?: number }): DetectorResult {
    const now = current.timestamp ?? Date.now();
    const to = current.to.toLowerCase();
    const recent = this.history.filter(p => p.timestamp > now - VELOCITY_WINDOW_MS);
    const recentToRecipient = recent.filter(p => p.to === to);

    const reasons: string[] = [];
    let maxConfidence = 0;

    // Pattern 1: Rapid small payments to same recipient (dust-then-drain)
    const recentDustToRecipient = recentToRecipient.filter(p => p.amount < DUST_THRESHOLD);
    if (recentDustToRecipient.length >= RAPID_COUNT) {
      maxConfidence = Math.max(maxConfidence, 0.85);
      reasons.push(`Dust-then-drain: ${recentDustToRecipient.length} small payments (<$${DUST_THRESHOLD}) to same recipient in 5min`);
    }

    // Pattern 2: Many rapid payments to same recipient
    const rapidPayments = recentToRecipient.filter(p => now - p.timestamp < RAPID_WINDOW_MS);
    if (rapidPayments.length >= RAPID_COUNT) {
      maxConfidence = Math.max(maxConfidence, 0.7);
      reasons.push(`Rapid payments: ${rapidPayments.length} payments to ${current.to} in 1 minute`);
    }

    // Pattern 3: Velocity spike
    const baselineWindow = this.history.filter(p => p.timestamp < now - VELOCITY_WINDOW_MS && p.timestamp > now - VELOCITY_WINDOW_MS * 4);
    const baselineRate = baselineWindow.length / 3; // per 5min window avg
    const currentRate = recent.length;
    if (baselineRate > 0 && currentRate > baselineRate * VELOCITY_SPIKE_FACTOR) {
      maxConfidence = Math.max(maxConfidence, 0.65);
      reasons.push(`Velocity spike: ${currentRate} payments vs baseline ${baselineRate.toFixed(1)} per 5min window`);
    }

    // Pattern 4: Circular payments (pay to addresses that recently paid us — simplified heuristic)
    const recipients = new Set(recent.map(p => p.to));
    const senders = new Set(this.history.filter(p => p.timestamp < now && p.timestamp > now - 3600_000).map(p => p.to));
    const circular = [...recipients].filter(r => senders.has(r));
    if (circular.length > 0 && recent.length > 3) {
      maxConfidence = Math.max(maxConfidence, 0.6);
      reasons.push(`Circular payment pattern detected with ${circular.length} addresses`);
    }

    return {
      flagged: maxConfidence >= 0.5,
      confidence: maxConfidence,
      reason: reasons.length > 0 ? reasons.join('; ') : 'No drain patterns detected',
    };
  }
}
