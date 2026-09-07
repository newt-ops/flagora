import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getTelegramWebApp,
  initTelegramWebApp,
  syncTelegramBackButton,
  updateSafeAreaInsets,
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

  it('calls ready, expand, and requestFullscreen on initialization', () => {
    let readyCalled = false;
    let expandCalled = false;
    let fullscreenCalled = false;

    (globalThis as unknown as { Telegram?: unknown }).Telegram = {
      WebApp: {
        ready: () => {
          readyCalled = true;
        },
        expand: () => {
          expandCalled = true;
        },
        requestFullscreen: () => {
          fullscreenCalled = true;
        },
      },
    };

    try {
      initTelegramWebApp();
      assert.equal(readyCalled, true);
      assert.equal(expandCalled, true);
      assert.equal(fullscreenCalled, true);
    } finally {
      delete (globalThis as unknown as { Telegram?: unknown }).Telegram;
    }
  });

  it('safely handles older clients without requestFullscreen', () => {
    let readyCalled = false;

    (globalThis as unknown as { Telegram?: unknown }).Telegram = {
      WebApp: {
        ready: () => {
          readyCalled = true;
        },
      },
    };

    try {
      initTelegramWebApp();
      assert.equal(readyCalled, true);
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

  it('sets minimum safe area top in fullscreen mode when insets are missing', () => {
    const mockStyles: Record<string, string> = {};
    const mockClassList = new Set<string>();

    (globalThis as unknown as { document?: unknown }).document = {
      documentElement: {
        style: {
          setProperty: (key: string, value: string) => {
            mockStyles[key] = value;
          },
        },
        classList: {
          add: (cls: string) => mockClassList.add(cls),
          remove: (cls: string) => mockClassList.delete(cls),
        },
      },
    };

    try {
      updateSafeAreaInsets({
        isFullscreen: true,
      });

      assert.equal(mockStyles['--tg-safe-top'], '44px');
      assert.equal(mockClassList.has('tg-fullscreen'), true);
    } finally {
      delete (globalThis as unknown as { document?: unknown }).document;
    }
  });

  it('uses reported contentSafeAreaInset top when available', () => {
    const mockStyles: Record<string, string> = {};
    const mockClassList = new Set<string>();

    (globalThis as unknown as { document?: unknown }).document = {
      documentElement: {
        style: {
          setProperty: (key: string, value: string) => {
            mockStyles[key] = value;
          },
        },
        classList: {
          add: (cls: string) => mockClassList.add(cls),
          remove: (cls: string) => mockClassList.delete(cls),
        },
      },
    };

    try {
      updateSafeAreaInsets({
        isFullscreen: true,
        contentSafeAreaInset: { top: 59, bottom: 34, left: 0, right: 0 },
      });

      assert.equal(mockStyles['--tg-safe-top'], '59px');
      assert.equal(mockClassList.has('tg-fullscreen'), true);
    } finally {
      delete (globalThis as unknown as { document?: unknown }).document;
    }
  });

  it('removes tg-fullscreen and sets 0px in normal windowed mode', () => {
    const mockStyles: Record<string, string> = {};
    const mockClassList = new Set<string>(['tg-fullscreen']);

    (globalThis as unknown as { document?: unknown }).document = {
      documentElement: {
        style: {
          setProperty: (key: string, value: string) => {
            mockStyles[key] = value;
          },
        },
        classList: {
          add: (cls: string) => mockClassList.add(cls),
          remove: (cls: string) => mockClassList.delete(cls),
        },
      },
    };

    try {
      updateSafeAreaInsets({
        isFullscreen: false,
      });

      assert.equal(mockStyles['--tg-safe-top'], '0px');
      assert.equal(mockClassList.has('tg-fullscreen'), false);
    } finally {
      delete (globalThis as unknown as { document?: unknown }).document;
    }
  });
});
