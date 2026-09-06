import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createSessionToken,
  verifySessionToken,
  ExpiredSessionTokenError,
  InvalidSessionTokenError,
  MissingSessionTokenError,
} from './tokens.js';

const TEST_SECRET = 'test_secret_for_session_token_validation_12345';

describe('session tokens', () => {
  it('creates and verifies a valid session token', () => {
    const telegramUserId = 12345678;
    const token = createSessionToken(telegramUserId, TEST_SECRET, '1h');
    const result = verifySessionToken(token, TEST_SECRET);

    assert.equal(result.telegramUserId, telegramUserId);
  });

  it('throws ExpiredSessionTokenError for an expired token', () => {
    const telegramUserId = 12345678;
    const expiredToken = createSessionToken(telegramUserId, TEST_SECRET, '-1s');

    assert.throws(
      () => {
        verifySessionToken(expiredToken, TEST_SECRET);
      },
      (error: unknown) => error instanceof ExpiredSessionTokenError,
    );
  });

  it('throws InvalidSessionTokenError for a tampered token', () => {
    const telegramUserId = 12345678;
    const token = createSessionToken(telegramUserId, TEST_SECRET, '1h');
    const tamperedToken = `${token.slice(0, -4)}abcd`;

    assert.throws(
      () => {
        verifySessionToken(tamperedToken, TEST_SECRET);
      },
      (error: unknown) => error instanceof InvalidSessionTokenError,
    );
  });

  it('throws InvalidSessionTokenError when verified with wrong secret', () => {
    const telegramUserId = 12345678;
    const token = createSessionToken(telegramUserId, TEST_SECRET, '1h');

    assert.throws(
      () => {
        verifySessionToken(token, 'different_wrong_secret_12345');
      },
      (error: unknown) => error instanceof InvalidSessionTokenError,
    );
  });

  it('throws MissingSessionTokenError for empty or whitespace token', () => {
    assert.throws(
      () => {
        verifySessionToken('', TEST_SECRET);
      },
      (error: unknown) => error instanceof MissingSessionTokenError,
    );

    assert.throws(
      () => {
        verifySessionToken('   ', TEST_SECRET);
      },
      (error: unknown) => error instanceof MissingSessionTokenError,
    );
  });
});
