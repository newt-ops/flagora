import jwt, { type SignOptions } from 'jsonwebtoken';

export class SessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class MissingSessionTokenError extends SessionError {
  constructor(message = 'Session token is missing') {
    super(message);
  }
}

export class InvalidSessionTokenError extends SessionError {
  constructor(message = 'Session token is invalid') {
    super(message);
  }
}

export class ExpiredSessionTokenError extends SessionError {
  constructor(message = 'Session token is expired') {
    super(message);
  }
}

export interface SessionPayload {
  telegramUserId: number;
}

export function createSessionToken(
  telegramUserId: number,
  secret: string,
  expiresIn: SignOptions['expiresIn'] = '24h',
): string {
  return jwt.sign({ telegramUserId }, secret, {
    expiresIn,
    algorithm: 'HS256',
  });
}

export function verifySessionToken(token: string, secret: string): SessionPayload {
  if (!token || typeof token !== 'string' || token.trim() === '') {
    throw new MissingSessionTokenError();
  }

  try {
    const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
    if (
      typeof decoded !== 'object' ||
      decoded === null ||
      typeof (decoded as { telegramUserId?: unknown }).telegramUserId !== 'number'
    ) {
      throw new InvalidSessionTokenError('Token payload does not contain telegramUserId');
    }

    return { telegramUserId: (decoded as { telegramUserId: number }).telegramUserId };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new ExpiredSessionTokenError();
    }
    if (error instanceof SessionError) {
      throw error;
    }
    throw new InvalidSessionTokenError();
  }
}
