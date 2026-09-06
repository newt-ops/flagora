import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getDisplayName } from './ProfileCard.js';

describe('getDisplayName', () => {
  it('returns @username when username is present', () => {
    const name = getDisplayName({
      firstName: 'Elena',
      lastName: 'Kuznetsova',
      username: 'elena_flag',
    });
    assert.equal(name, '@elena_flag');
  });

  it('handles username with leading @ gracefully', () => {
    const name = getDisplayName({
      firstName: 'Elena',
      username: '@elena_flag',
    });
    assert.equal(name, '@elena_flag');
  });

  it('falls back to first name and last initial when no username exists', () => {
    const name = getDisplayName({
      firstName: 'Elena',
      lastName: 'Kuznetsova',
      username: null,
    });
    assert.equal(name, 'Elena K.');
  });

  it('falls back to first name only when neither username nor last name exists', () => {
    const name = getDisplayName({
      firstName: 'Elena',
      lastName: null,
      username: null,
    });
    assert.equal(name, 'Elena');
  });
});
