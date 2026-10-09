import type { Db } from 'mongodb';
import type { TelegramUser } from '../auth/types.js';
import { playerProfileSchema, type PlayerProfile } from './types.js';
import { hasActiveSubscription } from '../subscription/subscriptionService.js';

export async function findOrCreatePlayerProfile(
  telegramUser: TelegramUser,
  db: Db,
): Promise<PlayerProfile> {
  const collection = db.collection<PlayerProfile>('profiles');

  const existing = await collection.findOne({ telegramUserId: telegramUser.id });

  if (existing) {
    const isVerified = await hasActiveSubscription(telegramUser.id, db);
    const newUsername =
      telegramUser.username !== undefined ? telegramUser.username : existing.username;
    const newLastName =
      telegramUser.lastName !== undefined ? telegramUser.lastName : existing.lastName;
    const newPhotoUrl =
      telegramUser.photoUrl !== undefined ? telegramUser.photoUrl : existing.photoUrl;

    const hasChanged =
      existing.firstName !== telegramUser.firstName ||
      existing.lastName !== newLastName ||
      existing.username !== newUsername ||
      existing.photoUrl !== newPhotoUrl;

    if (hasChanged) {
      const updatedAt = new Date();
      await collection.updateOne(
        { telegramUserId: telegramUser.id },
        {
          $set: {
            firstName: telegramUser.firstName,
            lastName: newLastName,
            username: newUsername,
            photoUrl: newPhotoUrl,
            updatedAt,
          },
        },
      );

      return playerProfileSchema.parse({
        ...existing,
        firstName: telegramUser.firstName,
        lastName: newLastName,
        username: newUsername,
        photoUrl: newPhotoUrl,
        updatedAt,
        isVerified,
      });
    }

    return playerProfileSchema.parse({
      ...existing,
      isVerified,
    });
  }

  const now = new Date();
  const isVerified = await hasActiveSubscription(telegramUser.id, db);
  const newProfileData: PlayerProfile = {
    telegramUserId: telegramUser.id,
    username: telegramUser.username,
    firstName: telegramUser.firstName,
    lastName: telegramUser.lastName,
    photoUrl: telegramUser.photoUrl,
    pins: 0,
    xp: 0,
    level: 1,
    currentStreak: 0,
    longestStreak: 0,
    gamesPlayed: 0,
    bestScore: 0,
    lastPlayedDate: null,
    referredBy: null,
    referralCount: 0,
    battleRating: 0,
    currentSeason: null,
    tier4CorrectCount: 0,
    pinnedIsoCodes: [],
    isVerified,
    createdAt: now,
    updatedAt: now,
  };

  const validatedProfile = playerProfileSchema.parse(newProfileData);
  await collection.insertOne({ ...validatedProfile });
  return validatedProfile;
}

export async function getPlayerProfileByUserId(
  telegramUserId: number,
  db: Db,
): Promise<PlayerProfile | null> {
  const collection = db.collection<PlayerProfile>('profiles');
  const profile = await collection.findOne({ telegramUserId });
  if (!profile) {
    return null;
  }
  const isVerified = await hasActiveSubscription(telegramUserId, db);
  return playerProfileSchema.parse({
    ...profile,
    isVerified,
  });
}

export async function updatePinnedFlags(
  telegramUserId: number,
  pinnedIsoCodes: string[],
  db: Db,
): Promise<PlayerProfile> {
  const collection = db.collection<PlayerProfile>('profiles');
  const now = new Date();
  const result = await collection.findOneAndUpdate(
    { telegramUserId },
    {
      $set: {
        pinnedIsoCodes,
        updatedAt: now,
      },
    },
    { returnDocument: 'after' },
  );

  if (!result) {
    throw new Error('Profile not found');
  }

  const isVerified = await hasActiveSubscription(telegramUserId, db);
  return playerProfileSchema.parse({
    ...result,
    isVerified,
  });
}
