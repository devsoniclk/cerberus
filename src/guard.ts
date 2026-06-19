import { PolicyEngine, type PolicyConfig, type PaymentContext } from './policy.js';
import { InjectionDetector } from './detectors/injection.js';
import { IntentMismatchDetector } from './detectors/intent.js';
import { DrainPatternDetector } from './detectors/drain.js';
import { KillSwitch } from './killswitch.js';
import { AuditLog, type AuditEvent } from './audit.js';

export interface PaymentRequest {
  to: string;
  amount: number;
  token?: string;
  chain?: string;
  intent?: string;
}

export interface PaymentResult {
  decision: 'allowed' | 'blocked' | 'requires_approval';
  reason: string;
  detectorResults: Record<string, { flagged: boolean; confidence: number; reason: string }>;
}

export class PolicyViolation extends Error {
  result: PaymentResult;
  constructor(result: PaymentResult) {
    super(result.reason);
    this.name = 'PolicyViolation';
    this.result = result;
  }
}

export class CerberusGuard {
  readonly policy: PolicyEngine;
  readonly killSwitch: KillSwitch;
  readonly audit: AuditLog;
  private injectionDetector: InjectionDetector;
  private intentDetector: IntentMismatchDetector;
  private drainDetector: DrainPatternDetector;
  private paymentHistory: PaymentContext[] = [];

  constructor(opts: { policy?: string | PolicyConfig; auditLog?: string }) {
    this.policy = new PolicyEngine(opts.policy);
    this.killSwitch = new KillSwitch();
    this.audit = new AuditLog(opts.auditLog);
    this.injectionDetector = new InjectionDetector();
    this.intentDetector = new IntentMismatchDetector();
    this.drainDetector = new DrainPatternDetector();

    // Auto-freeze on kill switch violation if configured
    this.killSwitch.on('freeze', () => {
      // Logged automatically
    });
  }

  async pay(req: PaymentRequest): Promise<PaymentResult> {
    // Check kill switch first
    if (this.killSwitch.isFrozen()) {
      const result: PaymentResult = {
        decision: 'blocked',
        reason: 'Kill switch is active — all payments frozen',
        detectorResults: {},
      };
      this.logAudit(req, result);
      throw new PolicyViolation(result);
    }

    const detectorResults: Record<string, { flagged: boolean; confidence: number; reason: string }> = {};
    const config = this.policy.getConfig();
    let shouldBlock = false;
    let shouldRequireApproval = false;
    const blockReasons: string[] = [];

    // Run detectors
    if (config.detectors.prompt_injection) {
      const injectionText = `${req.intent ?? ''} ${req.to}`;
      const r = this.injectionDetector.scan(injectionText);
      detectorResults['prompt_injection'] = r;
      if (r.flagged) {
        shouldBlock = true;
        blockReasons.push(`Injection: ${r.reason}`);
      }
    }

    if (config.detectors.intent_mismatch) {
      const r = this.intentDetector.analyze(req.intent, { to: req.to, amount: req.amount, token: req.token });
      detectorResults['intent_mismatch'] = r;
      if (r.flagged) {
        shouldBlock = true;
        blockReasons.push(`Intent mismatch: ${r.reason}`);
      }
    }

    if (config.detectors.drain_pattern) {
      const r = this.drainDetector.analyze({ to: req.to, amount: req.amount });
      detectorResults['drain_pattern'] = r;
      if (r.flagged) {
        shouldBlock = true;
        blockReasons.push(`Drain pattern: ${r.reason}`);
      }
    }

    // Policy evaluation
    const policyResult = this.policy.evaluate(
      { to: req.to, amount: req.amount, token: req.token, chain: req.chain, intent: req.intent },
      { recentPayments: this.paymentHistory },
    );

    if (!policyResult.allowed && !policyResult.requires_approval) {
      shouldBlock = true;
      blockReasons.push(`Policy: ${policyResult.reason}`);
    }
    if (policyResult.requires_approval) {
      shouldRequireApproval = true;
      blockReasons.push(`Approval required: ${policyResult.reason}`);
    }

    // Build result
    let decision: PaymentResult['decision'];
    let reason: string;

    if (shouldBlock) {
      decision = 'blocked';
      reason = blockReasons.join('; ');
      // Auto-freeze on hard violation if configured
      if (config.kill_switch.freeze_on_violation) {
        this.killSwitch.freeze(`Auto-freeze on violation: ${reason}`);
      }
    } else if (shouldRequireApproval) {
      decision = 'requires_approval';
      reason = blockReasons.join('; ');
    } else {
      decision = 'allowed';
      reason = policyResult.reason;
      // Record successful payment
      this.paymentHistory.push({ to: req.to, amount: req.amount, token: req.token, chain: req.chain, intent: req.intent, timestamp: Date.now() });
      this.drainDetector.record({ to: req.to, amount: req.amount });
      this.policy.markKnown(req.to);
    }

    const result: PaymentResult = { decision, reason, detectorResults };
    this.logAudit(req, result);

    if (decision === 'blocked') {
      throw new PolicyViolation(result);
    }

    return result;
  }

  private logAudit(req: PaymentRequest, result: PaymentResult): void {
    const event: AuditEvent = {
      timestamp: Date.now(),
      action: 'pay',
      payment: { to: req.to, amount: req.amount, token: req.token, chain: req.chain, intent: req.intent },
      decision: result.decision,
      reason: result.reason,
      detector_results: result.detectorResults,
    };
    this.audit.log(event);
  }
}
