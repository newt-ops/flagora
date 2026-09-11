import type { Db } from 'mongodb';
import type { CosmeticItem } from '@flagora/shared';
import { INITIAL_COSMETIC_CATALOG } from './cosmeticCatalog.js';
import { reloadCosmeticCache } from './cosmeticCache.js';

export interface CosmeticSeedResult {
  upserted: number;
  matched: number;
  total: number;
}

export async function seedCosmetics(db: Db): Promise<CosmeticSeedResult> {
  const collection = db.collection<CosmeticItem>('cosmetics');
  await collection.createIndex({ id: 1 }, { unique: true });
  await collection.createIndex({ category: 1 });

  const operations = INITIAL_COSMETIC_CATALOG.map((item) => ({
    updateOne: {
      filter: { id: item.id },
      update: { $set: item },
      upsert: true,
    },
  }));

  const result = await collection.bulkWrite(operations);
  const total = await collection.countDocuments();
  await reloadCosmeticCache(db);

  return {
    upserted: result.upsertedCount,
    matched: result.matchedCount,
    total,
  };
}
