import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEFAULT_COSMETIC_CATALOG } from '@flagora/shared';
import { getCosmeticAssetUrl, getCategoryFolderName } from './cosmeticHelpers.js';
import { CosmeticProtectedImage } from './CosmeticProtectedImage.js';

describe('cosmeticAssetIntegration', () => {
  describe('getCosmeticAssetUrl and getCategoryFolderName', () => {
    it('maps cosmetic categories to asset folder names correctly', () => {
      assert.equal(getCategoryFolderName('avatarFrame'), 'avatarFrames');
      assert.equal(getCategoryFolderName('comboBadge'), 'comboBadges');
      assert.equal(getCategoryFolderName('profileEffect'), 'profileEffects');
      assert.equal(getCategoryFolderName('battleEntrance'), 'battleEntrances');
      assert.equal(getCategoryFolderName('flagTheme'), null);
      assert.equal(getCategoryFolderName('nameplate'), null);
    });

    it('returns asset url for known avatar frame', () => {
      const url = getCosmeticAssetUrl('avatarFrame', 'frame-neon-cyan');
      assert.ok(url);
      assert.ok(url.includes('avatarFrames'));
      assert.ok(url.includes('frame-neon-cyan.png'));
    });

    it('returns asset url when item specifies full path with extension', () => {
      const url = getCosmeticAssetUrl('comboBadge', 'combo-badge-fire.png');
      assert.ok(url);
      assert.ok(url.includes('comboBadges'));
      assert.ok(url.includes('combo-badge-fire.png'));
    });

    it('returns null for categories without image assets or null/undefined inputs', () => {
      assert.equal(getCosmeticAssetUrl('flagTheme', 'theme-sunset'), null);
      assert.equal(getCosmeticAssetUrl('avatarFrame', null), null);
      assert.equal(getCosmeticAssetUrl('avatarFrame', undefined), null);
    });
  });

  describe('catalog asset coverage', () => {
    it('has imageAsset property for all avatar frames, combo badges, profile effects, and battle entrances', () => {
      const assetCategories = ['avatarFrame', 'comboBadge', 'profileEffect', 'battleEntrance'];
      const assetItems = DEFAULT_COSMETIC_CATALOG.filter((item) =>
        assetCategories.includes(item.category),
      );

      assert.ok(assetItems.length > 0);
      for (const item of assetItems) {
        assert.ok(item.imageAsset, `Item ${item.id} should have imageAsset`);
        const folder = getCategoryFolderName(item.category);
        assert.ok(folder);
        const basePath = existsSync(resolve(process.cwd(), 'src/assets/cosmetics'))
          ? resolve(process.cwd(), 'src/assets/cosmetics')
          : resolve(process.cwd(), 'apps/web/src/assets/cosmetics');
        const diskPath = resolve(basePath, item.imageAsset);
        assert.ok(
          existsSync(diskPath),
          `Asset file must exist at ${diskPath} for item ${item.id}`,
        );
      }
    });
  });

  describe('CosmeticProtectedImage rendering & casual-save deterrents', () => {
    it('renders with background-image style and without any img tags', () => {
      const markup = renderToStaticMarkup(
        React.createElement(CosmeticProtectedImage, {
          category: 'avatarFrame',
          assetIdOrPath: 'frame-neon-cyan',
          alt: 'Neon Cyan Frame',
          className: 'w-16 h-16',
        }),
      );

      assert.ok(!markup.includes('<img'), 'Markup must not contain any <img> tags');
      assert.ok(markup.includes('role="img"'), 'Must have role="img" for accessibility');
      assert.ok(markup.includes('aria-label="Neon Cyan Frame"'));
      assert.ok(markup.includes('background-image:'));
      assert.ok(markup.includes('background-size:contain'));
      assert.ok(markup.includes('background-repeat:no-repeat'));
      assert.ok(markup.includes('background-position:center'));
      assert.ok(markup.includes('cosmetic-protected-image'));
      assert.ok(markup.includes('data-testid="cosmetic-overlay-guard"'));
      assert.ok(markup.includes('pointer-events-auto'));
    });

    it('renders null when asset is not available and no children are passed', () => {
      const markup = renderToStaticMarkup(
        React.createElement(CosmeticProtectedImage, {
          category: 'flagTheme',
          assetIdOrPath: 'non-existent',
        }),
      );

      assert.equal(markup, '');
    });

    it('renders children even if asset is not available', () => {
      const markup = renderToStaticMarkup(
        React.createElement(
          CosmeticProtectedImage,
          {
            category: 'flagTheme',
            assetIdOrPath: null,
          },
          React.createElement('span', null, 'Child Content'),
        ),
      );

      assert.ok(markup.includes('<span>Child Content</span>'));
    });

    it('applies custom animationClass to the protected image layer', () => {
      const markup = renderToStaticMarkup(
        React.createElement(CosmeticProtectedImage, {
          category: 'profileEffect',
          assetIdOrPath: 'effect-pro-sparkles',
          animationClass: 'animate-profile-effect',
        }),
      );

      assert.ok(markup.includes('animate-profile-effect'));
    });
  });
});
