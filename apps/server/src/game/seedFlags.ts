import type { Db } from 'mongodb';
import { COUNTRIES, type CountryFlag } from '@flagora/shared';

export interface SeedResult {
  upserted: number;
  matched: number;
  total: number;
}

export async function seedFlags(db: Db): Promise<SeedResult> {
  const collection = db.collection<CountryFlag>('flags');
  await collection.createIndex({ isoCode: 1 }, { unique: true });
  await collection.createIndex({ tier: 1 });

  const operations = COUNTRIES.map((flag) => ({
    updateOne: {
      filter: { isoCode: flag.isoCode },
      update: { $set: flag },
      upsert: true,
    },
  }));

  const result = await collection.bulkWrite(operations);
  const total = await collection.countDocuments();

  return {
    upserted: result.upsertedCount,
    matched: result.matchedCount,
    total,
  };
}
