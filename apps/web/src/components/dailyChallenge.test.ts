import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { DailyChallengeStatusResponse, FinishRunResponse } from '@flagora/shared';
import {
  isDailyAttempted,
  shouldShowPlayAgain,
  shouldShowDailyLeaderboardButton,
  getDailyResultSummary,
  getLeaderboardTitle,
  getLeaderboardSubtitle,
} from './dailyChallengeHelpers.js';

describe('daily challenge helpers', () => {
  describe('isDailyAttempted', () => {
    it('returns false when status is null', () => {
      assert.equal(isDailyAttempted(null), false);
    });

    it('returns false when attempted is false', () => {
      const status: DailyChallengeStatusResponse = {
        date: '2026-05-15',
        attempted: false,
        runId: null,
        status: 'not_attempted',
        result: null,
      };
      assert.equal(isDailyAttempted(status), false);
    });

    it('returns true when attempted is true', () => {
      const status: DailyChallengeStatusResponse = {
        date: '2026-05-15',
        attempted: true,
        runId: 'run-123',
        status: 'finished',
        result: null,
      };
      assert.equal(isDailyAttempted(status), true);
    });
  });

  describe('shouldShowPlayAgain', () => {
    it('returns true for practice mode', () => {
      assert.equal(shouldShowPlayAgain('practice'), true);
      assert.equal(shouldShowPlayAgain(undefined), true);
    });

    it('returns false for daily mode to prevent duplicate play option', () => {
      assert.equal(shouldShowPlayAgain('daily'), false);
    });
  });

  describe('shouldShowDailyLeaderboardButton', () => {
    it('returns true for daily mode', () => {
      assert.equal(shouldShowDailyLeaderboardButton('daily'), true);
    });

    it('returns false for practice mode', () => {
      assert.equal(shouldShowDailyLeaderboardButton('practice'), false);
      assert.equal(shouldShowDailyLeaderboardButton(undefined), false);
    });
  });

  describe('getDailyResultSummary', () => {
    it('returns null when result is null', () => {
      assert.equal(getDailyResultSummary(null), null);
    });

    it('formats score, correct count, and seconds nicely', () => {
      const result = {
        totalScore: 920,
        correctCount: 8,
        timeUsedMs: 42500,
      } as FinishRunResponse;
      const summary = getDailyResultSummary(result);
      assert.ok(summary);
      assert.equal(summary?.scoreText, '920 pts');
      assert.equal(summary?.correctText, '8/10 correct');
      assert.equal(summary?.timeText, '42.5s');
    });
  });

  describe('titles and subtitles', () => {
    it('returns daily titles for daily mode', () => {
      assert.equal(getLeaderboardTitle('daily'), 'Daily Leaderboard');
      assert.equal(getLeaderboardSubtitle('daily'), "Ranked by today's challenge score");
    });

    it('returns global titles for global mode', () => {
      assert.equal(getLeaderboardTitle('global'), 'Global Leaderboard');
      assert.equal(getLeaderboardSubtitle('global'), 'Ranked by all-time best score');
    });
  });
});
