import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ShopCatalogItem } from '@flagora/shared';
import {
  getAvatarFrameClass,
  getFlagThemeClass,
  getProfileBannerClass,
  getNameplateClass,
  getAnswerButtonClass,
  getResultThemeClass,
  getComboBadgeClass,
  getProfileEffectClass,
  getBattleEntranceClass,
  getItemAffordability,
  getCosmeticCategoryLabel,
  groupCatalogByCategory,
  RARITY_STYLES,
  getRarityStyle,
} from './cosmeticHelpers.js';

describe('cosmeticHelpers', () => {
  describe('RARITY_STYLES and getRarityStyle', () => {
    it('provides distinct, subtle border, glow, and badge for all 4 rarity tiers', () => {
      const common = getRarityStyle('common');
      assert.equal(common.label, 'Common');
      assert.ok(common.borderClass.includes('border-zinc-'));
      assert.ok(common.badgeClass.includes('text-zinc-'));

      const rare = getRarityStyle('rare');
      assert.equal(rare.label, 'Rare');
      assert.ok(rare.borderClass.includes('border-sky-'));
      assert.ok(rare.badgeClass.includes('text-sky-'));

      const epic = getRarityStyle('epic');
      assert.equal(epic.label, 'Epic');
      assert.ok(epic.borderClass.includes('border-purple-'));
      assert.ok(epic.badgeClass.includes('text-purple-'));

      const legendary = getRarityStyle('legendary');
      assert.equal(legendary.label, 'Legendary');
      assert.ok(legendary.borderClass.includes('border-amber-'));
      assert.ok(legendary.badgeClass.includes('text-amber-'));
    });

    it('defaults to common when rarity is unknown or omitted', () => {
      const fallback = getRarityStyle(undefined);
      assert.equal(fallback.label, 'Common');
      assert.deepEqual(fallback, RARITY_STYLES.common);
    });
  });

  describe('getAvatarFrameClass', () => {
    it('returns valid CSS class for each known avatar frame', () => {
      assert.equal(getAvatarFrameClass('frame-neon-cyan'), 'avatar-frame-neon-cyan');
      assert.equal(getAvatarFrameClass('frame-amber-gold'), 'avatar-frame-amber-gold');
      assert.equal(getAvatarFrameClass('frame-emerald-pulse'), 'avatar-frame-emerald-pulse');
      assert.equal(getAvatarFrameClass('frame-violet-royal'), 'avatar-frame-violet-royal');
      assert.equal(getAvatarFrameClass('frame-crimson-blaze'), 'avatar-frame-crimson-blaze');
      assert.equal(getAvatarFrameClass('frame-pro-animated-diamond'), 'avatar-frame-pro-diamond');
    });

    it('returns empty string for null, undefined, or unknown frames', () => {
      assert.equal(getAvatarFrameClass(null), '');
      assert.equal(getAvatarFrameClass(undefined), '');
      assert.equal(getAvatarFrameClass('unknown-frame'), '');
    });
  });

  describe('getFlagThemeClass', () => {
    it('returns valid CSS class for each known flag theme', () => {
      assert.equal(getFlagThemeClass('theme-midnight-ocean'), 'cosmetic-theme-midnight-ocean');
      assert.equal(getFlagThemeClass('theme-sunset-dusk'), 'cosmetic-theme-sunset-dusk');
      assert.equal(getFlagThemeClass('theme-cyber-grid'), 'cosmetic-theme-cyber-grid');
      assert.equal(getFlagThemeClass('theme-forest-canopy'), 'cosmetic-theme-forest-canopy');
      assert.equal(getFlagThemeClass('theme-golden-nebula'), 'cosmetic-theme-golden-nebula');
    });

    it('returns empty string for null, undefined, or unknown themes', () => {
      assert.equal(getFlagThemeClass(null), '');
      assert.equal(getFlagThemeClass(undefined), '');
      assert.equal(getFlagThemeClass('unknown-theme'), '');
    });
  });

  describe('getProfileBannerClass', () => {
    it('returns valid CSS class for each known profile banner', () => {
      assert.equal(getProfileBannerClass('banner-aurora-borealis'), 'cosmetic-banner-aurora-borealis');
      assert.equal(getProfileBannerClass('banner-volcanic-ash'), 'cosmetic-banner-volcanic-ash');
      assert.equal(getProfileBannerClass('banner-cosmic-purple'), 'cosmetic-banner-cosmic-purple');
      assert.equal(getProfileBannerClass('banner-solar-flare'), 'cosmetic-banner-solar-flare');
      assert.equal(getProfileBannerClass('banner-diamond-frost'), 'cosmetic-banner-diamond-frost');
    });

    it('returns empty string for null, undefined, or unknown banners', () => {
      assert.equal(getProfileBannerClass(null), '');
      assert.equal(getProfileBannerClass(undefined), '');
      assert.equal(getProfileBannerClass('unknown-banner'), '');
    });
  });

  describe('new categories preview class helpers', () => {
    it('returns valid classes for nameplates', () => {
      assert.equal(getNameplateClass('nameplate-slate'), 'cosmetic-nameplate-slate');
      assert.equal(getNameplateClass('nameplate-emerald'), 'cosmetic-nameplate-emerald');
      assert.equal(getNameplateClass('nameplate-pro-gold'), 'cosmetic-nameplate-pro-gold');
      assert.equal(getNameplateClass(null), '');
    });

    it('returns valid classes for answer button styles', () => {
      assert.equal(getAnswerButtonClass('answer-btn-neon'), 'cosmetic-answer-neon');
      assert.equal(getAnswerButtonClass('answer-btn-gradient'), 'cosmetic-answer-gradient');
      assert.equal(getAnswerButtonClass('answer-btn-glass'), 'cosmetic-answer-glass');
      assert.equal(getAnswerButtonClass(undefined), '');
    });

    it('returns valid classes for result screen themes', () => {
      assert.equal(getResultThemeClass('result-theme-classic-dark'), 'cosmetic-result-classic-dark');
      assert.equal(getResultThemeClass('result-theme-victory-gold'), 'cosmetic-result-victory-gold');
      assert.equal(getResultThemeClass('result-theme-pro-platinum'), 'cosmetic-result-pro-platinum');
      assert.equal(getResultThemeClass(null), '');
    });

    it('returns valid classes for combo badges', () => {
      assert.equal(getComboBadgeClass('combo-badge-fire'), 'cosmetic-combo-fire');
      assert.equal(getComboBadgeClass('combo-badge-ice'), 'cosmetic-combo-ice');
      assert.equal(getComboBadgeClass('combo-badge-void'), 'cosmetic-combo-void');
      assert.equal(getComboBadgeClass(undefined), '');
    });

    it('returns valid classes for profile effects and entrances', () => {
      assert.equal(getProfileEffectClass('effect-pro-sparkles'), 'cosmetic-effect-sparkles');
      assert.equal(getProfileEffectClass('effect-pro-flames'), 'cosmetic-effect-flames');
      assert.equal(getBattleEntranceClass('entrance-pro-lightning'), 'cosmetic-entrance-lightning');
      assert.equal(getBattleEntranceClass('entrance-pro-portal'), 'cosmetic-entrance-portal');
    });
  });

  describe('getItemAffordability', () => {
    it('returns canAfford true when player has exact price in pins', () => {
      const result = getItemAffordability(150, 150);
      assert.equal(result.canAfford, true);
      assert.equal(result.pinsNeeded, 0);
      assert.equal(result.reasonText, null);
    });

    it('returns canAfford true when player has more than price in pins', () => {
      const result = getItemAffordability(500, 150);
      assert.equal(result.canAfford, true);
      assert.equal(result.pinsNeeded, 0);
      assert.equal(result.reasonText, null);
    });

    it('returns canAfford false with accurate reason when player is short on pins', () => {
      const result = getItemAffordability(100, 250);
      assert.equal(result.canAfford, false);
      assert.equal(result.pinsNeeded, 150);
      assert.equal(result.reasonText, 'Need 150 more Pins');
    });

    it('handles negative or zero pin edge cases gracefully', () => {
      const result = getItemAffordability(-10, 100);
      assert.equal(result.canAfford, false);
      assert.equal(result.pinsNeeded, 100);
      assert.equal(result.reasonText, 'Need 100 more Pins');
    });
  });

  describe('getCosmeticCategoryLabel', () => {
    it('maps categories to friendly human labels', () => {
      assert.equal(getCosmeticCategoryLabel('pro'), 'Pro');
      assert.equal(getCosmeticCategoryLabel('avatarFrame'), 'Frames');
      assert.equal(getCosmeticCategoryLabel('flagTheme'), 'Themes');
      assert.equal(getCosmeticCategoryLabel('profileBanner'), 'Banners');
      assert.equal(getCosmeticCategoryLabel('nameplate'), 'Nameplates');
      assert.equal(getCosmeticCategoryLabel('answerButtonStyle'), 'Buttons');
      assert.equal(getCosmeticCategoryLabel('resultScreenTheme'), 'Results');
      assert.equal(getCosmeticCategoryLabel('comboBadge'), 'Combos');
      assert.equal(getCosmeticCategoryLabel('profileEffect'), 'Effects');
      assert.equal(getCosmeticCategoryLabel('battleEntrance'), 'Entrances');
    });
  });

  describe('groupCatalogByCategory', () => {
    it('separates items across categories including new visual ones', () => {
      const sampleItems: ShopCatalogItem[] = [
        {
          id: 'frame-neon-cyan',
          category: 'avatarFrame',
          name: 'Cyan Glow',
          cssVars: {},
          price: 100,
          isOwned: false,
          isEquipped: false,
          rarity: 'common',
        },
        {
          id: 'nameplate-slate',
          category: 'nameplate',
          name: 'Slate Stone',
          cssVars: {},
          price: 150,
          isOwned: false,
          isEquipped: false,
          rarity: 'common',
        },
        {
          id: 'answer-btn-neon',
          category: 'answerButtonStyle',
          name: 'Neon Borders',
          cssVars: {},
          price: 200,
          isOwned: false,
          isEquipped: false,
          rarity: 'common',
        },
      ];

      const grouped = groupCatalogByCategory(sampleItems);
      assert.equal(grouped.avatarFrame.length, 1);
      assert.equal(grouped.nameplate.length, 1);
      assert.equal(grouped.answerButtonStyle.length, 1);
    });
  });
});
