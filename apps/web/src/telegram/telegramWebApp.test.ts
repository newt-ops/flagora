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

  it('sets all four safe area and content safe area insets properly', () => {
    const mockStyles: Record<string, string> = {};

    (globalThis as unknown as { document?: unknown }).document = {
      documentElement: {
        style: {
          setProperty: (key: string, value: string) => {
            mockStyles[key] = value;
          },
        },
        classList: {
          add: () => void 0,
          remove: () => void 0,
        },
      },
    };

    try {
      updateSafeAreaInsets({
        isFullscreen: true,
        safeAreaInset: { top: 20, bottom: 34, left: 12, right: 16 },
        contentSafeAreaInset: { top: 56, bottom: 0, left: 0, right: 0 },
      });

      assert.equal(mockStyles['--tg-safe-area-inset-top'], '20px');
      assert.equal(mockStyles['--tg-safe-area-inset-bottom'], '34px');
      assert.equal(mockStyles['--tg-safe-area-inset-left'], '12px');
      assert.equal(mockStyles['--tg-safe-area-inset-right'], '16px');

      assert.equal(mockStyles['--tg-content-safe-area-inset-top'], '56px');
      assert.equal(mockStyles['--tg-content-safe-area-inset-bottom'], '0px');
      assert.equal(mockStyles['--tg-content-safe-area-inset-left'], '0px');
      assert.equal(mockStyles['--tg-content-safe-area-inset-right'], '0px');

      assert.equal(mockStyles['--tg-safe-top'], '56px');
      assert.equal(mockStyles['--tg-safe-bottom'], '34px');
      assert.equal(mockStyles['--tg-safe-left'], '12px');
      assert.equal(mockStyles['--tg-safe-right'], '16px');
    } finally {
      delete (globalThis as unknown as { document?: unknown }).document;
    }
  });

  it('subscribes to all safe area and fullscreen events', () => {
    const registeredEvents: string[] = [];

    (globalThis as unknown as { Telegram?: unknown }).Telegram = {
      WebApp: {
        onEvent: (event: string) => {
          registeredEvents.push(event);
        },
      },
    };

    try {
      initTelegramWebApp();
      assert.equal(registeredEvents.includes('safeAreaChanged'), true);
      assert.equal(registeredEvents.includes('contentSafeAreaChanged'), true);
      assert.equal(registeredEvents.includes('fullscreenChanged'), true);
      assert.equal(registeredEvents.includes('fullscreenFailed'), true);
    } finally {
      delete (globalThis as unknown as { Telegram?: unknown }).Telegram;
    }
  });
});
