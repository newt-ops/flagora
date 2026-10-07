import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatSeasonName,
  getTierBadgeColors,
  getTierIcon,
  getRatingDeltaDisplay,
  checkTierPromotion,
} from './rankHelpers.js';
import { Shield, Medal, Crown, Gem, Sparkles, Flame } from 'lucide-react';

describe('rankHelpers', () => {
  describe('formatSeasonName', () => {
    it('correctly formats valid YYYY-MM strings to Full Month Name and Year', () => {
      assert.equal(formatSeasonName('2026-09'), 'September 2026');
      assert.equal(formatSeasonName('2026-01'), 'January 2026');
      assert.equal(formatSeasonName('2026-12'), 'December 2026');
      assert.equal(formatSeasonName('2025-05'), 'May 2025');
    });

    it('falls back to current UTC month and year when string is null, undefined, or invalid', () => {
      const fallback = formatSeasonName(null);
      assert.match(fallback, /^[A-Z][a-z]+ \d{4}$/);

      const fallbackUndefined = formatSeasonName(undefined);
      assert.match(fallbackUndefined, /^[A-Z][a-z]+ \d{4}$/);

      const fallbackInvalid = formatSeasonName('invalid-season');
      assert.match(fallbackInvalid, /^[A-Z][a-z]+ \d{4}$/);
    });
  });

  describe('getTierBadgeColors', () => {
    it('returns distinctive styles for Bronze', () => {
      const colors = getTierBadgeColors('Bronze');
      assert.ok(colors.text.includes('tg-hint'));
      assert.ok(colors.border.includes('tg-separator'));
      assert.ok(colors.badge.includes('tg-hint'));
    });

    it('returns distinctive styles for Silver', () => {
      const colors = getTierBadgeColors('Silver');
      assert.ok(colors.text.includes('tg-text'));
      assert.ok(colors.border.includes('tg-separator'));
    });

    it('returns distinctive styles for Gold', () => {
      const colors = getTierBadgeColors('Gold');
      assert.ok(colors.text.includes('tg-button'));
      assert.ok(colors.border.includes('tg-button'));
    });

    it('returns distinctive styles for Platinum', () => {
      const colors = getTierBadgeColors('Platinum');
      assert.ok(colors.text.includes('tg-button'));
      assert.ok(colors.border.includes('tg-button'));
    });

    it('returns distinctive styles for Diamond', () => {
      const colors = getTierBadgeColors('Diamond');
      assert.ok(colors.text.includes('tg-button'));
      assert.ok(colors.border.includes('tg-button'));
    });

    it('returns distinctive styles for Legend', () => {
      const colors = getTierBadgeColors('Legend');
      assert.ok(colors.text.includes('tg-button-text'));
      assert.ok(colors.border.includes('tg-button'));
      assert.ok(colors.badge.includes('tg-button'));
    });
  });

  describe('getTierIcon', () => {
    it('returns the assigned Lucide icon for each tier', () => {
      assert.equal(getTierIcon('Bronze'), Shield);
      assert.equal(getTierIcon('Silver'), Medal);
      assert.equal(getTierIcon('Gold'), Crown);
      assert.equal(getTierIcon('Platinum'), Gem);
      assert.equal(getTierIcon('Diamond'), Sparkles);
      assert.equal(getTierIcon('Legend'), Flame);
    });
  });

  describe('getRatingDeltaDisplay', () => {
    it('formats positive deltas with leading plus sign and tg-button color', () => {
      const res = getRatingDeltaDisplay(20);
      assert.equal(res.text, '+20');
      assert.equal(res.colorClass, 'text-tg-button');
      assert.equal(res.isPositive, true);
      assert.equal(res.isNegative, false);

      const tieRes = getRatingDeltaDisplay(2);
      assert.equal(tieRes.text, '+2');
      assert.equal(tieRes.isPositive, true);
    });

    it('formats negative deltas with red color', () => {
      const res = getRatingDeltaDisplay(-15);
      assert.equal(res.text, '-15');
      assert.equal(res.colorClass, 'text-tg-destructive');
      assert.equal(res.isPositive, false);
      assert.equal(res.isNegative, true);
    });

    it('formats 0 or missing delta neutrally', () => {
      const zeroRes = getRatingDeltaDisplay(0);
      assert.equal(zeroRes.text, '0');
      assert.equal(zeroRes.colorClass, 'text-tg-hint');
      assert.equal(zeroRes.isPositive, false);

      const nullRes = getRatingDeltaDisplay(null);
      assert.equal(nullRes.text, '0');

      const undefRes = getRatingDeltaDisplay(undefined);
      assert.equal(undefRes.text, '0');
    });
  });

  describe('checkTierPromotion', () => {
    it('detects promotion when crossing from Bronze to Silver', () => {
      const res = checkTierPromotion(310, 20);
      assert.equal(res.isPromoted, true);
      assert.equal(res.newTier, 'Silver');
      assert.equal(res.previousTier, 'Bronze');
    });

    it('detects promotion when crossing from Silver to Gold', () => {
      const res = checkTierPromotion(605, 20);
      assert.equal(res.isPromoted, true);
      assert.equal(res.newTier, 'Gold');
      assert.equal(res.previousTier, 'Silver');
    });

    it('detects promotion when crossing from Platinum to Diamond', () => {
      const res = checkTierPromotion(1510, 20);
      assert.equal(res.isPromoted, true);
      assert.equal(res.newTier, 'Diamond');
      assert.equal(res.previousTier, 'Platinum');
    });

    it('detects promotion when crossing from Diamond to Legend', () => {
      const res = checkTierPromotion(2005, 20);
      assert.equal(res.isPromoted, true);
      assert.equal(res.newTier, 'Legend');
      assert.equal(res.previousTier, 'Diamond');
    });

    it('returns isPromoted false when rating increases within the same tier', () => {
      const res = checkTierPromotion(150, 20);
      assert.equal(res.isPromoted, false);
      assert.equal(res.newTier, undefined);
    });

    it('returns isPromoted false on negative delta (loss / demotion)', () => {
      const res = checkTierPromotion(290, -15);
      assert.equal(res.isPromoted, false);
    });

    it('returns isPromoted false on 0 or null delta', () => {
      assert.equal(checkTierPromotion(500, 0).isPromoted, false);
      assert.equal(checkTierPromotion(500, null).isPromoted, false);
      assert.equal(checkTierPromotion(null, 20).isPromoted, false);
    });
  });
});
