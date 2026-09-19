import type { CosmeticCategory, CosmeticRarity, ShopCatalogItem } from '@flagora/shared';

export interface RarityStyle {
  borderClass: string;
  glowClass: string;
  badgeClass: string;
  label: string;
}

export const RARITY_STYLES: Record<CosmeticRarity, RarityStyle> = {
  common: {
    borderClass: 'border-zinc-700/60',
    glowClass: 'shadow-[0_0_8px_rgba(161,161,170,0.12)]',
    badgeClass: 'bg-zinc-500/15 text-zinc-400 border border-zinc-500/30',
    label: 'Common',
  },
  rare: {
    borderClass: 'border-sky-500/50',
    glowClass: 'shadow-[0_0_12px_rgba(56,189,248,0.25)]',
    badgeClass: 'bg-sky-500/15 text-sky-400 border border-sky-500/30',
    label: 'Rare',
  },
  epic: {
    borderClass: 'border-purple-500/50',
    glowClass: 'shadow-[0_0_12px_rgba(168,85,247,0.25)]',
    badgeClass: 'bg-purple-500/15 text-purple-400 border border-purple-500/30',
    label: 'Epic',
  },
  legendary: {
    borderClass: 'border-amber-500/60',
    glowClass: 'shadow-[0_0_16px_rgba(245,158,11,0.35)]',
    badgeClass: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
    label: 'Legendary',
  },
};

export function getRarityStyle(rarity?: CosmeticRarity): RarityStyle {
  return (rarity && RARITY_STYLES[rarity]) || RARITY_STYLES.common;
}

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
    case 'frame-pro-animated-diamond':
      return 'avatar-frame-pro-diamond';
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

export function getNameplateClass(nameplateId: string | null | undefined): string {
  if (!nameplateId) return '';
  switch (nameplateId) {
    case 'nameplate-slate':
      return 'cosmetic-nameplate-slate';
    case 'nameplate-emerald':
      return 'cosmetic-nameplate-emerald';
    case 'nameplate-pro-gold':
      return 'cosmetic-nameplate-pro-gold';
    default:
      return '';
  }
}

export function getAnswerButtonClass(buttonStyleId: string | null | undefined): string {
  if (!buttonStyleId) return '';
  switch (buttonStyleId) {
    case 'answer-btn-neon':
      return 'cosmetic-answer-neon';
    case 'answer-btn-gradient':
      return 'cosmetic-answer-gradient';
    case 'answer-btn-glass':
      return 'cosmetic-answer-glass';
    default:
      return '';
  }
}

export function getResultThemeClass(themeId: string | null | undefined): string {
  if (!themeId) return '';
  switch (themeId) {
    case 'result-theme-classic-dark':
      return 'cosmetic-result-classic-dark';
    case 'result-theme-victory-gold':
      return 'cosmetic-result-victory-gold';
    case 'result-theme-pro-platinum':
      return 'cosmetic-result-pro-platinum';
    default:
      return '';
  }
}

export function getComboBadgeClass(badgeId: string | null | undefined): string {
  if (!badgeId) return '';
  switch (badgeId) {
    case 'combo-badge-fire':
      return 'cosmetic-combo-fire';
    case 'combo-badge-ice':
      return 'cosmetic-combo-ice';
    case 'combo-badge-void':
      return 'cosmetic-combo-void';
    default:
      return '';
  }
}

export function getProfileEffectClass(effectId: string | null | undefined): string {
  if (!effectId) return '';
  switch (effectId) {
    case 'effect-pro-sparkles':
      return 'cosmetic-effect-sparkles';
    case 'effect-pro-flames':
      return 'cosmetic-effect-flames';
    default:
      return '';
  }
}

export function getBattleEntranceClass(entranceId: string | null | undefined): string {
  if (!entranceId) return '';
  switch (entranceId) {
    case 'entrance-pro-lightning':
      return 'cosmetic-entrance-lightning';
    case 'entrance-pro-portal':
      return 'cosmetic-entrance-portal';
    default:
      return '';
  }
}

export interface ItemAffordability {
  canAfford: boolean;
  pinsNeeded: number;
  reasonText: string | null;
}

export function getItemAffordability(pins: number, price: number): ItemAffordability {
  const safePins = Math.max(0, pins);
  if (safePins >= price) {
    return {
      canAfford: true,
      pinsNeeded: 0,
      reasonText: null,
    };
  }

  const pinsNeeded = price - safePins;
  return {
    canAfford: false,
    pinsNeeded,
    reasonText: `Need ${pinsNeeded.toLocaleString()} more Pins`,
  };
}

export function getCosmeticCategoryLabel(category: CosmeticCategory | 'pro'): string {
  switch (category) {
    case 'pro':
      return 'Pro';
    case 'avatarFrame':
      return 'Frames';
    case 'flagTheme':
      return 'Themes';
    case 'profileBanner':
      return 'Banners';
    case 'nameplate':
      return 'Nameplates';
    case 'answerButtonStyle':
      return 'Buttons';
    case 'resultScreenTheme':
      return 'Results';
    case 'comboBadge':
      return 'Combos';
    case 'profileEffect':
      return 'Effects';
    case 'battleEntrance':
      return 'Entrances';
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
    nameplate: [],
    answerButtonStyle: [],
    resultScreenTheme: [],
    comboBadge: [],
    profileEffect: [],
    battleEntrance: []
  };

  for (const item of items) {
    if (grouped[item.category]) {
      grouped[item.category].push(item);
    }
  }

  return grouped;
}
