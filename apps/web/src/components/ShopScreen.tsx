import { useState } from 'react';
import {
  ShoppingBag,
  Coins,
  CheckCircle2,
  Loader2,
  Sparkles,
  AlertCircle,
  X,
  Palette,
  SquareAsterisk,
  Image as ImageIcon,
} from 'lucide-react';
import type { CosmeticCategory, PlayerProfile, ShopCatalogItem } from '@flagora/shared';
import { useShop } from '../hooks/useShop.js';
import {
  getAvatarFrameClass,
  getFlagThemeClass,
  getProfileBannerClass,
  getItemAffordability,
  getCosmeticCategoryLabel,
  groupCatalogByCategory,
} from './cosmeticHelpers.js';

interface ShopScreenProps {
  profile: PlayerProfile;
  sessionToken: string | null;
  onRefetchProfile?: () => void;
}

export function ShopScreen({ profile, sessionToken }: ShopScreenProps) {
  const [selectedCategory, setSelectedCategory] = useState<CosmeticCategory>('avatarFrame');
  const {
    catalog,
    isLoading,
    error,
    activeActionItemId,
    isPurchasing,
    isEquipping,
    purchase,
    equip,
    refetchCatalog,
    clearError,
  } = useShop(sessionToken);

  const categories: { id: CosmeticCategory; label: string; icon: typeof SquareAsterisk }[] = [
    { id: 'avatarFrame', label: getCosmeticCategoryLabel('avatarFrame'), icon: SquareAsterisk },
    { id: 'flagTheme', label: getCosmeticCategoryLabel('flagTheme'), icon: Palette },
    { id: 'profileBanner', label: getCosmeticCategoryLabel('profileBanner'), icon: ImageIcon },
  ];

  const grouped = groupCatalogByCategory(catalog);
  const currentCategoryItems = grouped[selectedCategory] || [];
  const initial = profile.firstName ? profile.firstName.charAt(0).toUpperCase() : 'P';

  const handlePurchase = async (item: ShopCatalogItem) => {
    try {
      await purchase(item.id);
    } catch {
      void 0;
    }
  };

  const handleEquip = async (item: ShopCatalogItem) => {
    try {
      await equip(item.id);
    } catch {
      void 0;
    }
  };

  return (
    <div className="flex w-full max-w-sm flex-col gap-4 text-tg-text pb-20">
      <div className="flex items-center justify-between rounded-2xl bg-tg-section border border-tg-separator p-4 shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-tg-button/10 text-tg-button">
            <ShoppingBag className="h-5 w-5" />
          </div>
          <div className="flex flex-col text-left">
            <h1 className="text-base font-bold text-tg-text">Cosmetic Shop</h1>
            <p className="text-xs text-tg-hint">Visual presets & custom styles</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 rounded-full bg-tg-secondary-bg border border-tg-separator px-3 py-1.5 text-xs font-bold text-tg-text">
          <Coins className="h-4 w-4 text-amber-500" />
          <span>{profile.coins.toLocaleString()}</span>
        </div>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-xl bg-rose-500/20 border border-rose-500/30 p-3 text-xs text-rose-400">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={clearError}
            className="rounded p-1 text-rose-400 hover:text-rose-300 active:opacity-75"
            aria-label="Dismiss error"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-3 gap-1.5 rounded-2xl bg-tg-section border border-tg-separator p-1.5 shadow-sm">
        {categories.map((cat) => {
          const Icon = cat.icon;
          const isActive = selectedCategory === cat.id;

          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition-all duration-200 active:scale-95 ${
                isActive
                  ? 'bg-tg-button text-tg-button-text shadow-sm'
                  : 'text-tg-hint hover:text-tg-text'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{cat.label}</span>
            </button>
          );
        })}
      </div>

      {isLoading && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-tg-section border border-tg-separator p-10 text-center shadow-sm">
          <Loader2 className="h-7 w-7 animate-spin text-tg-button" />
          <p className="text-xs font-semibold text-tg-hint">Loading shop catalog...</p>
        </div>
      )}

      {!isLoading && currentCategoryItems.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-tg-section border border-tg-separator p-8 text-center shadow-sm">
          <Sparkles className="h-6 w-6 text-tg-hint" />
          <p className="text-xs font-semibold text-tg-text">No items available in this category</p>
          <button
            type="button"
            onClick={() => void refetchCatalog()}
            className="mt-2 rounded-xl bg-tg-secondary-bg border border-tg-separator px-3 py-1.5 text-xs font-bold text-tg-text"
          >
            Refresh
          </button>
        </div>
      )}

      {!isLoading && currentCategoryItems.length > 0 && (
        <div className="flex flex-col gap-3">
          {currentCategoryItems.map((item) => {
            const isItemActionLoading =
              activeActionItemId === item.id && (isPurchasing || isEquipping);
            const affordability = getItemAffordability(profile.coins, item.price);

            const frameClass =
              item.category === 'avatarFrame' ? getAvatarFrameClass(item.id) : '';
            const themeClass =
              item.category === 'flagTheme' ? getFlagThemeClass(item.id) : '';
            const bannerClass =
              item.category === 'profileBanner' ? getProfileBannerClass(item.id) : '';

            return (
              <div
                key={item.id}
                className={`flex flex-col rounded-2xl bg-tg-section border p-4 shadow-sm transition-all ${
                  item.isEquipped
                    ? 'border-tg-button ring-1 ring-tg-button/30'
                    : 'border-tg-separator'
                } ${!item.isOwned && !affordability.canAfford ? 'opacity-75' : ''}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {item.category === 'avatarFrame' && (
                      <div className="relative flex h-14 w-14 shrink-0 items-center justify-center">
                        {profile.photoUrl ? (
                          <img
                            src={profile.photoUrl}
                            alt={item.name}
                            className={`h-12 w-12 rounded-full object-cover ${frameClass}`}
                          />
                        ) : (
                          <div
                            className={`flex h-12 w-12 items-center justify-center rounded-full bg-tg-button text-base font-bold text-tg-button-text ${frameClass}`}
                          >
                            {initial}
                          </div>
                        )}
                      </div>
                    )}

                    {item.category === 'flagTheme' && (
                      <div
                        className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-tg-separator shadow-inner ${themeClass}`}
                      >
                        <span className="fi fi-br text-2xl drop-shadow" />
                      </div>
                    )}

                    {item.category === 'profileBanner' && (
                      <div
                        className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-tg-separator shadow-inner ${bannerClass}`}
                      >
                        <Sparkles className="h-5 w-5 text-white/90 drop-shadow" />
                      </div>
                    )}

                    <div className="flex flex-col text-left">
                      <div className="flex items-center gap-1.5">
                        <h2 className="text-sm font-bold text-tg-text">{item.name}</h2>
                        {item.isEquipped && (
                          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/30">
                            Equipped
                          </span>
                        )}
                        {!item.isEquipped && item.isOwned && (
                          <span className="rounded-full bg-tg-button/15 px-2 py-0.5 text-[10px] font-bold text-tg-button border border-tg-button/30">
                            Owned
                          </span>
                        )}
                      </div>
                      {item.description && (
                        <p className="mt-0.5 text-xs text-tg-hint line-clamp-2">
                          {item.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1 rounded-full bg-tg-secondary-bg border border-tg-separator px-2.5 py-1 text-xs font-bold text-tg-text">
                    <Coins className="h-3.5 w-3.5 text-amber-500" />
                    <span>{item.price.toLocaleString()}</span>
                  </div>
                </div>

                <div className="mt-3.5 flex items-center justify-end border-t border-tg-separator pt-3">
                  {item.isEquipped && (
                    <div className="flex items-center gap-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 px-3 py-1.5 text-xs font-bold text-emerald-400">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Currently Active</span>
                    </div>
                  )}

                  {!item.isEquipped && item.isOwned && (
                    <button
                      type="button"
                      disabled={isItemActionLoading}
                      onClick={() => void handleEquip(item)}
                      className="flex items-center justify-center gap-1.5 rounded-xl bg-tg-button px-4 py-2 text-xs font-bold text-tg-button-text shadow-sm transition-opacity hover:opacity-90 active:opacity-75 disabled:pointer-events-none disabled:opacity-50"
                    >
                      {isItemActionLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : null}
                      <span>Equip</span>
                    </button>
                  )}

                  {!item.isOwned && affordability.canAfford && (
                    <button
                      type="button"
                      disabled={isItemActionLoading}
                      onClick={() => void handlePurchase(item)}
                      className="flex items-center justify-center gap-1.5 rounded-xl bg-tg-button px-4 py-2 text-xs font-bold text-tg-button-text shadow-sm transition-opacity hover:opacity-90 active:opacity-75 disabled:pointer-events-none disabled:opacity-50"
                    >
                      {isItemActionLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Coins className="h-3.5 w-3.5 text-amber-300" />
                      )}
                      <span>Buy for {item.price.toLocaleString()} 🪙</span>
                    </button>
                  )}

                  {!item.isOwned && !affordability.canAfford && (
                    <div className="flex items-center gap-2 rounded-xl bg-tg-secondary-bg border border-tg-separator px-3 py-1.5 text-xs font-semibold text-tg-hint cursor-not-allowed">
                      <Coins className="h-3.5 w-3.5 text-tg-hint" />
                      <span>{affordability.reasonText}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
