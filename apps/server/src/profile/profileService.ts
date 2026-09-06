import type { Db } from 'mongodb';
import type { TelegramUser } from '../auth/types.js';
import { playerProfileSchema, type PlayerProfile } from './types.js';

export async function findOrCreatePlayerProfile(
  telegramUser: TelegramUser,
  db: Db,
): Promise<PlayerProfile> {
  const collection = db.collection<PlayerProfile>('profiles');

  const existing = await collection.findOne({ telegramUserId: telegramUser.id });

  if (existing) {
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
      });
    }

    return playerProfileSchema.parse(existing);
  }

  const now = new Date();
  const newProfileData: PlayerProfile = {
    telegramUserId: telegramUser.id,
    username: telegramUser.username,
    firstName: telegramUser.firstName,
    lastName: telegramUser.lastName,
    photoUrl: telegramUser.photoUrl,
    coins: 0,
    xp: 0,
    level: 1,
    currentStreak: 0,
    longestStreak: 0,
    gamesPlayed: 0,
    bestScore: 0,
    lastPlayedDate: null,
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
  return playerProfileSchema.parse(profile);
}
