import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BadgeShowcase } from './BadgeShowcase.js';
import { ResultsScreen } from './ResultsScreen.js';
import { BattleResultScreen } from './BattleResultScreen.js';
import { ProfileCard } from './ProfileCard.js';
import { isTier4Flag, type PlayerBadgeResponseItem, type PlayerProfile, type FinishRunResponse } from '@flagora/shared';

describe('Badge UI and Unlock Moments', () => {
  const dummyProfile: PlayerProfile = {
    telegramUserId: 9999,
    firstName: 'Alex',
    lastName: null,
    username: 'alex_flags',
    coins: 500,
    xp: 250,
    level: 3,
    currentStreak: 5,
    longestStreak: 12,
    gamesPlayed: 18,
    bestScore: 920,
    lastPlayedDate: '2026-09-16',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const dummyFinishResult: FinishRunResponse = {
    correctCount: 10,
    timeUsedMs: 25000,
    maxCombo: 10,
    leftoverBonus: 35,
    totalScore: 1250,
    xpEarned: 100,
    coinsEarned: 50,
    newXp: 350,
    newCoins: 550,
    newLevel: 3,
    leveledUp: false,
    bestScore: 1250,
    isNewBest: true,
    currentStreak: 6,
    longestStreak: 12,
    streakChange: 'incremented',
  };

  describe('BadgeShowcase', () => {
    it('renders all badges in locked state when player has no earned badges', () => {
      const html = renderToStaticMarkup(
        React.createElement(BadgeShowcase, { badges: [], isLoading: false }),
      );

      assert.ok(html.includes('data-testid="badge-showcase"'));
      assert.ok(html.includes('0 / 6 Unlocked'));
      assert.ok(html.includes('data-testid="badge-item-flawless_run"'));
      assert.ok(html.includes('data-testid="badge-item-speed_demon"'));
      assert.ok(html.includes('data-testid="badge-item-tier_4_specialist"'));
      assert.ok(html.includes('data-testid="badge-item-week_warrior"'));
      assert.ok(html.includes('data-testid="badge-item-month_warrior"'));
      assert.ok(html.includes('data-testid="badge-item-season_top_100"'));
      assert.ok(html.includes('Score 10/10 correct'));
      assert.ok(html.includes('Locked'));
    });

    it('renders earned badge with date and accurate count', () => {
      const badges: PlayerBadgeResponseItem[] = [
        {
          badgeId: 'flawless_run',
          name: 'Flawless Run',
          description: 'Score 10/10 correct in any practice, daily, challenge, or battle run.',
          earnedAt: '2026-09-16T12:00:00.000Z',
          season: null,
        },
      ];

      const html = renderToStaticMarkup(
        React.createElement(BadgeShowcase, { badges, isLoading: false }),
      );

      assert.ok(html.includes('1 / 6 Unlocked'));
      assert.ok(html.includes('Earned'));
      assert.ok(html.includes('Sep 16, 2026'));
    });

    it('renders season-scoped badges with formatted season tag', () => {
      const badges: PlayerBadgeResponseItem[] = [
        {
          badgeId: 'season_top_100',
          name: 'Season Top 100',
          description: 'Finish a ranked season in the Top 100 players.',
          earnedAt: '2026-09-30T23:59:59.000Z',
          season: '2026-09',
        },
      ];

      const html = renderToStaticMarkup(
        React.createElement(BadgeShowcase, { badges, isLoading: false }),
      );

      assert.ok(html.includes('September 2026'));
    });
  });

  describe('ResultsScreen badge unlock notification', () => {
    it('renders badge unlock banner when newBadges are present in run result', () => {
      const resultWithBadges: FinishRunResponse = {
        ...dummyFinishResult,
        newBadges: [
          {
            badgeId: 'flawless_run',
            name: 'Flawless Run',
            description: 'Score 10/10 correct',
            earnedAt: '2026-09-16T12:00:00.000Z',
            season: null,
          },
        ],
      };

      const html = renderToStaticMarkup(
        React.createElement(ResultsScreen, {
          result: resultWithBadges,
          mode: 'practice',
          onBackToProfile: () => {},
        }),
      );

      assert.ok(html.includes('data-testid="badge-unlock-banner"'));
      assert.ok(html.includes('Badge Unlocked: Flawless Run!'));
    });

    it('does not render badge unlock banner when newBadges is undefined or empty', () => {
      const html = renderToStaticMarkup(
        React.createElement(ResultsScreen, {
          result: dummyFinishResult,
          mode: 'practice',
          onBackToProfile: () => {},
        }),
      );

      assert.equal(html.includes('data-testid="badge-unlock-banner"'), false);
    });
  });

  describe('BattleResultScreen badge unlock notification', () => {
    it('renders battle badge unlock banner when viewer result has newBadges', () => {
      const html = renderToStaticMarkup(
        React.createElement(BattleResultScreen, {
          battleId: 'battle-123',
          finishedPayload: {
            battleId: 'battle-123',
            winner: 'challenger',
            challengerScore: 1000,
            opponentScore: 800,
            completedAt: new Date().toISOString(),
            challengerResult: {
              userId: 9999,
              displayName: 'Alex',
              score: 1000,
              correctCount: 10,
              totalFlags: 10,
              ratingDelta: 20,
              newRating: 620,
              tier: 'Gold',
              newBadges: [
                {
                  badgeId: 'speed_demon',
                  name: 'Speed Demon',
                  description: 'Finish with 20s remaining',
                  earnedAt: new Date().toISOString(),
                  season: null,
                },
              ],
            },
            opponentResult: {
              userId: 8888,
              displayName: 'Opponent',
              score: 800,
              correctCount: 8,
              totalFlags: 10,
              ratingDelta: -15,
              newRating: 400,
              tier: 'Silver',
            },
          },
          currentUserId: 9999,
          onBattleAgain: () => {},
          onBackToProfile: () => {},
        }),
      );

      assert.ok(html.includes('data-testid="battle-badge-unlock-banner"'));
      assert.ok(html.includes('Badge Unlocked: Speed Demon!'));
    });

    it('does not render battle badge unlock banner when no newBadges are awarded', () => {
      const html = renderToStaticMarkup(
        React.createElement(BattleResultScreen, {
          battleId: 'battle-123',
          finishedPayload: {
            battleId: 'battle-123',
            winner: 'challenger',
            challengerScore: 1000,
            opponentScore: 800,
            completedAt: new Date().toISOString(),
            challengerResult: {
              userId: 9999,
              displayName: 'Alex',
              score: 1000,
              correctCount: 8,
              totalFlags: 10,
              ratingDelta: 20,
              newRating: 620,
              tier: 'Gold',
            },
            opponentResult: {
              userId: 8888,
              displayName: 'Opponent',
              score: 800,
              correctCount: 8,
              totalFlags: 10,
            },
          },
          currentUserId: 9999,
          onBattleAgain: () => {},
          onBackToProfile: () => {},
        }),
      );

      assert.equal(html.includes('data-testid="battle-badge-unlock-banner"'), false);
    });
  });

  describe('ProfileCard seasonal badge unlock banner', () => {
    it('renders profile badge unlock banner when rankStatus has newBadges', () => {
      const html = renderToStaticMarkup(
        React.createElement(ProfileCard, {
          profile: dummyProfile,
          rankStatus: {
            season: '2026-09',
            battleRating: 1500,
            tier: 'Diamond',
            rank: 42,
            newBadges: [
              {
                badgeId: 'season_top_100',
                name: 'Season Top 100',
                description: 'Finish in Top 100',
                earnedAt: new Date().toISOString(),
                season: '2026-08',
              },
            ],
          },
          badges: [],
        }),
      );

      assert.ok(html.includes('data-testid="profile-badge-unlock-banner"'));
      assert.ok(html.includes('Badge Unlocked: Season Top 100!'));
      assert.ok(html.includes('data-testid="badge-showcase"'));
    });

    it('does not render profile badge unlock banner when no newBadges exist', () => {
      const html = renderToStaticMarkup(
        React.createElement(ProfileCard, {
          profile: dummyProfile,
          rankStatus: {
            season: '2026-09',
            battleRating: 1500,
            tier: 'Diamond',
            rank: 42,
          },
          badges: [],
        }),
      );

      assert.equal(html.includes('data-testid="profile-badge-unlock-banner"'), false);
    });
  });

  describe('isTier4Flag helper', () => {
    it('accurately identifies Tier 4 flags in the dataset', () => {
      assert.equal(isTier4Flag('ye'), true);
      assert.equal(isTier4Flag('sy'), true);
      assert.equal(isTier4Flag('iq'), true);
      assert.equal(isTier4Flag('jo'), true);
      assert.equal(isTier4Flag('co'), true);
      assert.equal(isTier4Flag('qa'), true);
      assert.equal(isTier4Flag('bh'), true);
      assert.equal(isTier4Flag('pl'), true);
      assert.equal(isTier4Flag('at'), true);
      assert.equal(isTier4Flag('cl'), true);
      assert.equal(isTier4Flag('kw'), true);
      assert.equal(isTier4Flag('sd'), true);
      assert.equal(isTier4Flag('ae'), true);
    });

    it('returns false for Tier 1, Tier 2, and Tier 3 flags', () => {
      assert.equal(isTier4Flag('us'), false);
      assert.equal(isTier4Flag('gb'), false);
      assert.equal(isTier4Flag('fr'), false);
      assert.equal(isTier4Flag('jp'), false);
      assert.equal(isTier4Flag('be'), false);
      assert.equal(isTier4Flag('sr'), false);
    });

    it('handles uppercase and whitespace cleanly', () => {
      assert.equal(isTier4Flag('YE'), true);
      assert.equal(isTier4Flag('AE'), true);
      assert.equal(isTier4Flag('US'), false);
    });
  });
});
