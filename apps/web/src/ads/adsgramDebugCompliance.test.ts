import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  isAdsgramDebugEnabled,
  getAdsgramController,
  resetAdsgramController,
} from './adsgram.js';
import type { AdsgramController } from './adsgramTypes.js';

describe('Phase 11 Prompt 01: AdsGram Debug Production Compliance', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAdsgramDebug = process.env.VITE_ADSGRAM_DEBUG;
  const originalWindow = (globalThis as unknown as { window?: unknown }).window;

  beforeEach(() => {
    resetAdsgramController();
    process.env.NODE_ENV = 'test';
    delete process.env.VITE_ADSGRAM_DEBUG;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalAdsgramDebug !== undefined) {
      process.env.VITE_ADSGRAM_DEBUG = originalAdsgramDebug;
    } else {
      delete process.env.VITE_ADSGRAM_DEBUG;
    }
    (globalThis as unknown as { window?: unknown }).window = originalWindow;
    resetAdsgramController();
  });

  it('resolves debug to true in non-production when explicitly requested', () => {
    process.env.NODE_ENV = 'development';
    assert.equal(isAdsgramDebugEnabled(true), true);
  });

  it('resolves debug to false in non-production when requested false or unspecified', () => {
    process.env.NODE_ENV = 'development';
    assert.equal(isAdsgramDebugEnabled(false), false);
    assert.equal(isAdsgramDebugEnabled(), false);
  });

  it('resolves debug to true in non-production if env var is set', () => {
    process.env.NODE_ENV = 'development';
    process.env.VITE_ADSGRAM_DEBUG = 'true';
    assert.equal(isAdsgramDebugEnabled(), true);
  });

  it('strictly forces debug to false in production even if requested as true', () => {
    process.env.NODE_ENV = 'production';
    process.env.VITE_ADSGRAM_DEBUG = 'true';
    assert.equal(isAdsgramDebugEnabled(true), false);
    assert.equal(isAdsgramDebugEnabled(), false);
  });

  it('passes debug: false to Adsgram.init in production even when option debug is true', () => {
    process.env.NODE_ENV = 'production';
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

    const controller = getAdsgramController({ blockId: 'prod-test-block', debug: true });
    assert.equal(controller, fakeController);
    assert.ok(capturedOptions);
    assert.equal(capturedOptions.debug, false);
  });
});
