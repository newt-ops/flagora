import type { Db } from 'mongodb';
import type {
  ShopCatalogResponse,
  ShopCatalogItem,
  PurchaseResponse,
  EquipResponse,
  PlayerProfile,
} from '@flagora/shared';
import { getCachedCosmeticCatalog, getCachedCosmeticItem } from './cosmeticCache.js';
import {
  CosmeticItemNotFoundError,
  ItemAlreadyOwnedError,
  InsufficientCoinsError,
  ItemNotOwnedError,
  ProfileNotFoundError,
} from './shopTypes.js';

export async function getShopCatalog(
  telegramUserId: number,
  db: Db,
): Promise<ShopCatalogResponse> {
  const profile = await db.collection<PlayerProfile>('profiles').findOne({ telegramUserId });
  if (!profile) {
    throw new ProfileNotFoundError();
  }

  const ownedSet = new Set(profile.ownedItemIds ?? []);
  const equippedMap = profile.equipped ?? {};
  const catalog = getCachedCosmeticCatalog();

  const items: ShopCatalogItem[] = catalog.map((item) => {
    const isOwned = ownedSet.has(item.id);
    const equippedId = equippedMap[item.category];
    const isEquipped = equippedId === item.id;

    return {
      ...item,
      isOwned,
      isEquipped,
    };
  });

  return { items };
}

export async function purchaseCosmeticItem(
  telegramUserId: number,
  itemId: string,
  db: Db,
): Promise<PurchaseResponse> {
  if (!itemId || typeof itemId !== 'string') {
    throw new CosmeticItemNotFoundError('Item ID is required');
  }

  const item = getCachedCosmeticItem(itemId);
  if (!item) {
    throw new CosmeticItemNotFoundError();
  }

  const profile = await db.collection<PlayerProfile>('profiles').findOne({ telegramUserId });
  if (!profile) {
    throw new ProfileNotFoundError();
  }

  if ((profile.ownedItemIds ?? []).includes(itemId)) {
    throw new ItemAlreadyOwnedError();
  }

  if (profile.coins < item.price) {
    throw new InsufficientCoinsError(item.price, profile.coins);
  }

  const updateResult = await db.collection<PlayerProfile>('profiles').findOneAndUpdate(
    {
      telegramUserId,
      coins: { $gte: item.price },
      ownedItemIds: { $ne: itemId },
    },
    {
      $inc: { coins: -item.price },
      $addToSet: { ownedItemIds: itemId },
      $set: { updatedAt: new Date() },
    },
    { returnDocument: 'after' },
  );

  if (!updateResult) {
    const refreshed = await db.collection<PlayerProfile>('profiles').findOne({ telegramUserId });
    if (!refreshed) {
      throw new ProfileNotFoundError();
    }
    if ((refreshed.ownedItemIds ?? []).includes(itemId)) {
      throw new ItemAlreadyOwnedError();
    }
    if (refreshed.coins < item.price) {
      throw new InsufficientCoinsError(item.price, refreshed.coins);
    }
    throw new InsufficientCoinsError(item.price, refreshed.coins);
  }

  return {
    success: true,
    itemId: item.id,
    newCoins: updateResult.coins,
    profile: updateResult,
  };
}

export async function equipCosmeticItem(
  telegramUserId: number,
  itemId: string,
  db: Db,
): Promise<EquipResponse> {
  if (!itemId || typeof itemId !== 'string') {
    throw new CosmeticItemNotFoundError('Item ID is required');
  }

  const item = getCachedCosmeticItem(itemId);
  if (!item) {
    throw new CosmeticItemNotFoundError();
  }

  const profile = await db.collection<PlayerProfile>('profiles').findOne({ telegramUserId });
  if (!profile) {
    throw new ProfileNotFoundError();
  }

  const isOwned = (profile.ownedItemIds ?? []).includes(itemId);
  if (!isOwned) {
    throw new ItemNotOwnedError();
  }

  const updateResult = await db.collection<PlayerProfile>('profiles').findOneAndUpdate(
    {
      telegramUserId,
      ownedItemIds: itemId,
    },
    {
      $set: {
        [`equipped.${item.category}`]: itemId,
        updatedAt: new Date(),
      },
    },
    { returnDocument: 'after' },
  );

  if (!updateResult) {
    throw new ItemNotOwnedError();
  }

  return {
    success: true,
    itemId: item.id,
    category: item.category,
    equipped: updateResult.equipped ?? {},
  };
}
