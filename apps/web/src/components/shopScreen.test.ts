import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ShopCatalogItem } from '@flagora/shared';
import {
  groupCatalogByCategory,
  getItemAffordability,
  getAvatarFrameClass,
  getFlagThemeClass,
  getProfileBannerClass,
  getNameplateClass,
  getAnswerButtonClass,
  getResultThemeClass,
  getComboBadgeClass,
  getRarityStyle,
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
      id: 'frame-crimson-blaze',
      category: 'avatarFrame',
      name: 'Crimson Blaze Frame',
      cssVars: {},
      price: 250,
      isOwned: false,
      isEquipped: false,
      rarity: 'epic',
    },
    {
      id: 'frame-pro-animated-diamond',
      category: 'avatarFrame',
      name: 'Animated Diamond Frame',
      cssVars: {},
      price: 5000,
      isOwned: false,
      isEquipped: false,
      rarity: 'legendary',
      proOnly: true,
    },
    {
      id: 'theme-midnight-ocean',
      category: 'flagTheme',
      name: 'Midnight Ocean Theme',
      cssVars: {},
      price: 150,
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
      id: 'nameplate-pro-gold',
      category: 'nameplate',
      name: 'Pro Gold Plate',
      cssVars: {},
      price: 5000,
      isOwned: false,
      isEquipped: false,
      rarity: 'legendary',
      proOnly: true,
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
    {
      id: 'result-theme-classic-dark',
      category: 'resultScreenTheme',
      name: 'Classic Dark',
      cssVars: {},
      price: 150,
      isOwned: false,
      isEquipped: false,
      rarity: 'common',
    },
    {
      id: 'combo-badge-fire',
      category: 'comboBadge',
      name: 'Fire Badge',
      cssVars: {},
      price: 250,
      isOwned: false,
      isEquipped: false,
      rarity: 'common',
    },
  ];

  it('filters catalog items by selected category tab', () => {
    const grouped = groupCatalogByCategory(mockCatalog);
    assert.equal(grouped.avatarFrame.length, 4);
    assert.equal(grouped.flagTheme.length, 1);
    assert.equal(grouped.profileBanner.length, 1);
    assert.equal(grouped.nameplate.length, 2);
    assert.equal(grouped.answerButtonStyle.length, 1);
    assert.equal(grouped.resultScreenTheme.length, 1);
    assert.equal(grouped.comboBadge.length, 1);
  });

  it('filters proOnly items across all categories for the dedicated Pro tab', () => {
    const proItems = mockCatalog.filter((item) => item.proOnly);
    assert.equal(proItems.length, 2);
    assert.ok(proItems.some((i) => i.id === 'frame-pro-animated-diamond'));
    assert.ok(proItems.some((i) => i.id === 'nameplate-pro-gold'));
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
    assert.equal(affordability.reasonText, 'Need 70 more Pins');
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

  it('applies rarity styles to all items regardless of category', () => {
    for (const item of mockCatalog) {
      const style = getRarityStyle(item.rarity);
      assert.ok(style.borderClass.length > 0);
      assert.ok(style.badgeClass.length > 0);
      assert.ok(style.label.length > 0);
    }
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
      } else if (item.category === 'nameplate') {
        const nameplateClass = getNameplateClass(item.id);
        assert.ok(nameplateClass.length > 0);
        assert.ok(nameplateClass.startsWith('cosmetic-nameplate-'));
      } else if (item.category === 'answerButtonStyle') {
        const btnClass = getAnswerButtonClass(item.id);
        assert.ok(btnClass.length > 0);
        assert.ok(btnClass.startsWith('cosmetic-answer-'));
      } else if (item.category === 'resultScreenTheme') {
        const resultClass = getResultThemeClass(item.id);
        assert.ok(resultClass.length > 0);
        assert.ok(resultClass.startsWith('cosmetic-result-'));
      } else if (item.category === 'comboBadge') {
        const comboClass = getComboBadgeClass(item.id);
        assert.ok(comboClass.length > 0);
        assert.ok(comboClass.startsWith('cosmetic-combo-'));
      }
    }
  });
});
