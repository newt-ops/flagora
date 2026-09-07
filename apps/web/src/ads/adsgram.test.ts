import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  showRewardedAd,
  getAdsgramController,
  resetAdsgramController,
  getAdsgramBlockId,
} from './adsgram.js';
import type {
  AdsgramController,
  ShowPromiseResult,
} from './adsgramTypes.js';

describe('Phase 8 Prompt 04: AdsGram SDK Integration', () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = (globalThis as unknown as { window?: unknown }).window;
  const dummySessionToken = 'test-session-jwt-token-12345';

  let fetchCalls: Array<{ url: string; method: string; body?: unknown; headers?: Record<string, string> }> = [];
  let fetchHandler: (url: string, init?: RequestInit) => Promise<Response>;

  beforeEach(() => {
    resetAdsgramController();
    fetchCalls = [];
    fetchHandler = async () => new Response('{}', { status: 200 });

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method || 'GET';
      let parsedBody: unknown = undefined;
      if (init?.body && typeof init.body === 'string') {
        try {
          parsedBody = JSON.parse(init.body);
        } catch {
          parsedBody = init.body;
        }
      }
      fetchCalls.push({
        url,
        method,
        body: parsedBody,
        headers: (init?.headers as Record<string, string>) || {},
      });
      return fetchHandler(url, init);
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    (globalThis as unknown as { window?: unknown }).window = originalWindow;
    resetAdsgramController();
  });

  function createMockController(behavior: {
    resolveWith?: ShowPromiseResult;
    rejectWith?: unknown;
  }): { controller: AdsgramController; showCalls: number } {
    let showCalls = 0;
    const controller: AdsgramController = {
      show: async () => {
        showCalls++;
        if (behavior.rejectWith !== undefined) {
          throw behavior.rejectWith;
        }
        return (
          behavior.resolveWith ?? {
            done: true,
            state: 'destroy',
            description: 'The banner was viewed to the end',
            error: false,
          }
        );
      },
    };
    return { controller, get showCalls() { return showCalls; } };
  }

  it('successful bonus-coins ad watch requests intent, shows ad, and redeems token', async () => {
    const mockController = createMockController({
      resolveWith: {
        done: true,
        state: 'destroy',
        description: 'The banner was viewed to the end',
        error: false,
      },
    });

    fetchHandler = async (url) => {
      if (url.includes('/api/rewards/bonus-coins/intent')) {
        return new Response(
          JSON.stringify({
            ok: true,
            token: 'test-reward-token-abc',
            rewardType: 'bonus-coins',
            dailyCap: 5,
            coins: 50,
          }),
          { status: 200 },
        );
      }
      if (url.includes('/api/rewards/bonus-coins/redeem')) {
        return new Response(
          JSON.stringify({
            ok: true,
            coinsEarned: 50,
            coins: 150,
            telegramUserId: 1001,
          }),
          { status: 200 },
        );
      }
      return new Response('Not Found', { status: 404 });
    };

    const outcome = await showRewardedAd('bonus-coins', dummySessionToken, {
      controller: mockController.controller,
    });

    assert.equal(outcome.status, 'rewarded');
    if (outcome.status === 'rewarded') {
      assert.equal(outcome.rewardType, 'bonus-coins');
      assert.equal(outcome.data.coinsEarned, 50);
      assert.equal(outcome.data.coins, 150);
      assert.equal(outcome.data.telegramUserId, 1001);
    }

    assert.equal(mockController.showCalls, 1);
    assert.equal(fetchCalls.length, 2);
    assert.ok(fetchCalls[0].url.includes('/api/rewards/bonus-coins/intent'));
    assert.ok(fetchCalls[1].url.includes('/api/rewards/bonus-coins/redeem'));
    assert.deepEqual(fetchCalls[1].body, { token: 'test-reward-token-abc' });
  });

  it('successful streak-save ad watch requests intent, shows ad, and redeems token', async () => {
    const mockController = createMockController({
      resolveWith: {
        done: true,
        state: 'destroy',
        description: 'The banner was viewed to the end',
        error: false,
      },
    });

    fetchHandler = async (url) => {
      if (url.includes('/api/rewards/streak-save/intent')) {
        return new Response(
          JSON.stringify({
            ok: true,
            token: 'test-streak-token-xyz',
            rewardType: 'streak-save',
            dailyCap: 1,
            currentStreak: 10,
            longestStreak: 12,
          }),
          { status: 200 },
        );
      }
      if (url.includes('/api/rewards/streak-save/redeem')) {
        return new Response(
          JSON.stringify({
            ok: true,
            saved: true,
            lastPlayedDate: '2026-09-07',
            currentStreak: 10,
            longestStreak: 12,
            telegramUserId: 1002,
          }),
          { status: 200 },
        );
      }
      return new Response('Not Found', { status: 404 });
    };

    const outcome = await showRewardedAd('streak-save', dummySessionToken, {
      controller: mockController.controller,
    });

    assert.equal(outcome.status, 'rewarded');
    if (outcome.status === 'rewarded') {
      assert.equal(outcome.rewardType, 'streak-save');
      assert.equal(outcome.data.saved, true);
      assert.equal(outcome.data.lastPlayedDate, '2026-09-07');
      assert.equal(outcome.data.currentStreak, 10);
    }

    assert.equal(mockController.showCalls, 1);
    assert.equal(fetchCalls.length, 2);
    assert.ok(fetchCalls[0].url.includes('/api/rewards/streak-save/intent'));
    assert.ok(fetchCalls[1].url.includes('/api/rewards/streak-save/redeem'));
    assert.deepEqual(fetchCalls[1].body, { token: 'test-streak-token-xyz' });
  });

  it('skipped ad results in zero redeem calls and resolves with skipped outcome', async () => {
    const mockController = createMockController({
      rejectWith: {
        description: 'The banner was skipped',
        state: 'playing',
        error: false,
        done: false,
      },
    });

    fetchHandler = async (url) => {
      if (url.includes('/api/rewards/bonus-coins/intent')) {
        return new Response(
          JSON.stringify({
            ok: true,
            token: 'test-token-to-skip',
            rewardType: 'bonus-coins',
            dailyCap: 5,
            coins: 50,
          }),
          { status: 200 },
        );
      }
      return new Response('Should not be called', { status: 500 });
    };

    const outcome = await showRewardedAd('bonus-coins', dummySessionToken, {
      controller: mockController.controller,
    });

    assert.equal(outcome.status, 'skipped');
    assert.equal(outcome.rewardType, 'bonus-coins');
    assert.equal(outcome.message, 'Ad was skipped');

    assert.equal(mockController.showCalls, 1);
    assert.equal(fetchCalls.length, 1);
    assert.ok(fetchCalls[0].url.includes('/api/rewards/bonus-coins/intent'));
  });

  it('ad load failure or no-fill results in zero redeem calls and resolves with unavailable outcome', async () => {
    const mockController = createMockController({
      rejectWith: {
        description: 'Oops! No ads available at the moment. Try again later',
        state: 'load',
        error: false,
        done: false,
      },
    });

    fetchHandler = async (url) => {
      if (url.includes('/api/rewards/bonus-coins/intent')) {
        return new Response(
          JSON.stringify({
            ok: true,
            token: 'test-token-no-fill',
            rewardType: 'bonus-coins',
            dailyCap: 5,
            coins: 50,
          }),
          { status: 200 },
        );
      }
      return new Response('Should not be called', { status: 500 });
    };

    const outcome = await showRewardedAd('bonus-coins', dummySessionToken, {
      controller: mockController.controller,
    });

    assert.equal(outcome.status, 'unavailable');
    assert.equal(outcome.rewardType, 'bonus-coins');
    assert.equal(outcome.message, 'No ad available right now, try again later');

    assert.equal(mockController.showCalls, 1);
    assert.equal(fetchCalls.length, 1);
  });

  it('playback error results in zero redeem calls and resolves with error outcome', async () => {
    const mockController = createMockController({
      rejectWith: {
        description: 'Error during playing ad',
        state: 'playing',
        error: true,
        done: false,
      },
    });

    fetchHandler = async (url) => {
      if (url.includes('/api/rewards/bonus-coins/intent')) {
        return new Response(
          JSON.stringify({
            ok: true,
            token: 'test-token-playback-err',
            rewardType: 'bonus-coins',
            dailyCap: 5,
            coins: 50,
          }),
          { status: 200 },
        );
      }
      return new Response('Should not be called', { status: 500 });
    };

    const outcome = await showRewardedAd('bonus-coins', dummySessionToken, {
      controller: mockController.controller,
    });

    assert.equal(outcome.status, 'error');
    assert.equal(outcome.rewardType, 'bonus-coins');
    assert.equal(outcome.message, 'Error during playing ad');

    assert.equal(mockController.showCalls, 1);
    assert.equal(fetchCalls.length, 1);
  });

  it('intent failure with daily cap reached prevents ad from being shown at all', async () => {
    const mockController = createMockController({
      resolveWith: {
        done: true,
        state: 'destroy',
        description: 'Should not run',
        error: false,
      },
    });

    fetchHandler = async (url) => {
      if (url.includes('/api/rewards/bonus-coins/intent')) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: 'Daily cap reached',
            message: 'Daily cap reached for bonus coins',
            dailyCap: 5,
            usedCount: 5,
            resetAtUtc: '2026-09-09T00:00:00.000Z',
          }),
          { status: 429 },
        );
      }
      return new Response('Should not be called', { status: 500 });
    };

    const outcome = await showRewardedAd('bonus-coins', dummySessionToken, {
      controller: mockController.controller,
    });

    assert.equal(outcome.status, 'cap_reached');
    if (outcome.status === 'cap_reached') {
      assert.equal(outcome.rewardType, 'bonus-coins');
      assert.equal(outcome.dailyCap, 5);
      assert.equal(outcome.usedCount, 5);
      assert.equal(outcome.resetAtUtc, '2026-09-09T00:00:00.000Z');
      assert.equal(outcome.message, 'Daily cap reached for bonus coins');
    }

    assert.equal(mockController.showCalls, 0);
    assert.equal(fetchCalls.length, 1);
  });

  it('streak-save intent failure when streak is not at risk prevents ad from being shown', async () => {
    const mockController = createMockController({
      resolveWith: {
        done: true,
        state: 'destroy',
        description: 'Should not run',
        error: false,
      },
    });

    fetchHandler = async (url) => {
      if (url.includes('/api/rewards/streak-save/intent')) {
        return new Response(
          JSON.stringify({
            error: 'Streak not at risk',
            message: 'Streak is not currently at risk',
          }),
          { status: 400 },
        );
      }
      return new Response('Should not be called', { status: 500 });
    };

    const outcome = await showRewardedAd('streak-save', dummySessionToken, {
      controller: mockController.controller,
    });

    assert.equal(outcome.status, 'not_at_risk');
    if (outcome.status === 'not_at_risk') {
      assert.equal(outcome.rewardType, 'streak-save');
      assert.equal(outcome.message, 'Streak is not currently at risk');
    }

    assert.equal(mockController.showCalls, 0);
    assert.equal(fetchCalls.length, 1);
  });

  it('resolves with unavailable when AdsGram SDK is missing from window', async () => {
    (globalThis as unknown as { window?: unknown }).window = {};

    fetchHandler = async (url) => {
      if (url.includes('/api/rewards/bonus-coins/intent')) {
        return new Response(
          JSON.stringify({
            ok: true,
            token: 'test-token-no-sdk',
            rewardType: 'bonus-coins',
            dailyCap: 5,
            coins: 50,
          }),
          { status: 200 },
        );
      }
      return new Response('Should not be called', { status: 500 });
    };

    const outcome = await showRewardedAd('bonus-coins', dummySessionToken);

    assert.equal(outcome.status, 'unavailable');
    assert.equal(outcome.rewardType, 'bonus-coins');
    assert.equal(outcome.message, 'No ad available right now, try again later');
    assert.equal(fetchCalls.length, 1);
  });

  it('getAdsgramBlockId returns default placeholder when env var is not set', () => {
    const blockId = getAdsgramBlockId();
    assert.ok(typeof blockId === 'string');
    assert.ok(blockId.length > 0);
  });

  it('reuses controller singleton across multiple calls with same blockId', () => {
    let initCount = 0;
    const fakeController: AdsgramController = {
      show: async () => ({ done: true, state: 'destroy', description: '', error: false }),
    };

    (globalThis as unknown as { window?: unknown }).window = {
      Adsgram: {
        init: () => {
          initCount++;
          return fakeController;
        },
      },
    };

    const c1 = getAdsgramController({ blockId: 'test-block-1' });
    const c2 = getAdsgramController({ blockId: 'test-block-1' });

    assert.equal(initCount, 1);
    assert.equal(c1, fakeController);
    assert.equal(c2, fakeController);

    resetAdsgramController();
    const c3 = getAdsgramController({ blockId: 'test-block-1' });
    assert.equal(initCount, 2);
    assert.equal(c3, fakeController);
  });

  it('passes debug as boolean false by default and omits undefined properties', () => {
    let capturedOptions: Record<string, unknown> | undefined;
    const fakeController: AdsgramController = {
      show: async () => ({ done: true, state: 'destroy', description: '', error: false }),
    };

    (globalThis as unknown as { window?: unknown }).window = {
      Adsgram: {
        init: (options: Record<string, unknown>) => {
          capturedOptions = options;
          return fakeController;
        },
      },
    };

    const controller = getAdsgramController({ blockId: 'test-block-debug' });
    assert.equal(controller, fakeController);
    assert.ok(capturedOptions);
    assert.equal(typeof capturedOptions?.debug, 'boolean');
    assert.equal(capturedOptions?.debug, false);
    assert.equal('debugBannerType' in (capturedOptions || {}), false);
    assert.equal('debugConsole' in (capturedOptions || {}), false);
  });

  it('safely handles window.Adsgram.init throwing an error', () => {
    (globalThis as unknown as { window?: unknown }).window = {
      Adsgram: {
        init: () => {
          throw new Error('debug should be boolean you call with undefined');
        },
      },
    };

    const controller = getAdsgramController({ blockId: 'test-block-throws' });
    assert.equal(controller, null);
  });
});
