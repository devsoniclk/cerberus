import { describe, it, expect } from 'vitest';
import { KillSwitch } from '../src/killswitch.js';

describe('KillSwitch', () => {
  it('starts unfrozen', () => {
    const ks = new KillSwitch();
    expect(ks.isFrozen()).toBe(false);
  });

  it('freezes and reports frozen state', () => {
    const ks = new KillSwitch();
    ks.freeze('test freeze');
    expect(ks.isFrozen()).toBe(true);
    const info = ks.getFreezeInfo();
    expect(info.reason).toBe('test freeze');
    expect(info.frozenAt).toBeTypeOf('number');
  });

  it('requires authorization to resume', () => {
    const ks = new KillSwitch();
    ks.freeze('test');
    expect(() => ks.resume()).toThrow('Authorization required');
  });

  it('resumes with authorization', () => {
    const ks = new KillSwitch();
    ks.freeze('test');
    ks.resume('admin-token');
    expect(ks.isFrozen()).toBe(false);
  });

  it('emits freeze event', () => {
    const ks = new KillSwitch();
    let emitted = false;
    ks.on('freeze', () => { emitted = true; });
    ks.freeze('test');
    expect(emitted).toBe(true);
  });

  it('emits resume event', () => {
    const ks = new KillSwitch();
    ks.freeze('test');
    let emitted = false;
    ks.on('resume', () => { emitted = true; });
    ks.resume('admin');
    expect(emitted).toBe(true);
  });
});
