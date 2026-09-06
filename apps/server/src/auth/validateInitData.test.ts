import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { validateInitData } from './validateInitData.js';
import {
  ExpiredInitDataError,
  InvalidSignatureError,
  MissingHashError,
  MissingInitDataError,
} from './types.js';

const TEST_BOT_TOKEN = '123456789:TEST_BOT_TOKEN_FOR_TESTS_123456789';

function createSignedInitData(
  fields: Record<string, string>,
  botToken: string = TEST_BOT_TOKEN,
): string {
  const keys = Object.keys(fields).sort((a, b) => a.localeCompare(b));
  const dataCheckString = keys.map((key) => `${key}=${fields[key]}`).join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  const params = new URLSearchParams(fields);
  params.set('hash', hash);
  return params.toString();
}

describe('validateInitData', () => {
  it('successfully validates a freshly generated valid initData string', () => {
    const now = Math.floor(Date.now() / 1000);
    const userJson = JSON.stringify({
      id: 987654321,
      first_name: 'Alex',
      last_name: 'Player',
      username: 'alex_flags',
    });

    const initData = createSignedInitData({
      auth_date: String(now),
      query_id: 'AAHdF6IQAAAAAN0XohD_test',
      user: userJson,
    });

    const result = validateInitData(initData, TEST_BOT_TOKEN, 900);

    assert.equal(result.user.id, 987654321);
    assert.equal(result.user.firstName, 'Alex');
    assert.equal(result.user.lastName, 'Player');
    assert.equal(result.user.username, 'alex_flags');
    assert.equal(result.queryId, 'AAHdF6IQAAAAAN0XohD_test');
    assert.equal(result.authDate.getTime(), now * 1000);
  });

  it('throws InvalidSignatureError when a single character in initData is tampered', () => {
    const now = Math.floor(Date.now() / 1000);
    const userJson = JSON.stringify({
      id: 987654321,
      first_name: 'Alex',
    });

    const initData = createSignedInitData({
      auth_date: String(now),
      user: userJson,
    });

    const tamperedInitData = initData.replace('Alex', 'Alec');

    assert.throws(
      () => {
        validateInitData(tamperedInitData, TEST_BOT_TOKEN, 900);
      },
      (error: unknown) => error instanceof InvalidSignatureError,
    );
  });

  it('throws ExpiredInitDataError when auth_date exceeds maxAgeSeconds', () => {
    const expiredTimestamp = Math.floor(Date.now() / 1000) - 1000;
    const userJson = JSON.stringify({
      id: 11223344,
      first_name: 'Sam',
    });

    const expiredInitData = createSignedInitData({
      auth_date: String(expiredTimestamp),
      user: userJson,
    });

    assert.throws(
      () => {
        validateInitData(expiredInitData, TEST_BOT_TOKEN, 900);
      },
      (error: unknown) => error instanceof ExpiredInitDataError,
    );
  });

  it('throws MissingHashError when hash is not present in initData', () => {
    const now = Math.floor(Date.now() / 1000);
    const params = new URLSearchParams({
      auth_date: String(now),
      user: JSON.stringify({ id: 1, first_name: 'Test' }),
    });

    assert.throws(
      () => {
        validateInitData(params.toString(), TEST_BOT_TOKEN, 900);
      },
      (error: unknown) => error instanceof MissingHashError,
    );
  });

  it('throws MissingInitDataError when initData is empty or whitespace', () => {
    assert.throws(
      () => {
        validateInitData('', TEST_BOT_TOKEN, 900);
      },
      (error: unknown) => error instanceof MissingInitDataError,
    );

    assert.throws(
      () => {
        validateInitData('   ', TEST_BOT_TOKEN, 900);
      },
      (error: unknown) => error instanceof MissingInitDataError,
    );
  });
});
