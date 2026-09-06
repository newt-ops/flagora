import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TimeExpiredApiError } from '../api/client.js';
import { triggerHaptic } from '../telegram/haptics.js';
import { calculateComboMultiplier } from '@flagora/shared';

describe('GameScreen helpers and error handling', () => {
  it('instantiates TimeExpiredApiError with correct name and message', () => {
    const error = new TimeExpiredApiError();
    assert.equal(error.name, 'TimeExpiredApiError');
    assert.equal(error.message, 'Time has expired for this run');
    assert.ok(error instanceof Error);
  });

  it('safely calls triggerHaptic outside TMA environment without throwing', () => {
    assert.doesNotThrow(() => {
      triggerHaptic('success');
    });
    assert.doesNotThrow(() => {
      triggerHaptic('error');
    });
    assert.doesNotThrow(() => {
      triggerHaptic('warning');
    });
  });

  it('formats combo multipliers accurately for in-game badges', () => {
    assert.equal(calculateComboMultiplier(0), 1.0);
    assert.equal(calculateComboMultiplier(1), 1.1);
    assert.equal(calculateComboMultiplier(3), 1.3);
    assert.equal(calculateComboMultiplier(5), 1.5);
    assert.equal(calculateComboMultiplier(8), 1.5);
  });
});
