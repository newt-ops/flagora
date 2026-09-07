import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getTelegramWebApp,
  initTelegramWebApp,
  syncTelegramBackButton,
} from './telegramWebApp.js';

describe('telegramWebApp', () => {
  it('returns undefined when window.Telegram is not present', () => {
    const originalTelegram = (globalThis as unknown as { Telegram?: unknown }).Telegram;
    try {
      delete (globalThis as unknown as { Telegram?: unknown }).Telegram;
      assert.equal(getTelegramWebApp(), undefined);
    } finally {
      (globalThis as unknown as { Telegram?: unknown }).Telegram = originalTelegram;
    }
  });

  it('calls ready and expand on initialization', () => {
    let readyCalled = false;
    let expandCalled = false;

    (globalThis as unknown as { Telegram?: unknown }).Telegram = {
      WebApp: {
        ready: () => {
          readyCalled = true;
        },
        expand: () => {
          expandCalled = true;
        },
      },
    };

    try {
      initTelegramWebApp();
      assert.equal(readyCalled, true);
      assert.equal(expandCalled, true);
    } finally {
      delete (globalThis as unknown as { Telegram?: unknown }).Telegram;
    }
  });

  it('handles back button show and onClick cleanup when visible', () => {
    let showCalled = false;
    let registeredCallback: (() => void) | null = null;
    let removedCallback: (() => void) | null = null;

    (globalThis as unknown as { Telegram?: unknown }).Telegram = {
      WebApp: {
        BackButton: {
          show: () => {
            showCalled = true;
          },
          hide: () => {
            void 0;
          },
          onClick: (cb: () => void) => {
            registeredCallback = cb;
          },
          offClick: (cb: () => void) => {
            removedCallback = cb;
          },
        },
      },
    };

    try {
      const handler = () => void 0;
      const cleanup = syncTelegramBackButton(true, handler);
      assert.equal(showCalled, true);
      assert.equal(registeredCallback, handler);

      cleanup?.();
      assert.equal(removedCallback, handler);
    } finally {
      delete (globalThis as unknown as { Telegram?: unknown }).Telegram;
    }
  });

  it('hides back button when not visible', () => {
    let hideCalled = false;

    (globalThis as unknown as { Telegram?: unknown }).Telegram = {
      WebApp: {
        BackButton: {
          show: () => {
            void 0;
          },
          hide: () => {
            hideCalled = true;
          },
          onClick: () => {
            void 0;
          },
          offClick: () => {
            void 0;
          },
        },
      },
    };

    try {
      const cleanup = syncTelegramBackButton(false, () => void 0);
      assert.equal(hideCalled, true);
      assert.equal(cleanup, undefined);
    } finally {
      delete (globalThis as unknown as { Telegram?: unknown }).Telegram;
    }
  });
});
