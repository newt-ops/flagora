import type { PlayerProfile } from './index.js';

export type CosmeticCategory = 
  | 'avatarFrame' 
  | 'flagTheme' 
  | 'profileBanner' 
  | 'nameplate' 
  | 'answerButtonStyle' 
  | 'resultScreenTheme' 
  | 'comboBadge' 
  | 'profileEffect' 
  | 'battleEntrance';

export const COSMETIC_CATEGORIES: readonly CosmeticCategory[] = [
  'avatarFrame',
  'flagTheme',
  'profileBanner',
  'nameplate',
  'answerButtonStyle',
  'resultScreenTheme',
  'comboBadge',
  'profileEffect',
  'battleEntrance'
] as const;

export type CosmeticRarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface CosmeticItem {
  id: string;
  category: CosmeticCategory;
  name: string;
  cssVars: Record<string, string>;
  price: number;
  description?: string;
  rarity: CosmeticRarity;
  proOnly?: boolean;
}

export interface EquippedCosmetics {
  avatarFrame?: string | null;
  flagTheme?: string | null;
  profileBanner?: string | null;
  nameplate?: string | null;
  answerButtonStyle?: string | null;
  resultScreenTheme?: string | null;
  comboBadge?: string | null;
  profileEffect?: string | null;
  battleEntrance?: string | null;
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
  newPins: number;
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
    price: 150,
    description: 'Electric cyan border with a subtle neon glow',
    rarity: 'common'
  },
  {
    id: 'frame-amber-gold',
    category: 'avatarFrame',
    name: 'Golden Ring',
    cssVars: {
      '--avatar-frame-border': '2px solid #f59e0b',
      '--avatar-frame-shadow': '0 0 12px rgba(245, 158, 11, 0.6)',
    },
    price: 150,
    description: 'Polished amber gold ring',
    rarity: 'common'
  },
  {
    id: 'frame-emerald-pulse',
    category: 'avatarFrame',
    name: 'Emerald Aura',
    cssVars: {
      '--avatar-frame-border': '2px solid #10b981',
      '--avatar-frame-shadow': '0 0 14px rgba(16, 185, 129, 0.65)',
    },
    price: 600,
    description: 'Vibrant emerald border with an active pulse',
    rarity: 'rare'
  },
  {
    id: 'frame-violet-royal',
    category: 'avatarFrame',
    name: 'Royal Velvet',
    cssVars: {
      '--avatar-frame-border': '3px solid #8b5cf6',
      '--avatar-frame-shadow': '0 0 16px rgba(139, 92, 246, 0.7)',
    },
    price: 600,
    description: 'Deep royal purple with radiant halo',
    rarity: 'rare'
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
    rarity: 'epic'
  },
  {
    id: 'frame-pro-animated-diamond',
    category: 'avatarFrame',
    name: 'Animated Diamond',
    cssVars: {
      '--avatar-frame-border': '3px solid #e0f2fe',
      '--avatar-frame-shadow': '0 0 20px rgba(56, 189, 248, 0.9)',
    },
    price: 5000,
    description: 'A dazzling animated diamond frame.',
    rarity: 'legendary',
    proOnly: true
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
    rarity: 'common'
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
    price: 150,
    description: 'Warm twilight gradient with amber highlights',
    rarity: 'common'
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
    rarity: 'rare'
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
    price: 600,
    description: 'Lush green botanical backdrop',
    rarity: 'rare'
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
    price: 2000,
    description: 'Prestige stellar gold aesthetic',
    rarity: 'epic'
  },


  {
    id: 'banner-aurora-borealis',
    category: 'profileBanner',
    name: 'Aurora Borealis',
    cssVars: {
      '--banner-background': 'linear-gradient(90deg, #064e3b 0%, #0284c7 100%)',
    },
    price: 150,
    description: 'Flowing polar lights backdrop for your profile card',
    rarity: 'common'
  },
  {
    id: 'banner-volcanic-ash',
    category: 'profileBanner',
    name: 'Volcanic Ash',
    cssVars: {
      '--banner-background': 'linear-gradient(90deg, #1c1917 0%, #7f1d1d 100%)',
    },
    price: 150,
    description: 'Dark volcanic rock with glowing embers',
    rarity: 'common'
  },
  {
    id: 'banner-cosmic-purple',
    category: 'profileBanner',
    name: 'Cosmic Purple',
    cssVars: {
      '--banner-background': 'linear-gradient(90deg, #2e1065 0%, #701a75 100%)',
    },
    price: 600,
    description: 'Deep cosmic galaxy backdrop',
    rarity: 'rare'
  },
  {
    id: 'banner-solar-flare',
    category: 'profileBanner',
    name: 'Solar Flare',
    cssVars: {
      '--banner-background': 'linear-gradient(90deg, #7c2d12 0%, #d97706 100%)',
    },
    price: 600,
    description: 'Radiant solar storm banner',
    rarity: 'rare'
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
    rarity: 'epic'
  },


  {
    id: 'nameplate-slate',
    category: 'nameplate',
    name: 'Slate Stone',
    cssVars: {
      '--nameplate-color': '#475569',
      '--nameplate-text': '#f8fafc',
    },
    price: 150,
    description: 'A solid slate nameplate',
    rarity: 'common'
  },
  {
    id: 'nameplate-emerald',
    category: 'nameplate',
    name: 'Emerald Plate',
    cssVars: {
      '--nameplate-color': '#059669',
      '--nameplate-text': '#ecfdf5',
    },
    price: 600,
    description: 'A glowing emerald nameplate',
    rarity: 'rare'
  },
  {
    id: 'nameplate-pro-gold',
    category: 'nameplate',
    name: 'Pro Gold Plate',
    cssVars: {
      '--nameplate-color': '#b45309',
      '--nameplate-text': '#fffbeb',
      '--nameplate-shadow': '0 0 10px #f59e0b',
    },
    price: 5000,
    description: 'Exclusive golden nameplate for Pros',
    rarity: 'legendary',
    proOnly: true
  },


  {
    id: 'answer-btn-neon',
    category: 'answerButtonStyle',
    name: 'Neon Borders',
    cssVars: {
      '--btn-border': '2px solid #06b6d4',
      '--btn-bg-hover': '#164e63',
    },
    price: 200,
    description: 'Neon borders on answer buttons',
    rarity: 'common'
  },
  {
    id: 'answer-btn-gradient',
    category: 'answerButtonStyle',
    name: 'Lava Gradient',
    cssVars: {
      '--btn-bg': 'linear-gradient(90deg, #b91c1c 0%, #c2410c 100%)',
      '--btn-text': '#fff',
    },
    price: 800,
    description: 'Lava-colored gradient buttons',
    rarity: 'rare'
  },
  {
    id: 'answer-btn-glass',
    category: 'answerButtonStyle',
    name: 'Glassmorphism',
    cssVars: {
      '--btn-bg': 'rgba(255, 255, 255, 0.1)',
      '--btn-border': '1px solid rgba(255, 255, 255, 0.2)',
      '--btn-backdrop-filter': 'blur(10px)',
    },
    price: 2500,
    description: 'Sleek frosted glass answer buttons',
    rarity: 'epic'
  },


  {
    id: 'result-theme-classic-dark',
    category: 'resultScreenTheme',
    name: 'Classic Dark',
    cssVars: {
      '--result-bg': '#0f172a',
      '--result-text': '#e2e8f0',
    },
    price: 150,
    description: 'Standard dark theme for results',
    rarity: 'common'
  },
  {
    id: 'result-theme-victory-gold',
    category: 'resultScreenTheme',
    name: 'Victory Gold',
    cssVars: {
      '--result-bg': '#422006',
      '--result-text': '#fef3c7',
      '--result-accent': '#f59e0b',
    },
    price: 2000,
    description: 'A victorious golden hue for your results',
    rarity: 'epic'
  },
  {
    id: 'result-theme-pro-platinum',
    category: 'resultScreenTheme',
    name: 'Platinum Sparkle',
    cssVars: {
      '--result-bg': '#1e293b',
      '--result-text': '#f8fafc',
      '--result-accent': '#94a3b8',
    },
    price: 5000,
    description: 'Platinum infused results screen for Pros',
    rarity: 'legendary',
    proOnly: true
  },


  {
    id: 'combo-badge-fire',
    category: 'comboBadge',
    name: 'Fire Badge',
    cssVars: {
      '--combo-badge-color': '#ef4444',
    },
    price: 250,
    description: 'A fiery combo indicator',
    rarity: 'common'
  },
  {
    id: 'combo-badge-ice',
    category: 'comboBadge',
    name: 'Ice Badge',
    cssVars: {
      '--combo-badge-color': '#38bdf8',
    },
    price: 850,
    description: 'A freezing combo indicator',
    rarity: 'rare'
  },
  {
    id: 'combo-badge-void',
    category: 'comboBadge',
    name: 'Void Badge',
    cssVars: {
      '--combo-badge-color': '#9333ea',
    },
    price: 1800,
    description: 'A dark void combo indicator',
    rarity: 'epic'
  },


  {
    id: 'effect-pro-sparkles',
    category: 'profileEffect',
    name: 'Pro Sparkles',
    cssVars: {
      '--profile-effect': 'url(/assets/effects/sparkles.png)',
    },
    price: 5000,
    description: 'Sparkling effects around your profile',
    rarity: 'legendary',
    proOnly: true
  },
  {
    id: 'effect-pro-flames',
    category: 'profileEffect',
    name: 'Pro Flames',
    cssVars: {
      '--profile-effect': 'url(/assets/effects/flames.png)',
    },
    price: 5000,
    description: 'Fiery effects around your profile',
    rarity: 'legendary',
    proOnly: true
  },


  {
    id: 'entrance-pro-lightning',
    category: 'battleEntrance',
    name: 'Lightning Strike',
    cssVars: {
      '--battle-entrance': 'lightning',
    },
    price: 5000,
    description: 'Enter battles with a lightning strike',
    rarity: 'legendary',
    proOnly: true
  },
  {
    id: 'entrance-pro-portal',
    category: 'battleEntrance',
    name: 'Void Portal',
    cssVars: {
      '--battle-entrance': 'portal',
    },
    price: 5000,
    description: 'Enter battles through a dark portal',
    rarity: 'legendary',
    proOnly: true
  },
];
