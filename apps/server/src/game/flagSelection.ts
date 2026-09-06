import type { CountryFlag, RunTierMix } from '@flagora/shared';

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
  tierMix: RunTierMix,
  excludeIsoCodes: string[] = [],
  allFlags: CountryFlag[],
): CountryFlag[] {
  const excludeSet = new Set(excludeIsoCodes);
  const selectedFlags: CountryFlag[] = [];
  const selectedIsoCodes = new Set<string>();

  const tiers = [1, 2, 3, 4] as const;

  for (const tier of tiers) {
    const count = tierMix[tier] || 0;
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

  return selectedFlags;
}

export function generateChoices(correctFlag: CountryFlag, allTierPeers: CountryFlag[]): string[] {
  const distractorCandidates = allTierPeers.filter(
    (f) => f.isoCode !== correctFlag.isoCode && f.name !== correctFlag.name,
  );

  const shuffled = shuffleArray(distractorCandidates);
  const selectedDistractors = shuffled.slice(0, 3).map((f) => f.name);

  const choices = [correctFlag.name, ...selectedDistractors];
  return shuffleArray(choices);
}
