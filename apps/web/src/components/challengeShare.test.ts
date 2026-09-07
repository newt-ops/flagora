import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatChallengeShareText,
  getTelegramShareUrl,
  shareChallenge,
} from './challengeShareHelpers.js';
import {
  shouldShowPlayAgain,
  shouldShowDailyLeaderboardButton,
} from './dailyChallengeHelpers.js';

describe('challenge share helpers', () => {
  describe('formatChallengeShareText', () => {
    it('formats score with thousand separators', () => {
      assert.equal(
        formatChallengeShareText(1024),
        'Beat my score: 1,024 points in Flagora!',
      );
      assert.equal(
        formatChallengeShareText(12500),
        'Beat my score: 12,500 points in Flagora!',
      );
    });

    it('handles zero score', () => {
      assert.equal(
        formatChallengeShareText(0),
        'Beat my score: 0 points in Flagora!',
      );
    });
  });

  describe('getTelegramShareUrl', () => {
    it('encodes deep link and text parameters properly', () => {
      const deepLink = 'https://t.me/FlagoraBot?startapp=ch_123';
      const text = 'Beat my score: 1,024 points in Flagora!';
      const shareUrl = getTelegramShareUrl(deepLink, text);

      assert.ok(shareUrl.startsWith('https://t.me/share/url?'));
      const url = new URL(shareUrl);
      assert.equal(url.searchParams.get('url'), deepLink);
      assert.equal(url.searchParams.get('text'), text);
    });
  });

  describe('shareChallenge integration', () => {
    it('calls openTelegramLink when WebApp API is present', () => {
      let openedUrl = '';
      const originalWindow = globalThis.window;
      (globalThis as unknown as { window: unknown }).window = {
        Telegram: {
          WebApp: {
            openTelegramLink: (url: string) => {
              openedUrl = url;
            },
          },
        },
      };

      try {
        shareChallenge('ch_abc456', 950, 'FlagoraBot');
        assert.ok(openedUrl.includes('ch_abc456'));
        assert.ok(openedUrl.includes('950'));
      } finally {
        (globalThis as unknown as { window: unknown }).window = originalWindow;
      }
    });

    it('falls back to window.open when openTelegramLink is missing', () => {
      let openedUrl = '';
      let openedTarget = '';
      const originalWindow = globalThis.window;
      (globalThis as unknown as { window: unknown }).window = {
        open: (url: string, target?: string) => {
          openedUrl = url;
          openedTarget = target ?? '';
          return null;
        },
      };

      try {
        shareChallenge('ch_fallback', 500, 'FlagoraBot');
        assert.ok(openedUrl.includes('ch_fallback'));
        assert.equal(openedTarget, '_blank');
      } finally {
        (globalThis as unknown as { window: unknown }).window = originalWindow;
      }
    });
  });

  describe('mode handling for challenge run', () => {
    it('returns false for shouldShowPlayAgain in challenge mode', () => {
      assert.equal(shouldShowPlayAgain('challenge'), false);
    });

    it('returns false for shouldShowDailyLeaderboardButton in challenge mode', () => {
      assert.equal(shouldShowDailyLeaderboardButton('challenge'), false);
    });
  });
});
