import { Lock, Award } from 'lucide-react';
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
  const mergedItems = getMergedBadgeItems(BADGE_CATALOG, badges);
  const earnedCount = mergedItems.filter((b) => b.isEarned).length;
  const totalCatalogCount = BADGE_CATALOG.length;

  return (
    <div
      data-testid="badge-showcase"
      className="mt-4 flex w-full flex-col rounded-xl bg-tg-secondary-bg border border-tg-separator p-4 text-left shadow-sm"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-tg-button/10 text-tg-button ring-1 ring-tg-button/20">
            <Award className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold text-tg-text">Mastery Badges</p>
            <p className="text-[11px] text-tg-hint">Prestige honors earned through mastery</p>
          </div>
        </div>
        <span
          data-testid="badge-unlocked-count"
          className="rounded-full bg-tg-button/15 px-2.5 py-0.5 text-xs font-bold text-tg-button"
        >
          {isLoading ? '...' : `${earnedCount} / ${totalCatalogCount} Unlocked`}
        </span>
      </div>

      <div className="mt-3.5 flex flex-col gap-2.5">
        {mergedItems.map((item, index) => {
          const Icon = getBadgeIcon(item.id);

          return (
            <div
              key={`${item.id}-${item.season ?? index}`}
              data-testid={`badge-item-${item.id}`}
              className={`flex items-start gap-3 rounded-xl border p-3 transition-colors ${
                item.isEarned
                  ? 'bg-tg-section border-tg-separator'
                  : 'bg-tg-secondary-bg/50 border-tg-separator/40 opacity-70'
              }`}
            >
              <div
                className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                  item.isEarned
                    ? 'bg-tg-button/10 text-tg-button ring-1 ring-tg-button/20'
                    : 'bg-tg-separator/30 text-tg-hint/60'
                }`}
              >
                {item.isEarned ? (
                  <Icon className="h-5 w-5" />
                ) : (
                  <Lock className="h-4 w-4" />
                )}
              </div>

              <div className="flex flex-1 flex-col">
                <div className="flex items-center justify-between gap-1.5">
                  <span className={`text-xs font-bold ${item.isEarned ? 'text-tg-text' : 'text-tg-hint/90'}`}>{item.name}</span>
                  {item.isEarned ? (
                    <span
                      className="shrink-0 rounded-full bg-tg-button/15 border border-tg-button/25 px-2 py-0.5 text-[10px] font-bold text-tg-button"
                    >
                      {item.formattedSeason ? item.formattedSeason : 'Earned'}
                    </span>
                  ) : (
                    <span
                      className="shrink-0 rounded-full bg-tg-secondary-bg border border-tg-separator px-2 py-0.5 text-[10px] font-semibold text-tg-hint"
                    >
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
        })}
      </div>
    </div>
  );
}
