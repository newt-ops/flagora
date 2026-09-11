import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, type Db } from 'mongodb';
import {
  COSMETIC_CATEGORIES,
  type CosmeticItem,
  type PlayerProfile,
} from '@flagora/shared';
import { createRequireSessionMiddleware, type AuthenticatedSessionRequest } from '../session/requireSession.js';
import { createSessionToken } from '../session/tokens.js';
import { seedCosmetics } from './seedCosmetics.js';
import {
  initCosmeticCache,
  reloadCosmeticCache,
  getCachedCosmeticCatalog,
  getCachedCosmeticItem,
  getCachedCosmeticsByCategory,
  resetCosmeticCache,
} from './cosmeticCache.js';
import {
  getShopCatalog,
  purchaseCosmeticItem,
  equipCosmeticItem,
} from './shopService.js';
import {
  CosmeticItemNotFoundError,
  ItemAlreadyOwnedError,
  InsufficientCoinsError,
  ItemNotOwnedError,
  ProfileNotFoundError,
} from './shopTypes.js';

function createTestProfile(userId: number, overrides: Partial<PlayerProfile> = {}): PlayerProfile {
  return {
    telegramUserId: userId,
    username: `user_${userId}`,
    firstName: `User ${userId}`,
    lastName: null,
    photoUrl: null,
    coins: 0,
    xp: 0,
    level: 1,
    bestScore: 0,
    currentStreak: 0,
    longestStreak: 0,
    gamesPlayed: 0,
    lastPlayedDate: '2026-09-12',
    ownedItemIds: [],
    equipped: { avatarFrame: null, flagTheme: null, profileBanner: null },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('Phase 10 Prompt 01: Cosmetic Shop Backend', () => {
  let mongod: MongoMemoryServer;
  let client: MongoClient;
  let db: Db;
  let server: http.Server;
  let baseUrl: string;
  const sessionSecret = 'test-shop-session-secret-key-12345';
  const adminSecret = 'test-admin-secret';

  before(async () => {
    process.env.ADMIN_SECRET = adminSecret;
    mongod = await MongoMemoryServer.create();
    client = new MongoClient(mongod.getUri());
    await client.connect();
    db = client.db('test-shop-db');

    const app = express();
    app.use(express.json());
    const sessionMiddleware = createRequireSessionMiddleware(sessionSecret);

    app.get(
      '/api/shop/catalog',
      sessionMiddleware,
      async (req: AuthenticatedSessionRequest, res) => {
        try {
          const telegramUserId = req.sessionUser?.telegramUserId;
          if (!telegramUserId) {
            res.status(401).json({ error: 'Unauthorized', message: 'Missing session user' });
            return;
          }
          const catalog = await getShopCatalog(telegramUserId, db);
          res.status(200).json(catalog);
        } catch (error) {
          if (error instanceof ProfileNotFoundError) {
            res.status(404).json({ error: 'Not found', message: error.message });
            return;
          }
          const message = error instanceof Error ? error.message : 'Failed to fetch catalog';
          res.status(500).json({ error: 'Internal server error', message });
        }
      },
    );

    app.post(
      '/api/shop/purchase',
      sessionMiddleware,
      async (req: AuthenticatedSessionRequest, res) => {
        try {
          const telegramUserId = req.sessionUser?.telegramUserId;
          if (!telegramUserId) {
            res.status(401).json({ error: 'Unauthorized', message: 'Missing session user' });
            return;
          }
          const { itemId } = req.body ?? {};
          if (!itemId || typeof itemId !== 'string') {
            res.status(400).json({ error: 'Bad request', message: 'itemId (string) is required' });
            return;
          }
          const result = await purchaseCosmeticItem(telegramUserId, itemId, db);
          res.status(200).json(result);
        } catch (error) {
          if (error instanceof CosmeticItemNotFoundError) {
            res.status(400).json({ error: 'Bad request', message: error.message });
            return;
          }
          if (error instanceof ItemAlreadyOwnedError) {
            res.status(400).json({ error: 'Already owned', message: error.message });
            return;
          }
          if (error instanceof InsufficientCoinsError) {
            res.status(400).json({
              error: 'Insufficient coins',
              message: error.message,
              required: error.required,
              available: error.available,
            });
            return;
          }
          if (error instanceof ProfileNotFoundError) {
            res.status(404).json({ error: 'Not found', message: error.message });
            return;
          }
          const message = error instanceof Error ? error.message : 'Failed to purchase';
          res.status(500).json({ error: 'Internal server error', message });
        }
      },
    );

    app.post(
      '/api/shop/equip',
      sessionMiddleware,
      async (req: AuthenticatedSessionRequest, res) => {
        try {
          const telegramUserId = req.sessionUser?.telegramUserId;
          if (!telegramUserId) {
            res.status(401).json({ error: 'Unauthorized', message: 'Missing session user' });
            return;
          }
          const { itemId } = req.body ?? {};
          if (!itemId || typeof itemId !== 'string') {
            res.status(400).json({ error: 'Bad request', message: 'itemId (string) is required' });
            return;
          }
          const result = await equipCosmeticItem(telegramUserId, itemId, db);
          res.status(200).json(result);
        } catch (error) {
          if (error instanceof CosmeticItemNotFoundError) {
            res.status(400).json({ error: 'Bad request', message: error.message });
            return;
          }
          if (error instanceof ItemNotOwnedError) {
            res.status(400).json({ error: 'Not owned', message: error.message });
            return;
          }
          if (error instanceof ProfileNotFoundError) {
            res.status(404).json({ error: 'Not found', message: error.message });
            return;
          }
          const message = error instanceof Error ? error.message : 'Failed to equip';
          res.status(500).json({ error: 'Internal server error', message });
        }
      },
    );

    app.post('/api/admin/shop/reload', async (req, res) => {
      try {
        const secret = process.env.ADMIN_SECRET;
        if (secret && req.headers['x-admin-secret'] !== secret) {
          res.status(403).json({ error: 'Forbidden', message: 'Invalid admin secret' });
          return;
        }
        const result = await reloadCosmeticCache(db);
        res.status(200).json({ ok: true, count: result.count });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to reload';
        res.status(500).json({ error: 'Internal server error', message });
      }
    });

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address();
        if (typeof address === 'object' && address) {
          baseUrl = `http://127.0.0.1:${address.port}`;
        }
        resolve();
      });
    });
  });

  after(async () => {
    resetCosmeticCache();
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    if (client) {
      await client.close();
    }
    if (mongod) {
      await mongod.stop();
    }
  });

  beforeEach(async () => {
    await db.collection('profiles').deleteMany({});
    await db.collection('cosmetics').deleteMany({});
    resetCosmeticCache();
  });

  it('seeds 15 initial cosmetics into MongoDB idempotently and creates indexes', async () => {
    const firstSeed = await seedCosmetics(db);
    assert.equal(firstSeed.upserted, 15);
    assert.equal(firstSeed.total, 15);

    const indexes = await db.collection('cosmetics').indexes();
    const hasUniqueId = indexes.some(
      (idx) => idx.key && idx.key.id === 1 && idx.unique === true,
    );
    const hasCategoryIndex = indexes.some(
      (idx) => idx.key && idx.key.category === 1,
    );
    assert.equal(hasUniqueId, true);
    assert.equal(hasCategoryIndex, true);

    const secondSeed = await seedCosmetics(db);
    assert.equal(secondSeed.upserted, 0);
    assert.equal(secondSeed.matched, 15);
    assert.equal(secondSeed.total, 15);

    const count = await db.collection('cosmetics').countDocuments();
    assert.equal(count, 15);
  });

  it('manages in-memory cosmetic cache with fast lookups by id and category', async () => {
    await seedCosmetics(db);
    await initCosmeticCache(db);

    const catalog = getCachedCosmeticCatalog();
    assert.equal(catalog.length, 15);

    for (const cat of COSMETIC_CATEGORIES) {
      const items = getCachedCosmeticsByCategory(cat);
      assert.equal(items.length, 5);
      assert.ok(items.every((i) => i.category === cat));
    }

    const cyanFrame = getCachedCosmeticItem('frame-neon-cyan');
    assert.ok(cyanFrame);
    assert.equal(cyanFrame.id, 'frame-neon-cyan');
    assert.equal(cyanFrame.category, 'avatarFrame');
    assert.equal(cyanFrame.price, 100);
    assert.ok(cyanFrame.cssVars);

    const nonExistent = getCachedCosmeticItem('unknown_item_xyz');
    assert.equal(nonExistent, undefined);
  });

  it('reloads cache via admin route protected by secret header', async () => {
    await seedCosmetics(db);
    await initCosmeticCache(db);

    const unauthRes = await fetch(`${baseUrl}/api/admin/shop/reload`, {
      method: 'POST',
      headers: { 'x-admin-secret': 'wrong-secret' },
    });
    assert.equal(unauthRes.status, 403);

    await db.collection<CosmeticItem>('cosmetics').insertOne({
      id: 'frame-custom-admin-test',
      name: 'Custom Admin Frame',
      description: 'Test admin injection',
      category: 'avatarFrame',
      price: 999,
      cssVars: { '--avatar-frame-border': '2px solid #ff00ff' },
    });

    const reloadRes = await fetch(`${baseUrl}/api/admin/shop/reload`, {
      method: 'POST',
      headers: { 'x-admin-secret': adminSecret },
    });
    assert.equal(reloadRes.status, 200);
    const reloadData = (await reloadRes.json()) as { ok: boolean; count: number };
    assert.equal(reloadData.ok, true);
    assert.equal(reloadData.count, 16);

    const found = getCachedCosmeticItem('frame-custom-admin-test');
    assert.ok(found);
    assert.equal(found.name, 'Custom Admin Frame');
  });

  it('computes isOwned and isEquipped correctly in GET /api/shop/catalog', async () => {
    await seedCosmetics(db);
    await initCosmeticCache(db);

    const userId = 1001;
    await db.collection<PlayerProfile>('profiles').insertOne(
      createTestProfile(userId, {
        coins: 500,
        ownedItemIds: ['frame-neon-cyan', 'theme-midnight-ocean'],
        equipped: {
          avatarFrame: 'frame-neon-cyan',
          flagTheme: null,
          profileBanner: null,
        },
      }),
    );

    const token = createSessionToken(userId, sessionSecret);
    const res = await fetch(`${baseUrl}/api/shop/catalog`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { items: Array<CosmeticItem & { isOwned: boolean; isEquipped: boolean }> };
    assert.equal(body.items.length, 15);

    const cyanFrame = body.items.find((i) => i.id === 'frame-neon-cyan');
    assert.ok(cyanFrame);
    assert.equal(cyanFrame.isOwned, true);
    assert.equal(cyanFrame.isEquipped, true);

    const oceanTheme = body.items.find((i) => i.id === 'theme-midnight-ocean');
    assert.ok(oceanTheme);
    assert.equal(oceanTheme.isOwned, true);
    assert.equal(oceanTheme.isEquipped, false);

    const unownedBanner = body.items.find((i) => i.id === 'banner-aurora-borealis');
    assert.ok(unownedBanner);
    assert.equal(unownedBanner.isOwned, false);
    assert.equal(unownedBanner.isEquipped, false);
  });

  it('purchases an item successfully with exact coin balance leaving 0 coins', async () => {
    await seedCosmetics(db);
    await initCosmeticCache(db);

    const userId = 1002;
    const itemPrice = 100;
    await db.collection<PlayerProfile>('profiles').insertOne(
      createTestProfile(userId, {
        coins: itemPrice,
      }),
    );

    const token = createSessionToken(userId, sessionSecret);
    const res = await fetch(`${baseUrl}/api/shop/purchase`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ itemId: 'frame-neon-cyan' }),
    });

    assert.equal(res.status, 200);
    const data = (await res.json()) as { success: boolean; itemId: string; newCoins: number };
    assert.equal(data.success, true);
    assert.equal(data.itemId, 'frame-neon-cyan');
    assert.equal(data.newCoins, 0);

    const updatedProfile = await db.collection<PlayerProfile>('profiles').findOne({ telegramUserId: userId });
    assert.ok(updatedProfile);
    assert.equal(updatedProfile.coins, 0);
    assert.deepEqual(updatedProfile.ownedItemIds, ['frame-neon-cyan']);
  });

  it('rejects purchase when 1 coin short and leaves coins untouched', async () => {
    await seedCosmetics(db);
    await initCosmeticCache(db);

    const userId = 1003;
    const itemPrice = 100;
    await db.collection<PlayerProfile>('profiles').insertOne(
      createTestProfile(userId, {
        coins: itemPrice - 1,
      }),
    );

    const token = createSessionToken(userId, sessionSecret);
    const res = await fetch(`${baseUrl}/api/shop/purchase`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ itemId: 'frame-neon-cyan' }),
    });

    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string; required: number; available: number };
    assert.equal(body.error, 'Insufficient coins');
    assert.equal(body.required, 100);
    assert.equal(body.available, 99);

    const profile = await db.collection<PlayerProfile>('profiles').findOne({ telegramUserId: userId });
    assert.ok(profile);
    assert.equal(profile.coins, 99);
    assert.deepEqual(profile.ownedItemIds, []);
  });

  it('rejects purchasing already-owned item and preserves balance', async () => {
    await seedCosmetics(db);
    await initCosmeticCache(db);

    const userId = 1004;
    await db.collection<PlayerProfile>('profiles').insertOne(
      createTestProfile(userId, {
        coins: 500,
        ownedItemIds: ['frame-neon-cyan'],
      }),
    );

    const token = createSessionToken(userId, sessionSecret);
    const res = await fetch(`${baseUrl}/api/shop/purchase`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ itemId: 'frame-neon-cyan' }),
    });

    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string };
    assert.equal(body.error, 'Already owned');

    const profile = await db.collection<PlayerProfile>('profiles').findOne({ telegramUserId: userId });
    assert.ok(profile);
    assert.equal(profile.coins, 500);
    assert.deepEqual(profile.ownedItemIds, ['frame-neon-cyan']);
  });

  it('rejects purchase for unknown cosmetic item', async () => {
    await seedCosmetics(db);
    await initCosmeticCache(db);

    const userId = 1005;
    await db.collection<PlayerProfile>('profiles').insertOne(
      createTestProfile(userId, {
        coins: 1000,
      }),
    );

    const token = createSessionToken(userId, sessionSecret);
    const res = await fetch(`${baseUrl}/api/shop/purchase`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ itemId: 'non_existent_item_id' }),
    });

    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string };
    assert.equal(body.error, 'Bad request');
  });

  it('handles race condition with concurrent purchases for same item with exact funds for 1', async () => {
    await seedCosmetics(db);
    await initCosmeticCache(db);

    const userId = 1006;
    const price = 100;
    await db.collection<PlayerProfile>('profiles').insertOne(
      createTestProfile(userId, {
        coins: price,
      }),
    );

    const token = createSessionToken(userId, sessionSecret);
    const sendPurchase = () =>
      fetch(`${baseUrl}/api/shop/purchase`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ itemId: 'frame-neon-cyan' }),
      });

    const [res1, res2] = await Promise.all([sendPurchase(), sendPurchase()]);
    const statuses = [res1.status, res2.status].sort();

    assert.deepEqual(statuses, [200, 400]);

    const profile = await db.collection<PlayerProfile>('profiles').findOne({ telegramUserId: userId });
    assert.ok(profile);
    assert.equal(profile.coins, 0);
    assert.deepEqual(profile.ownedItemIds, ['frame-neon-cyan']);
  });

  it('equips owned cosmetic item and replaces in category without affecting others', async () => {
    await seedCosmetics(db);
    await initCosmeticCache(db);

    const userId = 1007;
    await db.collection<PlayerProfile>('profiles').insertOne(
      createTestProfile(userId, {
        coins: 1000,
        ownedItemIds: [
          'frame-neon-cyan',
          'frame-amber-gold',
          'theme-midnight-ocean',
          'banner-aurora-borealis',
        ],
        equipped: {
          avatarFrame: 'frame-amber-gold',
          flagTheme: 'theme-midnight-ocean',
          profileBanner: 'banner-aurora-borealis',
        },
      }),
    );

    const token = createSessionToken(userId, sessionSecret);

    const equipRes = await fetch(`${baseUrl}/api/shop/equip`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ itemId: 'frame-neon-cyan' }),
    });

    assert.equal(equipRes.status, 200);
    const body = (await equipRes.json()) as {
      success: boolean;
      itemId: string;
      category: string;
      equipped: Record<string, string | null>;
    };
    assert.equal(body.success, true);
    assert.equal(body.itemId, 'frame-neon-cyan');
    assert.equal(body.category, 'avatarFrame');
    assert.equal(body.equipped.avatarFrame, 'frame-neon-cyan');
    assert.equal(body.equipped.flagTheme, 'theme-midnight-ocean');
    assert.equal(body.equipped.profileBanner, 'banner-aurora-borealis');

    const profile = await db.collection<PlayerProfile>('profiles').findOne({ telegramUserId: userId });
    assert.ok(profile);
    assert.equal(profile.equipped?.avatarFrame, 'frame-neon-cyan');
    assert.equal(profile.equipped?.flagTheme, 'theme-midnight-ocean');
    assert.equal(profile.equipped?.profileBanner, 'banner-aurora-borealis');
  });

  it('rejects equipping unowned cosmetic item', async () => {
    await seedCosmetics(db);
    await initCosmeticCache(db);

    const userId = 1008;
    await db.collection<PlayerProfile>('profiles').insertOne(
      createTestProfile(userId, {
        coins: 1000,
      }),
    );

    const token = createSessionToken(userId, sessionSecret);
    const res = await fetch(`${baseUrl}/api/shop/equip`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ itemId: 'frame-neon-cyan' }),
    });

    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string };
    assert.equal(body.error, 'Not owned');
  });
});
