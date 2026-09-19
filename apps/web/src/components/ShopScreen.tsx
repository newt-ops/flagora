import { useState } from 'react';
import {
  ShoppingBag,
  Coins as Pins,
  CheckCircle2,
  Loader2,
  Sparkles,
  AlertCircle,
  X,
  Palette,
  SquareAsterisk,
  Image as ImageIcon,
  Crown,
  Lock,
  Tag,
  MousePointerClick,
  Trophy,
  Flame,
  Zap,
} from 'lucide-react';
import type {
  CosmeticCategory,
  PlayerProfile,
  ShopCatalogItem,
  ProStatusResponse,
} from '@flagora/shared';
import { useShop } from '../hooks/useShop.js';
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
  getRarityStyle,
} from './cosmeticHelpers.js';
import { ProUpgradeModal } from './ProUpgradeModal.js';

interface ShopScreenProps {
  profile: PlayerProfile;
  sessionToken: string | null;
  onRefetchProfile?: () => void;
  isPro?: boolean;
  proStatus?: ProStatusResponse | null;
  onRefetchProStatus?: () => void;
}

type ShopTab = 'pro' | CosmeticCategory;

export function ShopScreen({
  profile,
  sessionToken,
  onRefetchProfile,
  isPro = false,
  proStatus = null,
  onRefetchProStatus,
}: ShopScreenProps) {
  const [selectedCategory, setSelectedCategory] = useState<ShopTab>('avatarFrame');
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);

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

  const categories: { id: ShopTab; label: string; icon: typeof SquareAsterisk }[] = [
    { id: 'pro', label: 'Pro', icon: Crown },
    { id: 'avatarFrame', label: getCosmeticCategoryLabel('avatarFrame'), icon: SquareAsterisk },
    { id: 'flagTheme', label: getCosmeticCategoryLabel('flagTheme'), icon: Palette },
    { id: 'profileBanner', label: getCosmeticCategoryLabel('profileBanner'), icon: ImageIcon },
    { id: 'nameplate', label: getCosmeticCategoryLabel('nameplate'), icon: Tag },
    { id: 'answerButtonStyle', label: getCosmeticCategoryLabel('answerButtonStyle'), icon: MousePointerClick },
    { id: 'resultScreenTheme', label: getCosmeticCategoryLabel('resultScreenTheme'), icon: Trophy },
    { id: 'comboBadge', label: getCosmeticCategoryLabel('comboBadge'), icon: Flame },
  ];

  const grouped = groupCatalogByCategory(catalog);
  const currentCategoryItems =
    selectedCategory === 'pro'
      ? catalog.filter((item) => item.proOnly)
      : grouped[selectedCategory] || [];

  const initial = profile.firstName ? profile.firstName.charAt(0).toUpperCase() : 'P';

  const handlePurchase = async (item: ShopCatalogItem) => {
    try {
      await purchase(item.id);
      onRefetchProfile?.();
    } catch {
      void 0;
    }
  };

  const handleEquip = async (item: ShopCatalogItem) => {
    try {
      await equip(item.id);
      onRefetchProfile?.();
    } catch {
      void 0;
    }
  };

  const handleUpgradeSuccess = () => {
    onRefetchProfile?.();
    onRefetchProStatus?.();
    void refetchCatalog();
  };

  return (
    <div className="flex w-full max-w-md mx-auto flex-col gap-4 text-tg-text pb-20">
      <div className="flex items-center justify-between flex-wrap gap-2 rounded-2xl bg-tg-section p-4 shadow-sm">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-tg-button/10 text-tg-button">
            <ShoppingBag className="h-5 w-5" />
          </div>
          <div className="flex flex-col text-left min-w-0">
            <h1 className="text-base font-bold text-tg-text truncate">Cosmetic Shop</h1>
            <p className="text-xs text-tg-hint truncate">Visual presets & custom styles</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 rounded-full bg-tg-secondary-bg px-3 py-1.5 text-xs font-bold text-tg-text shrink-0">
          <Pins className="h-4 w-4 text-tg-button" />
          <span>{profile.pins.toLocaleString()}</span>
        </div>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-xl bg-rose-500/20 p-3 text-xs text-rose-400">
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

      <div className="flex items-center gap-1.5 overflow-x-auto rounded-2xl bg-tg-section p-1.5 shadow-sm scrollbar-none">
        {categories.map((cat) => {
          const Icon = cat.icon;
          const isActive = selectedCategory === cat.id;
          const isProTab = cat.id === 'pro';

          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={`flex shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all duration-200 active:scale-95 ${
                isActive
                  ? isProTab
                    ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shadow-sm font-bold'
                    : 'bg-tg-button text-tg-button-text shadow-sm'
                  : isProTab
                  ? 'text-amber-400 hover:text-amber-300'
                  : 'text-tg-hint hover:text-tg-text'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{cat.label}</span>
            </button>
          );
        })}
      </div>

      {selectedCategory === 'pro' && !isPro && (
        <div className="flex flex-col rounded-2xl bg-gradient-to-br from-amber-500/15 via-amber-500/5 to-transparent border border-amber-500/30 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400">
                <Crown className="h-5 w-5 fill-current" />
              </div>
              <div className="flex flex-col text-left">
                <h2 className="text-sm font-extrabold text-tg-text">Flagora Pro Catalog</h2>
                <p className="text-[11px] text-tg-hint">Exclusive cosmetics, 2× XP weekends & stipend</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsUpgradeModalOpen(true)}
              className="flex shrink-0 items-center gap-1 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-3 py-1.5 text-xs font-bold text-slate-950 shadow-sm hover:brightness-105 active:scale-95"
            >
              <Crown className="h-3.5 w-3.5 fill-current" />
              <span>Join Pro</span>
            </button>
          </div>
        </div>
      )}

      {selectedCategory === 'pro' && isPro && (
        <div className="flex items-center justify-between rounded-2xl bg-amber-500/10 border border-amber-500/25 p-3.5 shadow-sm text-xs">
          <div className="flex items-center gap-2 text-amber-400 font-bold">
            <Crown className="h-4 w-4 fill-current" />
            <span>Flagora Pro Active — Exclusive Items Unlocked</span>
          </div>
          {proStatus?.currentPeriodEnd && (
            <span className="text-[11px] text-tg-hint">
              Until {new Date(proStatus.currentPeriodEnd).toLocaleDateString()}
            </span>
          )}
        </div>
      )}

      {isLoading && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-tg-section p-10 text-center shadow-sm">
          <Loader2 className="h-7 w-7 animate-spin text-tg-button" />
          <p className="text-xs font-semibold text-tg-hint">Loading shop catalog...</p>
        </div>
      )}

      {!isLoading && currentCategoryItems.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-tg-section p-8 text-center shadow-sm">
          <Sparkles className="h-6 w-6 text-tg-hint" />
          <p className="text-xs font-semibold text-tg-text">No items available in this category</p>
          <button
            type="button"
            onClick={() => void refetchCatalog()}
            className="mt-2 rounded-xl bg-tg-secondary-bg px-3 py-1.5 text-xs font-bold text-tg-text"
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
            const affordability = getItemAffordability(profile.pins, item.price);
            const rarityStyle = getRarityStyle(item.rarity);
            const requiresPro = Boolean(item.proOnly && !isPro);

            const frameClass =
              item.category === 'avatarFrame' ? getAvatarFrameClass(item.id) : '';
            const themeClass =
              item.category === 'flagTheme' ? getFlagThemeClass(item.id) : '';
            const bannerClass =
              item.category === 'profileBanner' ? getProfileBannerClass(item.id) : '';

            return (
              <div
                key={item.id}
                className={`relative flex flex-col rounded-2xl bg-tg-section p-4 shadow-sm transition-all border ${
                  rarityStyle.borderClass
                } ${rarityStyle.glowClass} ${
                  item.isEquipped ? 'ring-2 ring-tg-button' : ''
                } ${!item.isOwned && !affordability.canAfford && !requiresPro ? 'opacity-75' : ''}`}
              >
                <div className="flex items-start justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3 min-w-0">
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
                        className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl shadow-inner ${themeClass}`}
                      >
                        <span className="fi fi-br text-2xl drop-shadow" />
                      </div>
                    )}

                    {item.category === 'profileBanner' && (
                      <div
                        className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl shadow-inner ${bannerClass}`}
                      >
                        <Sparkles className="h-5 w-5 text-white/90 drop-shadow" />
                      </div>
                    )}

                    {item.category === 'nameplate' && (
                      <div className="flex h-14 w-28 shrink-0 items-center justify-center rounded-xl bg-tg-secondary-bg p-2">
                        <span
                          className={`px-2.5 py-1 rounded-md text-xs font-bold truncate max-w-full ${getNameplateClass(
                            item.id,
                          )}`}
                        >
                          {profile.firstName || 'Player'}
                        </span>
                      </div>
                    )}

                    {item.category === 'answerButtonStyle' && (
                      <div className="flex h-14 w-28 shrink-0 items-center justify-center">
                        <div
                          className={`w-full py-1.5 px-2 rounded-xl text-center text-xs font-semibold truncate ${getAnswerButtonClass(
                            item.id,
                          )}`}
                        >
                          Option A
                        </div>
                      </div>
                    )}

                    {item.category === 'resultScreenTheme' && (
                      <div
                        className={`flex h-14 w-28 shrink-0 flex-col items-center justify-center rounded-xl p-1.5 shadow-inner ${getResultThemeClass(
                          item.id,
                        )}`}
                      >
                        <Trophy className="h-4 w-4" />
                        <span className="text-[10px] font-extrabold tracking-tight">1,250 pts</span>
                      </div>
                    )}

                    {item.category === 'comboBadge' && (
                      <div className="flex h-14 w-28 shrink-0 items-center justify-center">
                        <div
                          className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-extrabold border ${getComboBadgeClass(
                            item.id,
                          )}`}
                        >
                          <Flame className="h-3.5 w-3.5 fill-current" />
                          <span>5×</span>
                        </div>
                      </div>
                    )}

                    {item.category === 'profileEffect' && (
                      <div
                        className={`flex h-14 w-28 shrink-0 items-center justify-center rounded-xl ${getProfileEffectClass(
                          item.id,
                        )}`}
                      >
                        <Sparkles className="h-5 w-5" />
                      </div>
                    )}

                    {item.category === 'battleEntrance' && (
                      <div
                        className={`flex h-14 w-28 shrink-0 items-center justify-center rounded-xl ${getBattleEntranceClass(
                          item.id,
                        )}`}
                      >
                        <Zap className="h-5 w-5" />
                      </div>
                    )}

                    <div className="flex flex-col text-left min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h2 className="text-sm font-bold text-tg-text truncate">{item.name}</h2>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${rarityStyle.badgeClass}`}
                        >
                          {rarityStyle.label}
                        </span>
                        {item.proOnly && (
                          <span className="rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[10px] font-bold text-amber-400 flex items-center gap-0.5">
                            <Crown className="h-2.5 w-2.5 fill-current" />
                            <span>Pro</span>
                          </span>
                        )}
                        {item.isEquipped && (
                          <span className="rounded-full bg-tg-button/15 px-2 py-0.5 text-[10px] font-bold text-tg-button shrink-0">
                            Equipped
                          </span>
                        )}
                        {!item.isEquipped && item.isOwned && (
                          <span className="rounded-full bg-tg-button/15 px-2 py-0.5 text-[10px] font-bold text-tg-button shrink-0">
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

                  <div className="flex shrink-0 items-center gap-1 rounded-full bg-tg-secondary-bg px-2.5 py-1 text-xs font-bold text-tg-text">
                    <Pins className="h-3.5 w-3.5 text-tg-button" />
                    <span>{item.price.toLocaleString()}</span>
                  </div>
                </div>

                <div className="mt-3.5 flex items-center justify-end border-t border-tg-separator/30 pt-3">
                  {requiresPro ? (
                    <div className="flex w-full items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
                        <Lock className="h-3.5 w-3.5" />
                        <span>Requires Flagora Pro</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsUpgradeModalOpen(true)}
                        className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-3.5 py-1.5 text-xs font-bold text-slate-950 shadow-sm transition-transform active:scale-95 hover:brightness-105"
                      >
                        <Crown className="h-3.5 w-3.5 fill-current" />
                        <span>Upgrade</span>
                      </button>
                    </div>
                  ) : (
                    <>
                      {item.isEquipped && (
                        <div className="flex items-center gap-1.5 rounded-xl bg-tg-button/15 px-3 py-1.5 text-xs font-bold text-tg-button">
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
                            <Pins className="h-3.5 w-3.5 text-tg-button-text" />
                          )}
                          <span>Buy for {item.price.toLocaleString()} Pins</span>
                        </button>
                      )}

                      {!item.isOwned && !affordability.canAfford && (
                        <div className="flex items-center gap-2 rounded-xl bg-tg-secondary-bg px-3 py-1.5 text-xs font-semibold text-tg-hint cursor-not-allowed">
                          <Pins className="h-3.5 w-3.5 text-tg-hint" />
                          <span>{affordability.reasonText}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ProUpgradeModal
        isOpen={isUpgradeModalOpen}
        onClose={() => setIsUpgradeModalOpen(false)}
        sessionToken={sessionToken}
        onSuccess={handleUpgradeSuccess}
      />
    </div>
  );
}
