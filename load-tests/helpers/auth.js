import encoding from 'k6/encoding';
import crypto from 'k6/crypto';
import { SESSION_SECRET } from './config.js';

export function createSessionToken(telegramUserId, secret = SESSION_SECRET) {
  const header = encoding.b64encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }), 'rawurl');
  const payload = encoding.b64encode(
    JSON.stringify({
      telegramUserId,
      exp: Math.floor(Date.now() / 1000) + 86400,
    }),
    'rawurl',
  );
  const signature = crypto.hmac('sha256', secret, `${header}.${payload}`, 'base64rawurl');
  return `${header}.${payload}.${signature}`;
}

export function getVirtualUserToken(vuNumber, secret = SESSION_SECRET) {
  const userId = 100000 + (vuNumber || 1);
  return {
    userId,
    token: createSessionToken(userId, secret),
  };
}
