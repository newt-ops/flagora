import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { MongoClient, type Db } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ensureIndexes } from '../db/mongo.js';
import {
  createGroupLobby,
  joinGroupLobby,
  leaveGroupLobby,
  cancelGroupLobby,
  startGroupBattle,
  finalizeGroupBattle,
  getGroupBattleInfo,
  GROUP_BATTLE_CONFIG,
} from './groupBattleService.js';
import {
  LobbyFullError,
  BattleAlreadyJoinedError,
  BattleAlreadyStartedError,
  BattleHostRequiredError,
  InsufficientPlayersError,
} from './battleTypes.js';
import type { BattleSession, PlayerProfile } from '@flagora/shared';
import type { GameRun } from '../game/runTypes.js';

describe('Group Multiplayer Battles (v2.1 Backend)', () => {
  let mongoServer: MongoMemoryServer;
  let mongoClient: MongoClient;
  let db: Db;

  before(async () => {
    mongoServer = await MongoMemoryServer.create();
    mongoClient = new MongoClient(mongoServer.getUri());
    await mongoClient.connect();
    db = mongoClient.db('flagora-test');
    await ensureIndexes(db);
  });

  after(async () => {
    await mongoClient.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await db.collection('battles').deleteMany({});
    await db.collection('runs').deleteMany({});
    await db.collection('profiles').deleteMany({});
  });

  describe('1. Lobby Creation & Player Limits', () => {
    it('creates a group battle lobby with default player limit (5)', async () => {
      const lobby = await createGroupLobby(
        {
          chatId: -100111,
          hostUserId: 100,
          hostDisplayName: 'HostPlayer',
          hostPhotoUrl: 'https://example.com/photo.jpg',
        },
        db,
      );

      assert.ok(lobby.battleId);
      assert.equal(lobby.chatId, -100111);
      assert.equal(lobby.isGroupBattle, true);
      assert.equal(lobby.maxPlayers, 5);
      assert.equal(lobby.hostUserId, 100);
      assert.equal(lobby.status, 'waiting');
      assert.equal(lobby.participants?.length, 1);
      assert.equal(lobby.participants?.[0]?.userId, 100);
      assert.equal(lobby.participants?.[0]?.ready, true);

      // Verify TTL is approximately 10 minutes from now
      const expiry = new Date(lobby.expiresAt).getTime();
      const diffMs = expiry - Date.now();
      assert.ok(diffMs > 9 * 60 * 1000 && diffMs <= 10 * 60 * 1000);
    });

    it('enforces backend clamping bounds (minimum 2, maximum 20)', async () => {
      // Clamps custom 1 up to minimum 2
      const lobbyMin = await createGroupLobby(
        {
          chatId: -100222,
          hostUserId: 101,
          hostDisplayName: 'MinHost',
          maxPlayers: 1,
        },
        db,
      );
      assert.equal(lobbyMin.maxPlayers, 2);

      // Clamps custom 100 down to maximum 20
      const lobbyMax = await createGroupLobby(
        {
          chatId: -100333,
          hostUserId: 102,
          hostDisplayName: 'MaxHost',
          maxPlayers: 100,
        },
        db,
      );
      assert.equal(lobbyMax.maxPlayers, 20);
    });

    it('returns existing active lobby if already waiting in the same chatId', async () => {
      const lobby1 = await createGroupLobby(
        {
          chatId: -100444,
          hostUserId: 103,
          hostDisplayName: 'FirstHost',
          maxPlayers: 5,
        },
        db,
      );

      const lobby2 = await createGroupLobby(
        {
          chatId: -100444,
          hostUserId: 104,
          hostDisplayName: 'SecondHost',
          maxPlayers: 10,
        },
        db,
      );

      assert.equal(lobby1.battleId, lobby2.battleId);
      assert.equal(lobby2.hostUserId, 103);
    });
  });

  describe('2. Race-Safe Atomic Joining', () => {
    it('successfully joins lobby and prevents duplicate joins', async () => {
      const lobby = await createGroupLobby(
        {
          chatId: -100555,
          hostUserId: 200,
          hostDisplayName: 'HostAlice',
          maxPlayers: 5,
        },
        db,
      );

      const updated = await joinGroupLobby(
        {
          battleId: lobby.battleId,
          userId: 201,
          telegramUserId: 201,
          displayName: 'PlayerBob',
        },
        db,
      );

      assert.equal(updated.participants?.length, 2);
      assert.equal(updated.participants?.[1]?.userId, 201);

      // Attempt duplicate join
      await assert.rejects(
        async () => {
          await joinGroupLobby(
            {
              battleId: lobby.battleId,
              userId: 201,
              telegramUserId: 201,
              displayName: 'PlayerBob',
            },
            db,
          );
        },
        (err: unknown) => err instanceof BattleAlreadyJoinedError,
      );
    });

    it('guarantees race safety: exactly 1 player is admitted when only 1 slot is left', async () => {
      // 2-player lobby: host is already in slot 1, exactly 1 slot left
      const lobby = await createGroupLobby(
        {
          chatId: -100666,
          hostUserId: 300,
          hostDisplayName: 'HostRacing',
          maxPlayers: 2,
        },
        db,
      );

      // 5 concurrent players race to join the 1 remaining slot at the exact same millisecond
      const candidates = [301, 302, 303, 304, 305];
      const results = await Promise.allSettled(
        candidates.map((userId) =>
          joinGroupLobby(
            {
              battleId: lobby.battleId,
              userId,
              telegramUserId: userId,
              displayName: `Racer_${userId}`,
            },
            db,
          ),
        ),
      );

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      // Exactly ONE player must be fulfilled, exactly FOUR rejected with LobbyFullError
      assert.equal(fulfilled.length, 1, 'Exactly one player must succeed');
      assert.equal(rejected.length, 4, 'Four players must be rejected');

      for (const rej of rejected) {
        if (rej.status === 'rejected') {
          assert.ok(
            rej.reason instanceof LobbyFullError,
            'Rejected reason must be LobbyFullError',
          );
        }
      }

      // Verify in MongoDB that participants count is strictly 2
      const finalDoc = await db.collection<BattleSession>('battles').findOne({ battleId: lobby.battleId });
      assert.equal(finalDoc?.participants?.length, 2, 'Lobby participants must strictly equal maxPlayers (2)');
    });
  });

  describe('3. Lobby Controls: Leaving & Host Transfers', () => {
    it('allows a non-host player to leave the lobby', async () => {
      const lobby = await createGroupLobby(
        {
          chatId: -100777,
          hostUserId: 400,
          hostDisplayName: 'Host',
          maxPlayers: 5,
        },
        db,
      );

      await joinGroupLobby(
        {
          battleId: lobby.battleId,
          userId: 401,
          telegramUserId: 401,
          displayName: 'PlayerToLeave',
        },
        db,
      );

      const afterLeave = await leaveGroupLobby(lobby.battleId, 401, db);
      assert.equal(afterLeave?.participants?.length, 1);
      assert.equal(afterLeave?.participants?.[0]?.userId, 400);
    });

    it('transfers host to the next player if host leaves and others remain', async () => {
      const lobby = await createGroupLobby(
        {
          chatId: -100888,
          hostUserId: 500,
          hostDisplayName: 'OriginalHost',
          maxPlayers: 5,
        },
        db,
      );

      await joinGroupLobby(
        {
          battleId: lobby.battleId,
          userId: 501,
          telegramUserId: 501,
          displayName: 'NewHostCandidate',
        },
        db,
      );

      const afterHostLeave = await leaveGroupLobby(lobby.battleId, 500, db);
      assert.equal(afterHostLeave?.hostUserId, 501);
      assert.equal(afterHostLeave?.participants?.length, 1);
      assert.equal(afterHostLeave?.participants?.[0]?.userId, 501);
    });

    it('cancels lobby if the host leaves when they are the only participant', async () => {
      const lobby = await createGroupLobby(
        {
          chatId: -100999,
          hostUserId: 600,
          hostDisplayName: 'SoleHost',
          maxPlayers: 5,
        },
        db,
      );

      const afterLeave = await leaveGroupLobby(lobby.battleId, 600, db);
      assert.equal(afterLeave?.status, 'expired');
    });

    it('allows host to explicitly cancel lobby', async () => {
      const lobby = await createGroupLobby(
        {
          chatId: -101000,
          hostUserId: 700,
          hostDisplayName: 'HostCancelling',
          maxPlayers: 5,
        },
        db,
      );

      // Non-host cannot cancel
      await assert.rejects(
        async () => {
          await cancelGroupLobby(lobby.battleId, 999, db);
        },
        (err: unknown) => err instanceof BattleHostRequiredError,
      );

      const cancelled = await cancelGroupLobby(lobby.battleId, 700, db);
      assert.equal(cancelled.status, 'expired');
    });
  });

  describe('4. Starting Group Battles & Flag Synchronization', () => {
    it('requires at least 2 players to start a battle', async () => {
      const lobby = await createGroupLobby(
        {
          chatId: -101111,
          hostUserId: 800,
          hostDisplayName: 'HostAlone',
          maxPlayers: 5,
        },
        db,
      );

      await assert.rejects(
        async () => {
          await startGroupBattle(lobby.battleId, 800, db);
        },
        (err: unknown) => err instanceof InsufficientPlayersError,
      );
    });

    it('starts battle atomically, generating identical flag seeds across participant runs', async () => {
      const lobby = await createGroupLobby(
        {
          chatId: -101222,
          hostUserId: 900,
          hostDisplayName: 'HostPlayer',
          maxPlayers: 5,
        },
        db,
      );

      await joinGroupLobby(
        {
          battleId: lobby.battleId,
          userId: 901,
          telegramUserId: 901,
          displayName: 'Player2',
        },
        db,
      );

      await joinGroupLobby(
        {
          battleId: lobby.battleId,
          userId: 902,
          telegramUserId: 902,
          displayName: 'Player3',
        },
        db,
      );

      const started = await startGroupBattle(lobby.battleId, 900, db);
      assert.equal(started.status, 'in_progress');
      assert.ok(started.startedAt);

      // Verify that individual GameRuns were created for each participant
      const runsCollection = db.collection<GameRun>('runs');
      const runs = await runsCollection
        .find({ telegramUserId: { $in: [900, 901, 902] } })
        .toArray();

      assert.equal(runs.length, 3);

      // Verify that ALL 3 participants received the exact same 10 flags in the exact same order!
      const flagsHost = runs.find((r) => r.telegramUserId === 900)!.flags.map((f) => f.isoCode);
      const flagsP2 = runs.find((r) => r.telegramUserId === 901)!.flags.map((f) => f.isoCode);
      const flagsP3 = runs.find((r) => r.telegramUserId === 902)!.flags.map((f) => f.isoCode);

      assert.equal(flagsHost.length, 10);
      assert.deepEqual(flagsHost, flagsP2);
      assert.deepEqual(flagsHost, flagsP3);
    });

    it('rejects join attempts after the battle has already started', async () => {
      const lobby = await createGroupLobby(
        {
          chatId: -101333,
          hostUserId: 1000,
          hostDisplayName: 'HostStarted',
          maxPlayers: 5,
        },
        db,
      );

      await joinGroupLobby(
        {
          battleId: lobby.battleId,
          userId: 1001,
          telegramUserId: 1001,
          displayName: 'PlayerEarly',
        },
        db,
      );

      await startGroupBattle(lobby.battleId, 1000, db);

      // Late arrival attempts to join
      await assert.rejects(
        async () => {
          await joinGroupLobby(
            {
              battleId: lobby.battleId,
              userId: 1002,
              telegramUserId: 1002,
              displayName: 'LatePlayer',
            },
            db,
          );
        },
        (err: unknown) => err instanceof BattleAlreadyStartedError,
      );
    });
  });

  describe('5. Idempotent Battle Finalization & Podium Calculation', () => {
    it('calculates podium accurately and credits pin rewards idempotently', async () => {
      const lobby = await createGroupLobby(
        {
          chatId: -101444,
          hostUserId: 1100,
          hostDisplayName: 'HostWinner',
          maxPlayers: 5,
        },
        db,
      );

      await joinGroupLobby(
        {
          battleId: lobby.battleId,
          userId: 1101,
          telegramUserId: 1101,
          displayName: 'SilverPlayer',
        },
        db,
      );

      await joinGroupLobby(
        {
          battleId: lobby.battleId,
          userId: 1102,
          telegramUserId: 1102,
          displayName: 'BronzePlayer',
        },
        db,
      );

      // Create profiles to receive pin credits
      const profilesCol = db.collection<PlayerProfile>('profiles');
      await profilesCol.insertMany([
        { telegramUserId: 1100, username: 'host', firstName: 'Host', level: 1, xp: 0, pins: 100, bestScore: 0, currentStreak: 1, longestStreak: 1, lastPlayedDate: '2026-10-10', gamesPlayed: 0, createdAt: new Date(), updatedAt: new Date() },
        { telegramUserId: 1101, username: 'silver', firstName: 'Silver', level: 1, xp: 0, pins: 50, bestScore: 0, currentStreak: 1, longestStreak: 1, lastPlayedDate: '2026-10-10', gamesPlayed: 0, createdAt: new Date(), updatedAt: new Date() },
        { telegramUserId: 1102, username: 'bronze', firstName: 'Bronze', level: 1, xp: 0, pins: 20, bestScore: 0, currentStreak: 1, longestStreak: 1, lastPlayedDate: '2026-10-10', gamesPlayed: 0, createdAt: new Date(), updatedAt: new Date() },
      ]);

      const started = await startGroupBattle(lobby.battleId, 1100, db);
      const runsCol = db.collection<GameRun>('runs');

      // Mock completion scores:
      // Host: 1,200 pts
      // Silver: 950 pts
      // Bronze: 800 pts
      const hostRunId = started.participants?.find((p) => p.userId === 1100)!.runId!;
      const silverRunId = started.participants?.find((p) => p.userId === 1101)!.runId!;
      const bronzeRunId = started.participants?.find((p) => p.userId === 1102)!.runId!;

      await runsCol.updateOne({ runId: hostRunId }, { $set: { runningTotal: 1200, status: 'finished' } });
      await runsCol.updateOne({ runId: silverRunId }, { $set: { runningTotal: 950, status: 'finished' } });
      await runsCol.updateOne({ runId: bronzeRunId }, { $set: { runningTotal: 800, status: 'finished' } });

      // Run finalization concurrently to test idempotency
      const [final1, final2] = await Promise.all([
        finalizeGroupBattle(lobby.battleId, db),
        finalizeGroupBattle(lobby.battleId, db),
      ]);

      assert.equal(final1?.status, 'completed');
      assert.equal(final2?.status, 'completed');

      // Verify podium rankings
      const podium = final1?.podium ?? [];
      assert.equal(podium.length, 3);
      assert.equal(podium[0].rank, 1);
      assert.equal(podium[0].userId, 1100);
      assert.equal(podium[0].score, 1200);
      assert.equal(podium[0].pinsEarned, 150);

      assert.equal(podium[1].rank, 2);
      assert.equal(podium[1].userId, 1101);
      assert.equal(podium[1].score, 950);
      assert.equal(podium[1].pinsEarned, 75);

      assert.equal(podium[2].rank, 3);
      assert.equal(podium[2].userId, 1102);
      assert.equal(podium[2].score, 800);
      assert.equal(podium[2].pinsEarned, 40);

      // Verify profiles received pins EXACTLY ONCE (no double crediting)
      const hostProf = await profilesCol.findOne({ telegramUserId: 1100 });
      const silverProf = await profilesCol.findOne({ telegramUserId: 1101 });
      const bronzeProf = await profilesCol.findOne({ telegramUserId: 1102 });

      assert.equal(hostProf?.pins, 100 + 150, 'Host must receive exactly 150 pins');
      assert.equal(silverProf?.pins, 50 + 75, 'Silver must receive exactly 75 pins');
      assert.equal(bronzeProf?.pins, 20 + 40, 'Bronze must receive exactly 40 pins');
    });
  });

  describe('6. Multi-Group Isolation', () => {
    it('runs battles in two different groups without interference', async () => {
      const lobbyA = await createGroupLobby(
        {
          chatId: -102001,
          hostUserId: 1201,
          hostDisplayName: 'HostGroupA',
          maxPlayers: 5,
        },
        db,
      );

      const lobbyB = await createGroupLobby(
        {
          chatId: -102002,
          hostUserId: 1202,
          hostDisplayName: 'HostGroupB',
          maxPlayers: 5,
        },
        db,
      );

      assert.notEqual(lobbyA.battleId, lobbyB.battleId);

      // Join player to Group A
      await joinGroupLobby(
        {
          battleId: lobbyA.battleId,
          userId: 1203,
          telegramUserId: 1203,
          displayName: 'PlayerA2',
        },
        db,
      );

      // Check Group B is unaffected
      const infoB = await getGroupBattleInfo(lobbyB.battleId, 1202, db);
      assert.equal(infoB.participants?.length, 1);
      assert.equal(infoB.hostUserId, 1202);

      const infoA = await getGroupBattleInfo(lobbyA.battleId, 1201, db);
      assert.equal(infoA.participants?.length, 2);
    });
  });
});
