import crypto from 'node:crypto';
import { z } from 'zod';
import {
  ExpiredInitDataError,
  InvalidSignatureError,
  InvalidUserDataError,
  MissingHashError,
  MissingInitDataError,
  type TelegramUser,
  type ValidatedInitData,
} from './types.js';

const telegramUserSchema = z.object({
  id: z.number(),
  first_name: z.string(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  language_code: z.string().optional(),
  is_premium: z.boolean().optional(),
  photo_url: z.string().optional(),
});

export function validateInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds = 900,
): ValidatedInitData {
  if (!initData || typeof initData !== 'string' || initData.trim() === '') {
    throw new MissingInitDataError();
  }

  const params = new URLSearchParams(initData);
  const receivedHash = params.get('hash');

  if (!receivedHash) {
    throw new MissingHashError();
  }

  params.delete('hash');

  const keys = Array.from(params.keys()).sort((a, b) => a.localeCompare(b));
  const dataCheckString = keys.map((key) => `${key}=${params.get(key)}`).join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calculatedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  const calculatedBuffer = Buffer.from(calculatedHash, 'hex');
  const receivedBuffer = Buffer.from(receivedHash, 'hex');

  if (
    calculatedBuffer.length === 0 ||
    receivedBuffer.length === 0 ||
    calculatedBuffer.length !== receivedBuffer.length ||
    !crypto.timingSafeEqual(calculatedBuffer, receivedBuffer)
  ) {
    throw new InvalidSignatureError();
  }

  const authDateRaw = params.get('auth_date');
  if (!authDateRaw) {
    throw new ExpiredInitDataError('auth_date parameter is missing');
  }

  const authTimestamp = Number.parseInt(authDateRaw, 10);
  if (Number.isNaN(authTimestamp)) {
    throw new ExpiredInitDataError('auth_date is invalid');
  }

  const now = Math.floor(Date.now() / 1000);
  if (now - authTimestamp > maxAgeSeconds) {
    throw new ExpiredInitDataError();
  }

  if (authTimestamp > now + 300) {
    throw new ExpiredInitDataError('auth_date is in the future');
  }

  const userRaw = params.get('user');
  if (!userRaw) {
    throw new InvalidUserDataError('user parameter is missing');
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(userRaw);
  } catch {
    throw new InvalidUserDataError('user parameter is not valid JSON');
  }

  const result = telegramUserSchema.safeParse(parsedJson);
  if (!result.success) {
    throw new InvalidUserDataError(result.error.message);
  }

  const user: TelegramUser = {
    id: result.data.id,
    firstName: result.data.first_name,
    lastName: result.data.last_name,
    username: result.data.username,
    languageCode: result.data.language_code,
    isPremium: result.data.is_premium,
    photoUrl: result.data.photo_url,
  };

  return {
    user,
    authDate: new Date(authTimestamp * 1000),
    queryId: params.get('query_id') ?? undefined,
    hash: receivedHash,
  };
}
