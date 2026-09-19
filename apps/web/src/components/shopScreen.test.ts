import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ShopCatalogItem } from '@flagora/shared';
import {
  groupCatalogByCategory,
  getItemAffordability,
  getAvatarFrameClass,
  getFlagThemeClass,
  getProfileBannerClass,
} from './cosmeticHelpers.js';

describe('ShopScreen Logic', () => {
  const mockCatalog: ShopCatalogItem[] = [
    {
      id: 'frame-neon-cyan',
      category: 'avatarFrame',
      name: 'Cyan Glow',
      cssVars: {},
      price: 100,
      isOwned: true,
      isEquipped: true,
      rarity: 'common',
    },
    {
      id: 'frame-amber-gold',
      category: 'avatarFrame',
      name: 'Amber Gold Frame',
      cssVars: {},
      price: 300,
      isOwned: true,
      isEquipped: false,
      rarity: 'common',
    },
    {
      id: 'frame-neon-cyan',
      category: 'avatarFrame',
      name: 'Neon Cyan Frame',
      cssVars: {},
      price: 150,
      isOwned: false,
      isEquipped: false,
      rarity: 'common',
    },
    {
      id: 'theme-midnight-ocean',
      category: 'flagTheme',
      name: 'Midnight Ocean Theme',
      cssVars: {},
      price: 250,
      isOwned: false,
      isEquipped: false,
      rarity: 'common',
    },
    {
      id: 'banner-aurora-borealis',
      category: 'profileBanner',
      name: 'Aurora Borealis Banner',
      cssVars: {},
      price: 150,
      isOwned: false,
      isEquipped: false,
      rarity: 'common',
    },
  ];

  it('filters catalog items by selected category tab', () => {
    const grouped = groupCatalogByCategory(mockCatalog);
    assert.equal(grouped.avatarFrame.length, 3);
    assert.equal(grouped.flagTheme.length, 1);
    assert.equal(grouped.profileBanner.length, 1);
  });

  it('correctly distinguishes equipped, owned, affordable, and unaffordable items', () => {
    const playerPins = 180;
    const grouped = groupCatalogByCategory(mockCatalog);
    const frames = grouped.avatarFrame;

    const equippedItem = frames.find((i) => i.id === 'frame-neon-cyan');
    assert.ok(equippedItem);
    assert.equal(equippedItem.isEquipped, true);
    assert.equal(equippedItem.isOwned, true);

    const ownedItem = frames.find((i) => i.id === 'frame-amber-gold');
    assert.ok(ownedItem);
    assert.equal(ownedItem.isEquipped, false);
    assert.equal(ownedItem.isOwned, true);

    const unownedItem = frames.find((i) => i.id === 'frame-crimson-blaze');
    assert.ok(unownedItem);
    assert.equal(unownedItem.isOwned, false);
    const affordability = getItemAffordability(playerPins, unownedItem.price);
    assert.equal(affordability.canAfford, false);
    assert.equal(affordability.pinsNeeded, 70);
    assert.equal(affordability.reasonText, 'Need 70 more 🪙');
  });

  it('correctly calculates affordability for items player can purchase', () => {
    const playerPins = 180;
    const affordableTheme = mockCatalog.find((i) => i.id === 'theme-midnight-ocean');
    assert.ok(affordableTheme);
    const affordability = getItemAffordability(playerPins, affordableTheme.price);
    assert.equal(affordability.canAfford, true);
    assert.equal(affordability.pinsNeeded, 0);
    assert.equal(affordability.reasonText, null);
  });

  it('verifies cosmetic preview classes are mapped for all catalog entries', () => {
    for (const item of mockCatalog) {
      if (item.category === 'avatarFrame') {
        const frameClass = getAvatarFrameClass(item.id);
        assert.ok(frameClass.length > 0);
        assert.ok(frameClass.startsWith('avatar-frame-'));
      } else if (item.category === 'flagTheme') {
        const themeClass = getFlagThemeClass(item.id);
        assert.ok(themeClass.length > 0);
        assert.ok(themeClass.startsWith('cosmetic-theme-'));
      } else if (item.category === 'profileBanner') {
        const bannerClass = getProfileBannerClass(item.id);
        assert.ok(bannerClass.length > 0);
        assert.ok(bannerClass.startsWith('cosmetic-banner-'));
      }
    }
  });
});
