import fs from 'node:fs';
import path from 'node:path';

export interface AuditEvent {
  timestamp: number;
  action: string;
  payment: {
    to: string;
    amount: number;
    token?: string;
    chain?: string;
    intent?: string;
  };
  decision: 'allowed' | 'blocked' | 'requires_approval';
  reason: string;
  detector_results?: Record<string, { flagged: boolean; confidence: number; reason: string }>;
}

export class AuditLog {
  private logPath: string;

  constructor(logPath = 'cerberus-audit.jsonl') {
    this.logPath = path.resolve(logPath);
  }

  log(event: AuditEvent): void {
    const line = JSON.stringify(event) + '\n';
    fs.appendFileSync(this.logPath, line, 'utf-8');
  }

  readAll(): AuditEvent[] {
    if (!fs.existsSync(this.logPath)) return [];
    const content = fs.readFileSync(this.logPath, 'utf-8');
    return content.split('\n').filter(Boolean).map(line => JSON.parse(line) as AuditEvent);
  }

  report(opts?: { since?: number }): {
    total: number;
    allowed: number;
    blocked: number;
    requires_approval: number;
    flagged: number;
    totalAmount: number;
    blockedReasons: string[];
  } {
    let events = this.readAll();
    if (opts?.since) {
      events = events.filter(e => e.timestamp >= opts.since!);
    }

    const blockedReasons = events
      .filter(e => e.decision === 'blocked')
      .map(e => e.reason);

    return {
      total: events.length,
      allowed: events.filter(e => e.decision === 'allowed').length,
      blocked: events.filter(e => e.decision === 'blocked').length,
      requires_approval: events.filter(e => e.decision === 'requires_approval').length,
      flagged: events.filter(e => {
        const results = e.detector_results ?? {};
        return Object.values(results).some(r => r.flagged);
      }).length,
      totalAmount: events.filter(e => e.decision === 'allowed').reduce((s, e) => s + e.payment.amount, 0),
      blockedReasons,
    };
  }
}
