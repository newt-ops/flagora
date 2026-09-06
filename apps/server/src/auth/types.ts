import type { Request } from 'express';

export interface TelegramUser {
  id: number;
  firstName: string;
  lastName?: string;
  username?: string;
  languageCode?: string;
  isPremium?: boolean;
  photoUrl?: string;
}

export interface AuthenticatedRequest extends Request {
  telegramUser?: TelegramUser;
}

export interface ValidatedInitData {
  user: TelegramUser;
  authDate: Date;
  queryId?: string;
  hash: string;
}

export class InitDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class MissingInitDataError extends InitDataError {
  constructor(message = 'InitData string is missing') {
    super(message);
  }
}

export class MissingHashError extends InitDataError {
  constructor(message = 'Hash parameter is missing from initData') {
    super(message);
  }
}

export class InvalidSignatureError extends InitDataError {
  constructor(message = 'Signature verification failed') {
    super(message);
  }
}

export class ExpiredInitDataError extends InitDataError {
  constructor(message = 'InitData auth_date is expired') {
    super(message);
  }
}

export class InvalidUserDataError extends InitDataError {
  constructor(message = 'User payload in initData is invalid') {
    super(message);
  }
}
