import type { CosmeticCategory, ShopCatalogItem } from '@flagora/shared';

export function getAvatarFrameClass(frameId: string | null | undefined): string {
  if (!frameId) return '';
  switch (frameId) {
    case 'frame-neon-cyan':
      return 'avatar-frame-neon-cyan';
    case 'frame-amber-gold':
      return 'avatar-frame-amber-gold';
    case 'frame-emerald-pulse':
      return 'avatar-frame-emerald-pulse';
    case 'frame-violet-royal':
      return 'avatar-frame-violet-royal';
    case 'frame-crimson-blaze':
      return 'avatar-frame-crimson-blaze';
    default:
      return '';
  }
}

export function getFlagThemeClass(themeId: string | null | undefined): string {
  if (!themeId) return '';
  switch (themeId) {
    case 'theme-midnight-ocean':
      return 'cosmetic-theme-midnight-ocean';
    case 'theme-sunset-dusk':
      return 'cosmetic-theme-sunset-dusk';
    case 'theme-cyber-grid':
      return 'cosmetic-theme-cyber-grid';
    case 'theme-forest-canopy':
      return 'cosmetic-theme-forest-canopy';
    case 'theme-golden-nebula':
      return 'cosmetic-theme-golden-nebula';
    default:
      return '';
  }
}

export function getProfileBannerClass(bannerId: string | null | undefined): string {
  if (!bannerId) return '';
  switch (bannerId) {
    case 'banner-aurora-borealis':
      return 'cosmetic-banner-aurora-borealis';
    case 'banner-volcanic-ash':
      return 'cosmetic-banner-volcanic-ash';
    case 'banner-cosmic-purple':
      return 'cosmetic-banner-cosmic-purple';
    case 'banner-solar-flare':
      return 'cosmetic-banner-solar-flare';
    case 'banner-diamond-frost':
      return 'cosmetic-banner-diamond-frost';
    default:
      return '';
  }
}

export interface ItemAffordability {
  canAfford: boolean;
  coinsNeeded: number;
  reasonText: string | null;
}

export function getItemAffordability(coins: number, price: number): ItemAffordability {
  const safeCoins = Math.max(0, coins);
  if (safeCoins >= price) {
    return {
      canAfford: true,
      coinsNeeded: 0,
      reasonText: null,
    };
  }

  const coinsNeeded = price - safeCoins;
  return {
    canAfford: false,
    coinsNeeded,
    reasonText: `Need ${coinsNeeded.toLocaleString()} more 🪙`,
  };
}

export function getCosmeticCategoryLabel(category: CosmeticCategory): string {
  switch (category) {
    case 'avatarFrame':
      return 'Frames';
    case 'flagTheme':
      return 'Themes';
    case 'profileBanner':
      return 'Banners';
    default:
      return category;
  }
}

export function groupCatalogByCategory(
  items: ShopCatalogItem[],
): Record<CosmeticCategory, ShopCatalogItem[]> {
  const grouped: Record<CosmeticCategory, ShopCatalogItem[]> = {
    avatarFrame: [],
    flagTheme: [],
    profileBanner: [],
  };

  for (const item of items) {
    if (grouped[item.category]) {
      grouped[item.category].push(item);
    }
  }

  return grouped;
}
