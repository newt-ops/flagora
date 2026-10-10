import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getBattleStartParam,
  formatBattleShareText,
  getTelegramBattleShareUrl,
  shareBattle,
  getBattleViewerPerspective,
  getBattlePerspectiveHeading,
  getInitials,
} from './battleHelpers.js';

describe('battleHelpers', () => {
  describe('getBattleStartParam', () => {
    it('parses direct battle search parameter', () => {
      assert.equal(getBattleStartParam('?battle=battle-123'), 'battle-123');
      assert.equal(getBattleStartParam('?battle=battle_battle-123'), 'battle-123');
    });

    it('parses startapp parameter prefixed with battle_', () => {
      assert.equal(getBattleStartParam('?startapp=battle_abc-xyz'), 'abc-xyz');
    });

    it('parses tgWebAppStartParam prefixed with battle_', () => {
      assert.equal(getBattleStartParam('?tgWebAppStartParam=battle_test-456'), 'test-456');
    });

    it('parses start_param prefixed with battle_', () => {
      assert.equal(getBattleStartParam('?start_param=battle_def-789'), 'def-789');
    });

    it('returns null for non-battle start parameters', () => {
      assert.equal(getBattleStartParam('?startapp=regular_challenge_123'), null);
      assert.equal(getBattleStartParam('?startapp=ch_456'), null);
      assert.equal(getBattleStartParam(''), null);
    });

    it('parses battle param from hash string', () => {
      assert.equal(getBattleStartParam('', '#startapp=battle_hash-123'), 'hash-123');
      assert.equal(getBattleStartParam('', '#battle=direct-hash'), 'direct-hash');
    });

    it('parses battle param from tgWebAppData in hash', () => {
      const tgWebAppData = encodeURIComponent('start_param=battle_data-456&user=1');
      assert.equal(getBattleStartParam('', `#tgWebAppData=${tgWebAppData}`), 'data-456');
    });

    it('parses battle param from raw initData', () => {
      assert.equal(getBattleStartParam('', '', 'start_param=battle_init-789&auth_date=123'), 'init-789');
    });

    it('returns null for empty or non-matching initData', () => {
      assert.equal(getBattleStartParam('', '', 'start_param=challenge-999'), null);
      assert.equal(getBattleStartParam('', '', ''), null);
    });
  });

  describe('formatBattleShareText', () => {
    it('returns inviting battle message', () => {
      const text = formatBattleShareText();
      assert.ok(text.includes('Battle me live'));
      assert.ok(text.includes('Flagora'));
    });
  });

  describe('getTelegramBattleShareUrl', () => {
    it('encodes deep link and text parameters properly', () => {
      const deepLink = 'https://t.me/FlagoraBot?startapp=battle_abc';
      const text = 'Battle me live!';
      const shareUrl = getTelegramBattleShareUrl(deepLink, text);

      assert.ok(shareUrl.startsWith('https://t.me/share/url?'));
      const url = new URL(shareUrl);
      assert.equal(url.searchParams.get('url'), deepLink);
      assert.equal(url.searchParams.get('text'), text);
    });
  });

  describe('shareBattle', () => {
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
        shareBattle('b-123', 'FlagoraBot');
        assert.ok(openedUrl.includes('battle_b-123'));
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
        shareBattle('b-456', 'FlagoraBot');
        assert.ok(openedUrl.includes('battle_b-456'));
        assert.equal(openedTarget, '_blank');
      } finally {
        (globalThis as unknown as { window: unknown }).window = originalWindow;
      }
    });
  });

  describe('getBattleViewerPerspective', () => {
    it('returns spectator if winner is not defined', () => {
      assert.equal(
        getBattleViewerPerspective(
          {
            winner: null,
            challengerUserId: 100,
            opponentUserId: 200,
          },
          100,
        ),
        'spectator',
      );
    });

    it('returns won when challenger views challenger victory', () => {
      assert.equal(
        getBattleViewerPerspective(
          {
            winner: 'challenger',
            challengerUserId: 100,
            opponentUserId: 200,
          },
          100,
        ),
        'won',
      );
    });

    it('returns lost when challenger views opponent victory', () => {
      assert.equal(
        getBattleViewerPerspective(
          {
            winner: 'opponent',
            challengerUserId: 100,
            opponentUserId: 200,
          },
          100,
        ),
        'lost',
      );
    });

    it('returns won when opponent views opponent victory', () => {
      assert.equal(
        getBattleViewerPerspective(
          {
            winner: 'opponent',
            challengerUserId: 100,
            opponentUserId: 200,
          },
          200,
        ),
        'won',
      );
    });

    it('returns lost when opponent views challenger victory', () => {
      assert.equal(
        getBattleViewerPerspective(
          {
            winner: 'challenger',
            challengerUserId: 100,
            opponentUserId: 200,
          },
          200,
        ),
        'lost',
      );
    });

    it('returns tie when participants view a tie', () => {
      assert.equal(
        getBattleViewerPerspective(
          {
            winner: 'tie',
            challengerUserId: 100,
            opponentUserId: 200,
          },
          100,
        ),
        'tie',
      );
      assert.equal(
        getBattleViewerPerspective(
          {
            winner: 'tie',
            challengerUserId: 100,
            opponentUserId: 200,
          },
          200,
        ),
        'tie',
      );
    });

    it('returns spectator when third-party views battle', () => {
      assert.equal(
        getBattleViewerPerspective(
          {
            winner: 'challenger',
            challengerUserId: 100,
            opponentUserId: 200,
          },
          999,
        ),
        'spectator',
      );
    });
  });

  describe('getBattlePerspectiveHeading', () => {
    it('returns correct heading for victory', () => {
      const heading = getBattlePerspectiveHeading('won');
      assert.equal(heading.title, 'Victory!');
      assert.ok(heading.badgeClass.includes('tg-button'));
    });

    it('returns correct heading for defeat', () => {
      const heading = getBattlePerspectiveHeading('lost');
      assert.equal(heading.title, 'Defeat!');
      assert.ok(heading.badgeClass.includes('tg-destructive'));
    });

    it('returns correct heading for tie', () => {
      const heading = getBattlePerspectiveHeading('tie');
      assert.equal(heading.title, "It's a Tie!");
      assert.ok(heading.badgeClass.includes('tg-button'));
    });

    it('returns correct heading for spectator', () => {
      const heading = getBattlePerspectiveHeading('spectator', 'Alice');
      assert.equal(heading.title, 'Alice Won!');
      assert.ok(heading.badgeClass.includes('tg-button'));
    });
  });

  describe('getInitials', () => {
    it('returns uppercase initial of name', () => {
      assert.equal(getInitials('John'), 'J');
      assert.equal(getInitials('@mary'), 'M');
      assert.equal(getInitials(''), 'P');
      assert.equal(getInitials(null), 'P');
    });
  });

  describe('Group Battle Helpers', () => {
    it('formats group victory share text with medals and scores', async () => {
      const { formatGroupVictoryShareText } = await import('./battleHelpers.js');
      const text = formatGroupVictoryShareText(
        [
          { rank: 1, displayName: 'Alice', score: 1200, pinsEarned: 150 },
          { rank: 2, displayName: 'Bob', score: 950, pinsEarned: 75 },
          { rank: 3, displayName: 'Charlie', score: 700, pinsEarned: 40 },
        ],
        'Alice',
      );

      assert.ok(text.includes('FLAGORA GROUP BATTLE RESULTS!'));
      assert.ok(text.includes('🥇 Alice (You) — 1200 pts'));
      assert.ok(text.includes('🥈 Bob — 950 pts'));
      assert.ok(text.includes('🥉 Charlie — 700 pts'));
    });

    it('returns correct rank badges for podium and runners up', async () => {
      const { getRankBadge } = await import('./battleHelpers.js');
      const rank1 = getRankBadge(1);
      assert.equal(rank1.medal, '🥇');
      assert.equal(rank1.label, '1st Place');
      assert.equal(rank1.stepHeightClass, 'h-36');

      const rank2 = getRankBadge(2);
      assert.equal(rank2.medal, '🥈');
      assert.equal(rank2.stepHeightClass, 'h-28');

      const rank3 = getRankBadge(3);
      assert.equal(rank3.medal, '🥉');
      assert.equal(rank3.stepHeightClass, 'h-20');

      const rank4 = getRankBadge(4);
      assert.equal(rank4.medal, '#4');
    });
  });
});

