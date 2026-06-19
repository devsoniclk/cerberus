export interface DetectorResult {
  flagged: boolean;
  confidence: number;
  reason: string;
}

const INJECTION_PATTERNS: Array<{ pattern: RegExp; reason: string; weight: number }> = [
  { pattern: /ignore\s+(all\s+)?previous\s+(instructions|prompts|rules)/i, reason: 'Prompt injection: "ignore previous instructions"', weight: 0.95 },
  { pattern: /send\s+(all\s+)?(funds|tokens|eth|usdc|money)\s+to\s+0x[a-fA-F0-9]{20,}/i, reason: 'Injection: redirect funds to attacker address', weight: 0.9 },
  { pattern: /transfer\s+(all|everything|entire)\s+(balance|funds)/i, reason: 'Injection: "transfer all balance"', weight: 0.9 },
  { pattern: /you\s+are\s+now\s+(a|an)\s+/i, reason: 'Injection: role override attempt', weight: 0.7 },
  { pattern: /system:\s*/i, reason: 'Injection: fake system prompt', weight: 0.6 },
  { pattern: /forget\s+(everything|all|your\s+rules)/i, reason: 'Injection: "forget everything"', weight: 0.85 },
  { pattern: /override\s+(security|policy|limits)/i, reason: 'Injection: policy override attempt', weight: 0.8 },
  { pattern: /0x[a-fA-F0-9]{40}/g, reason: 'Embedded Ethereum address in request', weight: 0.3 },
  { pattern: /new\s+instructions?\s*:/i, reason: 'Injection: "new instructions" directive', weight: 0.75 },
];

export class InjectionDetector {
  scan(text: string): DetectorResult {
    if (!text || text.trim().length === 0) {
      return { flagged: false, confidence: 0, reason: 'No context to scan' };
    }

    let maxConfidence = 0;
    const reasons: string[] = [];

    for (const { pattern, reason, weight } of INJECTION_PATTERNS) {
      if (pattern.test(text)) {
        maxConfidence = Math.max(maxConfidence, weight);
        reasons.push(reason);
        // Reset lastIndex for global patterns
        pattern.lastIndex = 0;
      }
    }

    // Count embedded addresses
    const addressMatches = text.match(/0x[a-fA-F0-9]{40}/g);
    if (addressMatches && addressMatches.length >= 2) {
      maxConfidence = Math.max(maxConfidence, 0.5);
      reasons.push(`Multiple embedded addresses (${addressMatches.length})`);
    }

    return {
      flagged: maxConfidence >= 0.5,
      confidence: maxConfidence,
      reason: reasons.length > 0 ? reasons.join('; ') : 'No injection patterns detected',
    };
  }
}
