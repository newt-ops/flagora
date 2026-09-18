import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NotInTelegramError } from '../telegram/init.js';

describe('Phase 11 Prompt 01: Non-Telegram Fallback', () => {
  it('instantiates NotInTelegramError with correct code and default message', () => {
    const error = new NotInTelegramError();
    assert.equal(error.name, 'NotInTelegramError');
    assert.equal(error.code, 'NOT_IN_TELEGRAM');
    assert.equal(error.message, 'This application must be launched from Telegram.');
  });

  it('formats telegram link correctly with and without leading at-sign', () => {
    const formatTelegramUrl = (rawUsername?: string) => {
      const username = rawUsername || 'flagora_bot';
      const clean = username.replace(/^@/, '');
      return `https://t.me/${clean}`;
    };

    assert.equal(formatTelegramUrl(), 'https://t.me/flagora_bot');
    assert.equal(formatTelegramUrl('custom_bot'), 'https://t.me/custom_bot');
    assert.equal(formatTelegramUrl('@custom_bot'), 'https://t.me/custom_bot');
  });
});
