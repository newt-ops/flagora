import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ChallengeInfoResponse } from '@flagora/shared';
import {
  getChallengeStartParam,
  getChallengeViewerPerspective,
  getPerspectiveHeading,
  isChallengeAcceptable,
  getInitials,
} from './challengeViewHelpers.js';

describe('challenge view helpers', () => {
  describe('getChallengeStartParam', () => {
    it('extracts startapp from query params', () => {
      assert.equal(getChallengeStartParam('?startapp=ch_abc123'), 'ch_abc123');
    });

    it('extracts tgWebAppStartParam from query params', () => {
      assert.equal(getChallengeStartParam('?tgWebAppStartParam=ch_xyz789'), 'ch_xyz789');
    });

    it('extracts start_param from query params', () => {
      assert.equal(getChallengeStartParam('?start_param=ch_start123'), 'ch_start123');
    });

    it('extracts startapp from hash fragment', () => {
      assert.equal(getChallengeStartParam('', '#startapp=ch_hash123'), 'ch_hash123');
    });

    it('extracts tgWebAppStartParam from hash fragment', () => {
      assert.equal(getChallengeStartParam('', '#tgWebAppStartParam=ch_hash456'), 'ch_hash456');
    });

    it('extracts start_param from tgWebAppData within hash', () => {
      const hash = '#tgWebAppData=auth_date%3D123%26start_param%3Dch_data789';
      assert.equal(getChallengeStartParam('', hash), 'ch_data789');
    });

    it('extracts start_param from initData string', () => {
      const initData = 'auth_date=123&start_param=ch_init456';
      assert.equal(getChallengeStartParam('', '', initData), 'ch_init456');
    });

    it('returns null when no start param is present', () => {
      assert.equal(getChallengeStartParam('?foo=bar', '#test', 'auth_date=123'), null);
      assert.equal(getChallengeStartParam('', '', ''), null);
    });
  });

  describe('getChallengeViewerPerspective', () => {
    const baseCompletedChallenge: ChallengeInfoResponse = {
      challengeId: 'ch_test',
      challengerUserId: 1001,
      challengerDisplayName: 'Alice',
      challengerScore: 1200,
      status: 'completed',
      isOpen: false,
      isChallenger: false,
      isOpponent: false,
      expiresAt: '2026-09-08T00:00:00Z',
      opponentUserId: 2002,
      opponentDisplayName: 'Bob',
      opponentScore: 950,
      winner: 'challenger',
    };

    it('returns won for challenger when winner is challenger', () => {
      const perspective = getChallengeViewerPerspective(baseCompletedChallenge, 1001);
      assert.equal(perspective, 'won');
    });

    it('returns lost for opponent when winner is challenger', () => {
      const perspective = getChallengeViewerPerspective(baseCompletedChallenge, 2002);
      assert.equal(perspective, 'lost');
    });

    it('returns won for opponent when winner is opponent', () => {
      const opponentWonChallenge: ChallengeInfoResponse = {
        ...baseCompletedChallenge,
        winner: 'opponent',
      };
      const perspective = getChallengeViewerPerspective(opponentWonChallenge, 2002);
      assert.equal(perspective, 'won');
    });

    it('returns lost for challenger when winner is opponent', () => {
      const opponentWonChallenge: ChallengeInfoResponse = {
        ...baseCompletedChallenge,
        winner: 'opponent',
      };
      const perspective = getChallengeViewerPerspective(opponentWonChallenge, 1001);
      assert.equal(perspective, 'lost');
    });

    it('returns tie for both participants when winner is tie', () => {
      const tieChallenge: ChallengeInfoResponse = {
        ...baseCompletedChallenge,
        winner: 'tie',
      };
      assert.equal(getChallengeViewerPerspective(tieChallenge, 1001), 'tie');
      assert.equal(getChallengeViewerPerspective(tieChallenge, 2002), 'tie');
    });

    it('returns spectator for non-participant viewing completed challenge', () => {
      assert.equal(getChallengeViewerPerspective(baseCompletedChallenge, 9999), 'spectator');
    });

    it('returns spectator for incomplete challenge', () => {
      const pendingChallenge: ChallengeInfoResponse = {
        ...baseCompletedChallenge,
        status: 'pending',
        winner: null,
      };
      assert.equal(getChallengeViewerPerspective(pendingChallenge, 1001), 'spectator');
    });
  });

  describe('getPerspectiveHeading', () => {
    it('returns appropriate heading for won', () => {
      const heading = getPerspectiveHeading('won');
      assert.equal(heading.title, 'Victory!');
      assert.equal(heading.subtitle, 'You won the challenge!');
      assert.ok(heading.badgeClass.includes('emerald'));
    });

    it('returns appropriate heading for lost', () => {
      const heading = getPerspectiveHeading('lost');
      assert.equal(heading.title, 'Defeat!');
      assert.equal(heading.subtitle, 'Better luck next time!');
      assert.ok(heading.badgeClass.includes('rose'));
    });

    it('returns appropriate heading for tie', () => {
      const heading = getPerspectiveHeading('tie');
      assert.equal(heading.title, "It's a Tie!");
      assert.ok(heading.badgeClass.includes('amber'));
    });

    it('returns appropriate heading for spectator with winner name', () => {
      const heading = getPerspectiveHeading('spectator', 'Alice');
      assert.equal(heading.title, 'Alice Won!');
    });
  });

  describe('isChallengeAcceptable', () => {
    it('returns true when challenge is open, pending, and viewer is not challenger', () => {
      const openChallenge: ChallengeInfoResponse = {
        challengeId: 'ch_open',
        challengerUserId: 1001,
        challengerDisplayName: 'Alice',
        challengerScore: 1000,
        status: 'pending',
        isOpen: true,
        isChallenger: false,
        isOpponent: false,
        expiresAt: '2026-09-08T00:00:00Z',
      };
      assert.equal(isChallengeAcceptable(openChallenge), true);
    });

    it('returns false when viewer is the challenger', () => {
      const selfChallenge: ChallengeInfoResponse = {
        challengeId: 'ch_self',
        challengerUserId: 1001,
        challengerDisplayName: 'Alice',
        challengerScore: 1000,
        status: 'pending',
        isOpen: true,
        isChallenger: true,
        isOpponent: false,
        expiresAt: '2026-09-08T00:00:00Z',
      };
      assert.equal(isChallengeAcceptable(selfChallenge), false);
    });

    it('returns false when challenge is expired', () => {
      const expiredChallenge: ChallengeInfoResponse = {
        challengeId: 'ch_exp',
        challengerUserId: 1001,
        challengerDisplayName: 'Alice',
        challengerScore: 1000,
        status: 'expired',
        isOpen: false,
        isChallenger: false,
        isOpponent: false,
        expiresAt: '2026-09-06T00:00:00Z',
      };
      assert.equal(isChallengeAcceptable(expiredChallenge), false);
    });

    it('returns false when challenge is completed', () => {
      const completedChallenge: ChallengeInfoResponse = {
        challengeId: 'ch_comp',
        challengerUserId: 1001,
        challengerDisplayName: 'Alice',
        challengerScore: 1000,
        status: 'completed',
        isOpen: false,
        isChallenger: false,
        isOpponent: false,
        expiresAt: '2026-09-08T00:00:00Z',
      };
      assert.equal(isChallengeAcceptable(completedChallenge), false);
    });
  });

  describe('getInitials', () => {
    it('returns uppercase initial for standard names', () => {
      assert.equal(getInitials('Alice'), 'A');
      assert.equal(getInitials('bob'), 'B');
    });

    it('strips leading @ from usernames', () => {
      assert.equal(getInitials('@charlie'), 'C');
    });

    it('falls back to P when empty or null', () => {
      assert.equal(getInitials(''), 'P');
      assert.equal(getInitials(null), 'P');
      assert.equal(getInitials(undefined), 'P');
    });
  });
});
