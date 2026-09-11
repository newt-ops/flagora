import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ShopCatalogItem } from '@flagora/shared';
import {
  getAvatarFrameClass,
  getFlagThemeClass,
  getProfileBannerClass,
  getItemAffordability,
  getCosmeticCategoryLabel,
  groupCatalogByCategory,
} from './cosmeticHelpers.js';

describe('cosmeticHelpers', () => {
  describe('getAvatarFrameClass', () => {
    it('returns valid CSS class for each known avatar frame', () => {
      assert.equal(getAvatarFrameClass('frame-neon-cyan'), 'avatar-frame-neon-cyan');
      assert.equal(getAvatarFrameClass('frame-amber-gold'), 'avatar-frame-amber-gold');
      assert.equal(getAvatarFrameClass('frame-emerald-pulse'), 'avatar-frame-emerald-pulse');
      assert.equal(getAvatarFrameClass('frame-violet-royal'), 'avatar-frame-violet-royal');
      assert.equal(getAvatarFrameClass('frame-crimson-blaze'), 'avatar-frame-crimson-blaze');
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

  describe('getItemAffordability', () => {
    it('returns canAfford true when player has exact price in coins', () => {
      const result = getItemAffordability(150, 150);
      assert.equal(result.canAfford, true);
      assert.equal(result.coinsNeeded, 0);
      assert.equal(result.reasonText, null);
    });

    it('returns canAfford true when player has more than price in coins', () => {
      const result = getItemAffordability(500, 150);
      assert.equal(result.canAfford, true);
      assert.equal(result.coinsNeeded, 0);
      assert.equal(result.reasonText, null);
    });

    it('returns canAfford false with accurate reason when player is short on coins', () => {
      const result = getItemAffordability(100, 250);
      assert.equal(result.canAfford, false);
      assert.equal(result.coinsNeeded, 150);
      assert.equal(result.reasonText, 'Need 150 more 🪙');
    });

    it('handles negative or zero coin edge cases gracefully', () => {
      const result = getItemAffordability(-10, 100);
      assert.equal(result.canAfford, false);
      assert.equal(result.coinsNeeded, 100);
      assert.equal(result.reasonText, 'Need 100 more 🪙');
    });
  });

  describe('getCosmeticCategoryLabel', () => {
    it('maps categories to friendly human labels', () => {
      assert.equal(getCosmeticCategoryLabel('avatarFrame'), 'Frames');
      assert.equal(getCosmeticCategoryLabel('flagTheme'), 'Themes');
      assert.equal(getCosmeticCategoryLabel('profileBanner'), 'Banners');
    });
  });

  describe('groupCatalogByCategory', () => {
    it('separates items into avatarFrame, flagTheme, and profileBanner', () => {
      const sampleItems: ShopCatalogItem[] = [
        {
          id: 'frame-neon-cyan',
          category: 'avatarFrame',
          name: 'Cyan Glow',
          cssVars: {},
          price: 100,
          isOwned: false,
          isEquipped: false,
        },
        {
          id: 'theme-midnight-ocean',
          category: 'flagTheme',
          name: 'Midnight Ocean',
          cssVars: {},
          price: 150,
          isOwned: true,
          isEquipped: true,
        },
        {
          id: 'banner-aurora-borealis',
          category: 'profileBanner',
          name: 'Aurora Borealis',
          cssVars: {},
          price: 100,
          isOwned: false,
          isEquipped: false,
        },
      ];

      const grouped = groupCatalogByCategory(sampleItems);
      assert.equal(grouped.avatarFrame.length, 1);
      assert.equal(grouped.avatarFrame[0].id, 'frame-neon-cyan');
      assert.equal(grouped.flagTheme.length, 1);
      assert.equal(grouped.flagTheme[0].id, 'theme-midnight-ocean');
      assert.equal(grouped.profileBanner.length, 1);
      assert.equal(grouped.profileBanner[0].id, 'banner-aurora-borealis');
    });
  });
});
