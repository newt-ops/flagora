import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { NavTab } from './BottomNav.js';

describe('BottomNav', () => {
  it('supports all primary navigation tabs', () => {
    const validTabs: NavTab[] = ['play', 'leaderboard', 'shop', 'rewards', 'profile'];
    assert.equal(validTabs.length, 5);
    assert.ok(validTabs.includes('play'));
    assert.ok(validTabs.includes('leaderboard'));
    assert.ok(validTabs.includes('shop'));
    assert.ok(validTabs.includes('rewards'));
    assert.ok(validTabs.includes('profile'));
  });
});
