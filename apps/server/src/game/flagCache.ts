import type { Db } from 'mongodb';
import type { CountryFlag, Continent } from '@flagora/shared';
import { COUNTRIES } from '@flagora/shared';

let inMemoryFlags: CountryFlag[] | null = null;
let flagsByIso = new Map<string, CountryFlag>();
let flagsByTier = new Map<number, CountryFlag[]>();
let flagsByContinent = new Map<Continent, CountryFlag[]>();

function populateIndexMaps(flags: CountryFlag[]): void {
  inMemoryFlags = [...flags];
  flagsByIso = new Map();
  flagsByTier = new Map([[1, []], [2, []], [3, []], [4, []]]);
  flagsByContinent = new Map();

  for (const flag of flags) {
    flagsByIso.set(flag.isoCode, flag);
    const tierList = flagsByTier.get(flag.tier) ?? [];
    tierList.push(flag);
    flagsByTier.set(flag.tier, tierList);

    if (flag.continent) {
      const contList = flagsByContinent.get(flag.continent as Continent) ?? [];
      contList.push(flag);
      flagsByContinent.set(flag.continent as Continent, contList);
    }
  }
}

export async function initFlagCache(db?: Db): Promise<CountryFlag[]> {
  if (db) {
    try {
      const flagsFromDb = await db.collection<CountryFlag>('flags').find().toArray();
      if (flagsFromDb.length > 0) {
        populateIndexMaps(flagsFromDb);
        return inMemoryFlags!;
      }
    } catch {
      void 0;
    }
  }

  if (!inMemoryFlags) {
    populateIndexMaps(COUNTRIES);
  }
  return inMemoryFlags!;
}

export async function reloadFlagCache(db: Db): Promise<{ count: number }> {
  const flagsFromDb = await db.collection<CountryFlag>('flags').find().toArray();
  if (flagsFromDb.length > 0) {
    populateIndexMaps(flagsFromDb);
    return { count: flagsFromDb.length };
  }
  populateIndexMaps(COUNTRIES);
  return { count: COUNTRIES.length };
}

export function getCachedFlags(): CountryFlag[] {
  if (!inMemoryFlags) {
    populateIndexMaps(COUNTRIES);
  }
  return inMemoryFlags!;
}

export function getCachedFlagsByContinent(continent?: Continent): CountryFlag[] {
  if (!continent || continent === 'world') {
    return getCachedFlags();
  }
  if (!inMemoryFlags) {
    populateIndexMaps(COUNTRIES);
  }
  return flagsByContinent.get(continent) ?? [];
}

export function getCachedFlagsByTier(tier: number): CountryFlag[] {
  if (!inMemoryFlags) {
    populateIndexMaps(COUNTRIES);
  }
  return flagsByTier.get(tier) ?? [];
}

export function getCachedFlagByIso(isoCode: string): CountryFlag | undefined {
  if (!inMemoryFlags) {
    populateIndexMaps(COUNTRIES);
  }
  return flagsByIso.get(isoCode);
}

export function resetFlagCache(): void {
  inMemoryFlags = null;
  flagsByIso.clear();
  flagsByTier.clear();
  flagsByContinent.clear();
}
