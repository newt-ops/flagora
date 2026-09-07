import type { CountryFlag, RunTierMix, Continent } from '@flagora/shared';
import { COUNTRIES, DEFAULT_RUN_TIER_MIX, getCountriesByContinent } from '@flagora/shared';

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

export function selectRunFlags(
  tierMix: RunTierMix = DEFAULT_RUN_TIER_MIX,
  excludeIsoCodes: string[] = [],
  allFlags: CountryFlag[] = COUNTRIES,
  targetCount?: number,
): CountryFlag[] {
  const excludeSet = new Set(excludeIsoCodes);
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

    const shuffledPreferred = shuffleArray(preferredCandidates);
    const picked = shuffledPreferred.slice(0, count);

    for (const flag of picked) {
      selectedFlags.push(flag);
      selectedIsoCodes.add(flag.isoCode);
    }

    const remainingNeeded = count - picked.length;
    if (remainingNeeded > 0) {
      const fallbackCandidates = tierFlags.filter((f) => !selectedIsoCodes.has(f.isoCode));
      const shuffledFallback = shuffleArray(fallbackCandidates);
      const fallbackPicked = shuffledFallback.slice(0, remainingNeeded);
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
    const shuffledAny = shuffleArray(anyFallbackCandidates);
    for (const flag of shuffledAny.slice(0, remainingNeeded)) {
      selectedFlags.push(flag);
      selectedIsoCodes.add(flag.isoCode);
    }
  }

  return selectedFlags;
}

export function generateChoices(
  correctFlag: CountryFlag,
  distractorPool: CountryFlag[] = COUNTRIES,
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
        : COUNTRIES.filter(
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
}): CountryFlag[] {
  const pool = getCountriesByContinent(options?.continent);
  const targetCount = options?.flagCount ?? 10;
  return selectRunFlags(
    DEFAULT_RUN_TIER_MIX,
    options?.excludeIsoCodes ?? [],
    pool.length >= targetCount ? pool : COUNTRIES,
    targetCount,
  );
}
