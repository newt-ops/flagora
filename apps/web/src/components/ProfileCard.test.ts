import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProfileCard, getDisplayName } from './ProfileCard.js';
import type { PlayerProfile } from '@flagora/shared';

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

describe('ProfileCard UI Rendering (Apple Human Interface)', () => {
  const dummyProfile: PlayerProfile = {
    telegramUserId: 12345,
    firstName: 'Tariq',
    lastName: 'Al-Mansoor',
    username: 'tariq_flag',
    pins: 850,
    xp: 650, // 650 XP -> Level 2, 150/500 in level (30%)
    level: 2,
    currentStreak: 4,
    longestStreak: 9,
    gamesPlayed: 25,
    bestScore: 1120,
    referralCount: 3,
    lastPlayedDate: '2026-10-09',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it('renders Level and XP progress meter accurately', () => {
    const html = renderToStaticMarkup(
      React.createElement(ProfileCard, {
        profile: dummyProfile,
      }),
    );

    assert.ok(html.includes('Level 2'));
    assert.ok(html.includes('150 / 500 XP'));
    assert.ok(html.includes('width:30%'));
  });

  it('renders 1-Star Get Verified upgrade card when user is free', () => {
    const html = renderToStaticMarkup(
      React.createElement(ProfileCard, {
        profile: dummyProfile,
        proStatus: null,
      }),
    );

    assert.ok(html.includes('Get Verified Badge'));
    assert.ok(html.includes('1 Star'));
  });

  it('renders Pro Verified text when user is Pro subscribed', () => {
    const html = renderToStaticMarkup(
      React.createElement(ProfileCard, {
        profile: dummyProfile,
        proStatus: {
          isActive: true,
          currentPeriodEnd: '2026-11-09T00:00:00.000Z',
          perks: ['verified_badge'],
        },
      }),
    );

    assert.ok(html.includes('Pro Verified'));
    assert.equal(html.includes('Get Verified Badge'), false);
  });

  it('renders ranked tier and battle rating correctly', () => {
    const html = renderToStaticMarkup(
      React.createElement(ProfileCard, {
        profile: dummyProfile,
        rankStatus: {
          tier: 'Platinum',
          battleRating: 1240,
          rank: 18,
          season: '2026-10',
        },
      }),
    );

    assert.ok(html.includes('Platinum Tier'));
    assert.ok(html.includes('#18'));
    assert.ok(html.includes('1,240 Rating'));
    assert.ok(html.includes('October 2026'));
  });

  it('renders the 4 metric stats matrix with accurate values and clean labels', () => {
    const html = renderToStaticMarkup(
      React.createElement(ProfileCard, {
        profile: dummyProfile,
      }),
    );

    assert.ok(html.includes('850')); // Pins
    assert.ok(html.includes('Pins'));
    assert.ok(html.includes('650')); // Total XP
    assert.ok(html.includes('Total XP'));
    assert.ok(html.includes('1,120')); // Best Score
    assert.ok(html.includes('Best Score'));
    assert.ok(html.includes('25')); // Games Played
    assert.ok(html.includes('Games'));
  });

  it('renders social referral section with friends count and actions', () => {
    const html = renderToStaticMarkup(
      React.createElement(ProfileCard, {
        profile: dummyProfile,
      }),
    );

    assert.ok(html.includes('Invite Friends'));
    assert.ok(html.includes('3 Friends'));
    assert.ok(html.includes('Copy Link'));
    assert.ok(html.includes('Share Link'));
  });
});
