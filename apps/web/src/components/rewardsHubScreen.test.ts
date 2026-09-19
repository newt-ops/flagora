import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PlayerProfile, StreakStatusResponse } from '@flagora/shared';
import { RewardsHubScreen } from './RewardsHubScreen.js';
import { StreakSaveBanner } from './StreakSaveBanner.js';

describe('Phase 11 Prompt 03: Earn Free Pins Hub & Discoverability', () => {
  const dummyProfile: PlayerProfile = {
    telegramUserId: 5555,
    username: 'flag_master',
    firstName: 'Alice',
    lastName: null,
    photoUrl: null,
    pins: 750,
    xp: 2200,
    level: 4,
    bestScore: 920,
    gamesPlayed: 18,
    currentStreak: 5,
    longestStreak: 9,
    lastPlayedDate: '2026-09-17',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('renders Earn Free Pins hub with pins count and both reward sections', () => {
    const html = renderToStaticMarkup(
      React.createElement(RewardsHubScreen, {
        profile: dummyProfile,
        streakStatus: {
          isAtRisk: false,
          currentStreak: 5,
          longestStreak: 9,
          lastPlayedDate: '2026-09-17',
        },
        sessionToken: 'test-token',
      }),
    );

    assert.ok(html.includes('data-testid="rewards-hub-screen"'));
    assert.ok(html.includes('Earn Free Pins'));
    assert.ok(html.includes('750'));
    assert.ok(html.includes('Daily Bonus Pins'));
    assert.ok(html.includes('Streak Protection'));
    assert.ok(html.includes('Reward Economy Guide'));
  });

  it('renders informational not-needed state when streak is not at risk', () => {
    const html = renderToStaticMarkup(
      React.createElement(RewardsHubScreen, {
        profile: dummyProfile,
        streakStatus: {
          isAtRisk: false,
          currentStreak: 5,
          longestStreak: 9,
          lastPlayedDate: '2026-09-17',
        },
        sessionToken: 'test-token',
      }),
    );

    assert.ok(html.includes('Not currently needed'));
    assert.ok(html.includes('data-testid="streak-save-not-needed-button"'));
    assert.ok(html.includes('Protection Not Needed • Streak Safe'));
    assert.ok(!html.includes('data-testid="watch-streak-save-ad-button"'));
  });

  it('renders actionable save button when streak is at risk', () => {
    const atRiskStatus: StreakStatusResponse = {
      isAtRisk: true,
      currentStreak: 5,
      longestStreak: 9,
      lastPlayedDate: '2026-09-15',
    };

    const html = renderToStaticMarkup(
      React.createElement(RewardsHubScreen, {
        profile: dummyProfile,
        streakStatus: atRiskStatus,
        sessionToken: 'test-token',
      }),
    );

    assert.ok(html.includes('At Risk'));
    assert.ok(html.includes('data-testid="watch-streak-save-ad-button"'));
    assert.ok(html.includes('Save Streak • Watch Ad'));
    assert.ok(!html.includes('data-testid="streak-save-not-needed-button"'));
  });

  it('renders economy guide detailing correct answer pins, ad bonus pins, and shop tiers', () => {
    const html = renderToStaticMarkup(
      React.createElement(RewardsHubScreen, {
        profile: dummyProfile,
        streakStatus: null,
        sessionToken: 'test-token',
      }),
    );

    assert.ok(html.includes('+5 pins for every correct flag'));
    assert.ok(html.includes('+50 pins per video'));
    assert.ok(html.includes('Tier 1 (~150 pins)'));
    assert.ok(html.includes('Tier 2 (~400 pins)'));
    assert.ok(html.includes('Tier 3 (~900 pins)'));
  });

  it('renders learn-more link in contextual StreakSaveBanner when onLearnMore is provided', () => {
    const atRiskStatus: StreakStatusResponse = {
      isAtRisk: true,
      currentStreak: 3,
      longestStreak: 6,
      lastPlayedDate: '2026-09-14',
    };

    const html = renderToStaticMarkup(
      React.createElement(StreakSaveBanner, {
        streakStatus: atRiskStatus,
        sessionToken: 'test-token',
        onLearnMore: () => {},
      }),
    );

    assert.ok(html.includes('data-testid="streak-save-banner"'));
    assert.ok(html.includes('data-testid="streak-save-learn-more"'));
    assert.ok(html.includes('Learn more &amp; view earn options'));
  });
});
