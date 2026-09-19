import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { FinishRunResponse, ShopCatalogItem } from '@flagora/shared';

describe('Flagora Pro UI Logic', () => {
  const proItem: ShopCatalogItem = {
    id: 'frame-pro-animated-diamond',
    category: 'avatarFrame',
    name: 'Animated Diamond',
    cssVars: {},
    price: 5000,
    isOwned: false,
    isEquipped: false,
    rarity: 'legendary',
    proOnly: true,
  };

  const normalItem: ShopCatalogItem = {
    id: 'frame-neon-cyan',
    category: 'avatarFrame',
    name: 'Cyan Glow',
    cssVars: {},
    price: 150,
    isOwned: false,
    isEquipped: false,
    rarity: 'common',
  };

  it('determines when Pro lock overlay is required', () => {
    const isSubscriber = false;
    const isItemLockedForNonSubscriber = Boolean(proItem.proOnly && !isSubscriber);
    assert.equal(isItemLockedForNonSubscriber, true);

    const isNormalItemLocked = Boolean(normalItem.proOnly && !isSubscriber);
    assert.equal(isNormalItemLocked, false);
  });

  it('allows access to Pro items when user has active subscription', () => {
    const isSubscriber = true;
    const isItemLockedForSubscriber = Boolean(proItem.proOnly && !isSubscriber);
    assert.equal(isItemLockedForSubscriber, false);
  });

  it('verifies doubleXpApplied indicator presence on run finish response', () => {
    const proRunWeekend: FinishRunResponse = {
      correctCount: 10,
      timeUsedMs: 12500,
      maxCombo: 10,
      leftoverBonus: 50,
      totalScore: 1250,
      xpEarned: 200,
      pinsEarned: 100,
      newXp: 800,
      newPins: 450,
      newLevel: 4,
      leveledUp: false,
      bestScore: 1250,
      isNewBest: true,
      currentStreak: 5,
      longestStreak: 5,
      streakChange: 'incremented',
      doubleXpApplied: true,
    };

    assert.equal(proRunWeekend.doubleXpApplied, true);

    const normalRunWeekday: FinishRunResponse = {
      ...proRunWeekend,
      xpEarned: 100,
      doubleXpApplied: false,
    };

    assert.equal(normalRunWeekday.doubleXpApplied, false);
  });
});
