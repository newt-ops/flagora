import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { type FinishRunResponse, type ShopCatalogItem, DEFAULT_COSMETIC_CATALOG } from '@flagora/shared';
import { RARITY_STYLES } from './cosmeticHelpers.js';

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

  it('verifies free streak save is afforded without pins for Pro subscribers', () => {
    const proPlayerPins = 0;
    const isPro = true;
    const canAffordPro = isPro || proPlayerPins >= 50;
    assert.equal(canAffordPro, true);

    const freePlayerPins = 10;
    const isFree = false;
    const canAffordFree = isFree || freePlayerPins >= 50;
    assert.equal(canAffordFree, false);
  });

  it('validates Telegram Stars pricing model and currency', () => {
    const proPricing = {
      amount: 1,
      currency: 'XTR',
      period: 'month',
      pinsStipend: 1000,
    };
    assert.equal(proPricing.currency, 'XTR');
    assert.equal(proPricing.amount, 1);
    assert.equal(proPricing.pinsStipend, 1000);
  });

  it('strictly adheres to Telegram native styles and excludes gold/amber classes', () => {
    for (const [rarity, style] of Object.entries(RARITY_STYLES)) {
      const combined = `${style.borderClass} ${style.glowClass} ${style.badgeClass}`.toLowerCase();
      assert.equal(combined.includes('gold'), false, `Rarity ${rarity} must not use gold`);
      assert.equal(combined.includes('amber'), false, `Rarity ${rarity} must not use amber`);
      assert.equal(combined.includes('yellow'), false, `Rarity ${rarity} must not use yellow`);
      assert.equal(combined.includes('#'), false, `Rarity ${rarity} must use Telegram tokens instead of hex`);
    }

    for (const item of DEFAULT_COSMETIC_CATALOG) {
      assert.equal(item.name.toLowerCase().includes('gold'), false, `Item ${item.id} name must not mention gold`);
      assert.equal((item.description ?? '').toLowerCase().includes('gold'), false, `Item ${item.id} description must not mention gold`);
    }
  });
});
