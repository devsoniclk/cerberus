import type { DetectorResult } from './injection.js';

function extractAmount(text: string): number | null {
  const match = text.match(/\$?\s*([\d,]+(?:\.\d+)?)\s*(usd|dollars?)?/i);
  if (match) {
    return parseFloat(match[1].replace(/,/g, ''));
  }
  return null;
}

function extractKeywords(text: string): string[] {
  const stopwords = new Set(['the', 'a', 'an', 'for', 'to', 'and', 'of', 'in', 'on', 'is', 'it', 'that', 'this', 'with', 'from', 'as', 'by', 'at', 'or', 'be', 'was', 'are', 'been', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'shall', 'can', 'need', 'must', 'i', 'we', 'you', 'they', 'he', 'she', 'my', 'our', 'your', 'their', 'me', 'us', 'them', 'pay', 'send', 'transfer', 'payment']);
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2 && !stopwords.has(w));
}

export class IntentMismatchDetector {
  analyze(intent: string | undefined, payment: { to: string; amount: number; token?: string }): DetectorResult {
    if (!intent || intent.trim().length === 0) {
      return { flagged: false, confidence: 0, reason: 'No intent declared' };
    }

    const reasons: string[] = [];
    let maxConfidence = 0;

    // Amount mismatch: if intent mentions a price, compare
    const intentAmount = extractAmount(intent);
    if (intentAmount !== null && intentAmount > 0) {
      const ratio = payment.amount / intentAmount;
      if (ratio > 10) {
        maxConfidence = Math.max(maxConfidence, 0.9);
        reasons.push(`Payment $${payment.amount} is ${ratio.toFixed(0)}x the declared intent $${intentAmount}`);
      } else if (ratio > 3) {
        maxConfidence = Math.max(maxConfidence, 0.6);
        reasons.push(`Payment $${payment.amount} is ${ratio.toFixed(1)}x the declared intent $${intentAmount}`);
      }
    }

    // Check for suspicious mismatch between intent context and payment params
    const keywords = extractKeywords(intent);
    const paymentContext = `${payment.to} ${payment.token ?? ''}`.toLowerCase();
    const keywordMatches = keywords.filter(kw => paymentContext.includes(kw));

    if (keywords.length > 3 && keywordMatches.length === 0) {
      maxConfidence = Math.max(maxConfidence, 0.5);
      reasons.push('No overlap between intent keywords and payment params');
    }

    // Off-topic: if intent is about something clearly unrelated to payments
    // Only flag if there are no payment-related keywords at all
    const offTopicSignals = /\b(joke|poem|translate|explain|summarize|chat|hello|hi)\b/i;
    const hasPaymentContext = /pay|price|cost|fee|quote|bill|invoice|settle|purchase|buy|subscribe/i.test(intent);
    if (offTopicSignals.test(intent) && !hasPaymentContext && payment.amount > 0.01) {
      maxConfidence = Math.max(maxConfidence, 0.7);
      reasons.push(`Off-topic intent ("${intent.slice(0, 60)}") paired with payment`);
    }

    return {
      flagged: maxConfidence >= 0.5,
      confidence: maxConfidence,
      reason: reasons.length > 0 ? reasons.join('; ') : 'Intent matches payment',
    };
  }
}
