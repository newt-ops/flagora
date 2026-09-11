import type { Db } from 'mongodb';
import type { CosmeticItem, CosmeticCategory } from '@flagora/shared';
import { INITIAL_COSMETIC_CATALOG } from './cosmeticCatalog.js';

let inMemoryCatalog: CosmeticItem[] | null = null;
let catalogById = new Map<string, CosmeticItem>();
let catalogByCategory = new Map<CosmeticCategory, CosmeticItem[]>();

function populateIndexMaps(items: CosmeticItem[]): void {
  inMemoryCatalog = [...items];
  catalogById = new Map();
  catalogByCategory = new Map([
    ['avatarFrame', []],
    ['flagTheme', []],
    ['profileBanner', []],
  ]);

  for (const item of items) {
    catalogById.set(item.id, item);
    const categoryList = catalogByCategory.get(item.category) ?? [];
    categoryList.push(item);
    catalogByCategory.set(item.category, categoryList);
  }
}

export async function initCosmeticCache(db?: Db): Promise<CosmeticItem[]> {
  if (db) {
    try {
      const itemsFromDb = await db.collection<CosmeticItem>('cosmetics').find().toArray();
      if (itemsFromDb.length > 0) {
        populateIndexMaps(itemsFromDb);
        return inMemoryCatalog!;
      }
    } catch {
      void 0;
    }
  }

  if (!inMemoryCatalog) {
    populateIndexMaps(INITIAL_COSMETIC_CATALOG);
  }
  return inMemoryCatalog!;
}

export async function reloadCosmeticCache(db: Db): Promise<{ count: number }> {
  const itemsFromDb = await db.collection<CosmeticItem>('cosmetics').find().toArray();
  if (itemsFromDb.length > 0) {
    populateIndexMaps(itemsFromDb);
    return { count: itemsFromDb.length };
  }
  populateIndexMaps(INITIAL_COSMETIC_CATALOG);
  return { count: INITIAL_COSMETIC_CATALOG.length };
}

export function getCachedCosmeticCatalog(): CosmeticItem[] {
  if (!inMemoryCatalog) {
    populateIndexMaps(INITIAL_COSMETIC_CATALOG);
  }
  return inMemoryCatalog!;
}

export function getCachedCosmeticItem(id: string): CosmeticItem | undefined {
  if (!inMemoryCatalog) {
    populateIndexMaps(INITIAL_COSMETIC_CATALOG);
  }
  return catalogById.get(id);
}

export function getCachedCosmeticsByCategory(category: CosmeticCategory): CosmeticItem[] {
  if (!inMemoryCatalog) {
    populateIndexMaps(INITIAL_COSMETIC_CATALOG);
  }
  return catalogByCategory.get(category) ?? [];
}

export function resetCosmeticCache(): void {
  inMemoryCatalog = null;
  catalogById.clear();
  catalogByCategory.clear();
}
