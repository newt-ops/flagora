import type { PlayerProfile } from './index.js';

export type CosmeticCategory = 'avatarFrame' | 'flagTheme' | 'profileBanner';

export const COSMETIC_CATEGORIES: readonly CosmeticCategory[] = [
  'avatarFrame',
  'flagTheme',
  'profileBanner',
] as const;

export interface CosmeticItem {
  id: string;
  category: CosmeticCategory;
  name: string;
  cssVars: Record<string, string>;
  price: number;
  description?: string;
}

export interface EquippedCosmetics {
  avatarFrame?: string | null;
  flagTheme?: string | null;
  profileBanner?: string | null;
}

export interface ShopCatalogItem extends CosmeticItem {
  isOwned: boolean;
  isEquipped: boolean;
}

export interface ShopCatalogResponse {
  items: ShopCatalogItem[];
}

export interface PurchaseRequest {
  itemId: string;
}

export interface PurchaseResponse {
  success: boolean;
  itemId: string;
  newCoins: number;
  profile: PlayerProfile;
}

export interface EquipRequest {
  itemId: string;
}

export interface EquipResponse {
  success: boolean;
  itemId: string;
  category: CosmeticCategory;
  equipped: EquippedCosmetics;
}

export const DEFAULT_COSMETIC_CATALOG: CosmeticItem[] = [
  {
    id: 'frame-neon-cyan',
    category: 'avatarFrame',
    name: 'Cyan Glow',
    cssVars: {
      '--avatar-frame-border': '2px solid #06b6d4',
      '--avatar-frame-shadow': '0 0 10px rgba(6, 182, 212, 0.6)',
    },
    price: 100,
    description: 'Electric cyan border with a subtle neon glow',
  },
  {
    id: 'frame-amber-gold',
    category: 'avatarFrame',
    name: 'Golden Ring',
    cssVars: {
      '--avatar-frame-border': '2px solid #f59e0b',
      '--avatar-frame-shadow': '0 0 12px rgba(245, 158, 11, 0.6)',
    },
    price: 250,
    description: 'Polished amber gold ring',
  },
  {
    id: 'frame-emerald-pulse',
    category: 'avatarFrame',
    name: 'Emerald Aura',
    cssVars: {
      '--avatar-frame-border': '2px solid #10b981',
      '--avatar-frame-shadow': '0 0 14px rgba(16, 185, 129, 0.65)',
    },
    price: 500,
    description: 'Vibrant emerald border with an active pulse',
  },
  {
    id: 'frame-violet-royal',
    category: 'avatarFrame',
    name: 'Royal Velvet',
    cssVars: {
      '--avatar-frame-border': '3px solid #8b5cf6',
      '--avatar-frame-shadow': '0 0 16px rgba(139, 92, 246, 0.7)',
    },
    price: 1000,
    description: 'Deep royal purple with radiant halo',
  },
  {
    id: 'frame-crimson-blaze',
    category: 'avatarFrame',
    name: 'Crimson Blaze',
    cssVars: {
      '--avatar-frame-border': '3px solid #ef4444',
      '--avatar-frame-shadow': '0 0 18px rgba(239, 68, 68, 0.75)',
    },
    price: 2000,
    description: 'Fierce crimson fiery ring',
  },
  {
    id: 'theme-midnight-ocean',
    category: 'flagTheme',
    name: 'Midnight Ocean',
    cssVars: {
      '--theme-bg-gradient': 'linear-gradient(135deg, #0f172a 0%, #0e7490 100%)',
      '--theme-accent-color': '#38bdf8',
      '--theme-surface-color': 'rgba(15, 23, 42, 0.85)',
    },
    price: 150,
    description: 'Deep oceanic blue palette for the game screen',
  },
  {
    id: 'theme-sunset-dusk',
    category: 'flagTheme',
    name: 'Sunset Dusk',
    cssVars: {
      '--theme-bg-gradient': 'linear-gradient(135deg, #4c0519 0%, #9a3412 100%)',
      '--theme-accent-color': '#fb923c',
      '--theme-surface-color': 'rgba(76, 5, 25, 0.85)',
    },
    price: 300,
    description: 'Warm twilight gradient with amber highlights',
  },
  {
    id: 'theme-cyber-grid',
    category: 'flagTheme',
    name: 'Cyber Grid',
    cssVars: {
      '--theme-bg-gradient': 'linear-gradient(135deg, #18181b 0%, #3b0764 100%)',
      '--theme-accent-color': '#a855f7',
      '--theme-surface-color': 'rgba(24, 24, 27, 0.85)',
    },
    price: 600,
    description: 'High-contrast neon cyberpunk dark space',
  },
  {
    id: 'theme-forest-canopy',
    category: 'flagTheme',
    name: 'Forest Canopy',
    cssVars: {
      '--theme-bg-gradient': 'linear-gradient(135deg, #052e16 0%, #166534 100%)',
      '--theme-accent-color': '#4ade80',
      '--theme-surface-color': 'rgba(5, 46, 22, 0.85)',
    },
    price: 1200,
    description: 'Lush green botanical backdrop',
  },
  {
    id: 'theme-golden-nebula',
    category: 'flagTheme',
    name: 'Golden Nebula',
    cssVars: {
      '--theme-bg-gradient': 'linear-gradient(135deg, #422006 0%, #78350f 100%)',
      '--theme-accent-color': '#fde047',
      '--theme-surface-color': 'rgba(66, 32, 6, 0.85)',
    },
    price: 2500,
    description: 'Prestige stellar gold aesthetic',
  },
  {
    id: 'banner-aurora-borealis',
    category: 'profileBanner',
    name: 'Aurora Borealis',
    cssVars: {
      '--banner-background': 'linear-gradient(90deg, #064e3b 0%, #0284c7 100%)',
    },
    price: 100,
    description: 'Flowing polar lights backdrop for your profile card',
  },
  {
    id: 'banner-volcanic-ash',
    category: 'profileBanner',
    name: 'Volcanic Ash',
    cssVars: {
      '--banner-background': 'linear-gradient(90deg, #1c1917 0%, #7f1d1d 100%)',
    },
    price: 250,
    description: 'Dark volcanic rock with glowing embers',
  },
  {
    id: 'banner-cosmic-purple',
    category: 'profileBanner',
    name: 'Cosmic Purple',
    cssVars: {
      '--banner-background': 'linear-gradient(90deg, #2e1065 0%, #701a75 100%)',
    },
    price: 500,
    description: 'Deep cosmic galaxy backdrop',
  },
  {
    id: 'banner-solar-flare',
    category: 'profileBanner',
    name: 'Solar Flare',
    cssVars: {
      '--banner-background': 'linear-gradient(90deg, #7c2d12 0%, #d97706 100%)',
    },
    price: 1000,
    description: 'Radiant solar storm banner',
  },
  {
    id: 'banner-diamond-frost',
    category: 'profileBanner',
    name: 'Diamond Frost',
    cssVars: {
      '--banner-background': 'linear-gradient(90deg, #1e293b 0%, #64748b 100%)',
    },
    price: 2000,
    description: 'Sleek frosted silver diamond banner',
  },
];
