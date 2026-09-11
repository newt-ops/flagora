import type { RankedTier } from '@flagora/shared';
import { getTierBadgeColors, getTierIcon } from './rankHelpers.js';

interface TierBadgeProps {
  tier: RankedTier;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  showLabel?: boolean;
  className?: string;
}

export function TierBadge({
  tier,
  size = 'sm',
  showIcon = true,
  showLabel = true,
  className = '',
}: TierBadgeProps) {
  const Icon = getTierIcon(tier);
  const styles = getTierBadgeColors(tier);

  const sizeClasses = {
    xs: {
      badge: 'px-1.5 py-0.5 text-[10px] gap-1',
      icon: 'h-2.5 w-2.5',
    },
    sm: {
      badge: 'px-2 py-0.5 text-xs gap-1.5',
      icon: 'h-3.5 w-3.5',
    },
    md: {
      badge: 'px-2.5 py-1 text-xs gap-1.5',
      icon: 'h-4 w-4',
    },
    lg: {
      badge: 'px-3 py-1.5 text-sm gap-2',
      icon: 'h-5 w-5',
    },
  }[size];

  return (
    <span
      className={`inline-flex items-center rounded-full font-bold border transition-colors ${styles.badge} ${sizeClasses.badge} ${className}`}
    >
      {showIcon && <Icon className={`${sizeClasses.icon} shrink-0 fill-current`} />}
      {showLabel && <span>{tier}</span>}
    </span>
  );
}
