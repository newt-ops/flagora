import { useState } from 'react';
import { Lock, Award, CheckCircle2 } from './icons.js';
import { BADGE_CATALOG, type PlayerBadgeResponseItem } from '@flagora/shared';
import {
  getMergedBadgeItems,
  getBadgeIcon,
} from './badgeHelpers.js';

interface BadgeShowcaseProps {
  badges?: PlayerBadgeResponseItem[];
  isLoading?: boolean;
}

export function BadgeShowcase({ badges = [], isLoading = false }: BadgeShowcaseProps) {
  const [filter, setFilter] = useState<'all' | 'unlocked'>('all');
  const mergedItems = getMergedBadgeItems(BADGE_CATALOG, badges);
  const earnedCount = mergedItems.filter((b) => b.isEarned).length;
  const totalCatalogCount = BADGE_CATALOG.length;
  const progressPercent = totalCatalogCount > 0 ? Math.round((earnedCount / totalCatalogCount) * 100) : 0;

  const displayedItems = filter === 'unlocked'
    ? mergedItems.filter((b) => b.isEarned)
    : mergedItems;

  return (
    <div
      data-testid="badge-showcase"
      className="mt-4 flex w-full flex-col rounded-2xl bg-tg-section/90 p-4 sm:p-5 text-left shadow-sm border border-tg-separator/30 backdrop-blur-sm"
    >
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-tg-button/15 text-tg-button shadow-inner">
            <Award className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-extrabold text-tg-text truncate tracking-tight">Mastery Badges</h3>
            <p className="text-[11px] text-tg-hint truncate">Honors earned through knowledge & speed</p>
          </div>
        </div>
        <span
          data-testid="badge-unlocked-count"
          className="rounded-full bg-tg-button/15 border border-tg-button/30 px-3 py-1 text-xs font-black text-tg-button shrink-0"
        >
          {isLoading ? '...' : `${earnedCount} / ${totalCatalogCount} Unlocked`}
        </span>
      </div>

      {/* Progress Bar */}
      <div className="mt-3.5 w-full">
        <div className="flex items-center justify-between text-[11px] font-semibold text-tg-hint mb-1.5">
          <span>Mastery Completion</span>
          <span>{progressPercent}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-tg-secondary-bg overflow-hidden p-0.5 border border-tg-separator/30">
          <div
            className="h-full rounded-full bg-gradient-to-r from-tg-button to-[#2AABEE] transition-all duration-500 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="mt-4 flex items-center gap-1.5 p-1 rounded-xl bg-tg-secondary-bg/80 border border-tg-separator/20">
        <button
          type="button"
          onClick={() => setFilter('all')}
          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all ${
            filter === 'all'
              ? 'bg-tg-section text-tg-text shadow-sm'
              : 'text-tg-hint hover:text-tg-text'
          }`}
        >
          All ({mergedItems.length})
        </button>
        <button
          type="button"
          onClick={() => setFilter('unlocked')}
          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all ${
            filter === 'unlocked'
              ? 'bg-tg-section text-tg-text shadow-sm'
              : 'text-tg-hint hover:text-tg-text'
          }`}
        >
          Unlocked ({earnedCount})
        </button>
      </div>

      {/* Badge List */}
      <div className="mt-3 flex flex-col gap-2.5">
        {filter === 'unlocked' && displayedItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-6 text-center rounded-xl bg-tg-secondary-bg/50 border border-dashed border-tg-separator/40">
            <Award className="h-8 w-8 text-tg-hint/50 mb-2" />
            <p className="text-xs font-bold text-tg-text">No badges unlocked yet</p>
            <p className="text-[11px] text-tg-hint mt-0.5">Play games and maintain streaks to earn prestige badges!</p>
          </div>
        ) : (
          displayedItems.map((item, index) => {
            const Icon = getBadgeIcon(item.id);

            return (
              <div
                key={`${item.id}-${item.season ?? index}`}
                data-testid={`badge-item-${item.id}`}
                className={`relative flex items-start gap-3 rounded-xl p-3 transition-all ${
                  item.isEarned
                    ? 'bg-tg-section border border-tg-button/25 shadow-sm'
                    : 'bg-tg-secondary-bg/40 border border-tg-separator/20 opacity-70'
                }`}
              >
                <div
                  className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${
                    item.isEarned
                      ? 'bg-tg-button/15 text-tg-button ring-1 ring-tg-button/30'
                      : 'bg-tg-separator/30 text-tg-hint/60'
                  }`}
                >
                  {item.isEarned ? (
                    <Icon className="h-5 w-5" />
                  ) : (
                    <Lock className="h-4 w-4" />
                  )}
                </div>

                <div className="flex flex-1 flex-col min-w-0">
                  <div className="flex items-center justify-between gap-1.5 flex-wrap">
                    <span className={`text-xs font-bold truncate ${item.isEarned ? 'text-tg-text' : 'text-tg-hint/90'}`}>
                      {item.name}
                    </span>
                    {item.isEarned ? (
                      <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-tg-button/15 border border-tg-button/30 px-2 py-0.5 text-[10px] font-bold text-tg-button">
                        <CheckCircle2 className="h-3 w-3" />
                        {item.formattedSeason ? item.formattedSeason : 'Earned'}
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full bg-tg-secondary-bg border border-tg-separator/30 px-2 py-0.5 text-[10px] font-semibold text-tg-hint">
                        Locked
                      </span>
                    )}
                  </div>

                  <p className="mt-1 text-[11px] leading-relaxed text-tg-hint">
                    {item.description}
                  </p>

                  {item.isEarned && item.earnedAt && !item.formattedSeason && (
                    <span className="mt-1 text-[10px] font-medium text-tg-hint/70">
                      Earned on {item.earnedAt}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
