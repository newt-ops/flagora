import type { CountryFlag, RunTierMix, Continent } from '@flagora/shared';
import { DEFAULT_RUN_TIER_MIX } from '@flagora/shared';
import { getCachedFlags, getCachedFlagsByContinent } from './flagCache.js';

function shuffleArray<T>(array: T[]): T[] {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = copy[i];
    copy[i] = copy[j];
    copy[j] = temp;
  }
  return copy;
}

function sampleCandidates(
  candidates: CountryFlag[],
  count: number,
  pinnedSet: Set<string>,
): CountryFlag[] {
  if (candidates.length <= count) {
    return shuffleArray(candidates);
  }
  if (pinnedSet.size === 0) {
    return shuffleArray(candidates).slice(0, count);
  }
  const weighted = candidates.map((item) => {
    const isPinned = pinnedSet.has(item.isoCode.toUpperCase());
    const weight = isPinned ? 4 : 1;
    const u = Math.max(0.00001, Math.random());
    const key = Math.pow(u, 1 / weight);
    return { item, key };
  });
  weighted.sort((a, b) => b.key - a.key);
  return weighted.slice(0, count).map((w) => w.item);
}

export function selectRunFlags(
  tierMix: RunTierMix = DEFAULT_RUN_TIER_MIX,
  excludeIsoCodes: string[] = [],
  allFlags: CountryFlag[] = getCachedFlags(),
  targetCount?: number,
  pinnedIsoCodes: string[] = [],
): CountryFlag[] {
  const excludeSet = new Set(excludeIsoCodes);
  const pinnedSet = new Set(pinnedIsoCodes.map((c) => c.toUpperCase()));
  const selectedFlags: CountryFlag[] = [];
  const selectedIsoCodes = new Set<string>();

  const isCustomCount = typeof targetCount === 'number' && targetCount > 0;
  let effectiveTierMix = { ...tierMix };

  if (isCustomCount && targetCount !== Object.values(tierMix).reduce((a, b) => a + b, 0)) {
    const t1 = Math.max(1, Math.round(targetCount * 0.4));
    const t2 = Math.max(1, Math.round(targetCount * 0.3));
    const t3 = Math.max(1, Math.round(targetCount * 0.2));
    const t4 = Math.max(0, targetCount - (t1 + t2 + t3));
    effectiveTierMix = { 1: t1, 2: t2, 3: t3, 4: t4 };
  }

  const tiers = [1, 2, 3, 4] as const;

  for (const tier of tiers) {
    const count = effectiveTierMix[tier] || 0;
    if (count <= 0) {
      continue;
    }

    const tierFlags = allFlags.filter((f) => f.tier === tier);
    const preferredCandidates = tierFlags.filter(
      (f) => !excludeSet.has(f.isoCode) && !selectedIsoCodes.has(f.isoCode),
    );

    const picked = sampleCandidates(preferredCandidates, count, pinnedSet);

    for (const flag of picked) {
      selectedFlags.push(flag);
      selectedIsoCodes.add(flag.isoCode);
    }

    const remainingNeeded = count - picked.length;
    if (remainingNeeded > 0) {
      const fallbackCandidates = tierFlags.filter((f) => !selectedIsoCodes.has(f.isoCode));
      const fallbackPicked = sampleCandidates(fallbackCandidates, remainingNeeded, pinnedSet);
      for (const flag of fallbackPicked) {
        selectedFlags.push(flag);
        selectedIsoCodes.add(flag.isoCode);
      }
    }
  }

  const totalDesired = isCustomCount
    ? targetCount
    : Object.values(effectiveTierMix).reduce((a, b) => a + b, 0);

  if (selectedFlags.length < totalDesired) {
    const remainingNeeded = totalDesired - selectedFlags.length;
    const anyFallbackCandidates = allFlags.filter((f) => !selectedIsoCodes.has(f.isoCode));
    const anyPicked = sampleCandidates(anyFallbackCandidates, remainingNeeded, pinnedSet);
    for (const flag of anyPicked) {
      selectedFlags.push(flag);
      selectedIsoCodes.add(flag.isoCode);
    }
  }

  return selectedFlags;
}

export function generateChoices(
  correctFlag: CountryFlag,
  distractorPool: CountryFlag[] = getCachedFlags(),
): string[] {
  const sameTierCandidates = distractorPool.filter(
    (f) =>
      f.tier === correctFlag.tier &&
      f.isoCode !== correctFlag.isoCode &&
      f.name !== correctFlag.name,
  );

  let selectedDistractors: string[] = [];
  if (sameTierCandidates.length >= 3) {
    selectedDistractors = shuffleArray(sameTierCandidates)
      .slice(0, 3)
      .map((f) => f.name);
  } else {
    const fallbackCandidates = distractorPool.filter(
      (f) => f.isoCode !== correctFlag.isoCode && f.name !== correctFlag.name,
    );
    const pool =
      fallbackCandidates.length >= 3
        ? fallbackCandidates
        : getCachedFlags().filter(
            (f) => f.isoCode !== correctFlag.isoCode && f.name !== correctFlag.name,
          );
    selectedDistractors = shuffleArray(pool)
      .slice(0, 3)
      .map((f) => f.name);
  }

  const choices = [correctFlag.name, ...selectedDistractors];
  return shuffleArray(choices);
}

export function selectFlagsForRun(options?: {
  continent?: Continent;
  flagCount?: number;
  excludeIsoCodes?: string[];
  pinnedIsoCodes?: string[];
}): CountryFlag[] {
  const pool = getCachedFlagsByContinent(options?.continent);
  const targetCount = options?.flagCount ?? 10;
  return selectRunFlags(
    DEFAULT_RUN_TIER_MIX,
    options?.excludeIsoCodes ?? [],
    pool.length >= targetCount ? pool : getCachedFlags(),
    targetCount,
    options?.pinnedIsoCodes ?? [],
  );
}
