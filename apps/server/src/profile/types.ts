import { z } from 'zod';

export const playerProfileSchema = z.object({
  telegramUserId: z.number(),
  username: z.string().nullable().optional(),
  firstName: z.string(),
  lastName: z.string().nullable().optional(),
  photoUrl: z.string().nullable().optional(),
  coins: z.number().int().default(0),
  xp: z.number().int().default(0),
  level: z.number().int().default(1),
  currentStreak: z.number().int().default(0),
  longestStreak: z.number().int().default(0),
  gamesPlayed: z.number().int().default(0),
  bestScore: z.number().int().default(0),
  lastPlayedDate: z.string().nullable().default(null),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type PlayerProfile = z.infer<typeof playerProfileSchema>;
