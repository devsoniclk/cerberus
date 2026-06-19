import { EventEmitter } from 'node:events';

export class KillSwitch extends EventEmitter {
  private frozen = false;
  private frozenAt: number | null = null;
  private freezeReason: string | null = null;

  isFrozen(): boolean {
    return this.frozen;
  }

  getFreezeInfo(): { frozen: boolean; frozenAt: number | null; reason: string | null } {
    return { frozen: this.frozen, frozenAt: this.frozenAt, reason: this.freezeReason };
  }

  freeze(reason = 'Manual freeze'): void {
    if (this.frozen) return;
    this.frozen = true;
    this.frozenAt = Date.now();
    this.freezeReason = reason;
    this.emit('freeze', { reason, frozenAt: this.frozenAt });
  }

  resume(authorization?: string): boolean {
    if (!authorization) {
      throw new Error('Authorization required to resume kill switch');
    }
    if (!this.frozen) return true;
    this.frozen = false;
    this.frozenAt = null;
    this.freezeReason = null;
    this.emit('resume', { authorization, resumedAt: Date.now() });
    return true;
  }
}
