import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { startRun } from './client.js';

describe('startRun API Client', () => {
  it('safely handles circular object arguments without throwing JSON serialization error', async () => {
    // Construct a circular structure resembling a React SyntheticEvent with DOM nodes
    const circularObj: Record<string, unknown> = {
      type: 'click',
      target: {},
    };
    circularObj.self = circularObj;
    (circularObj.target as Record<string, unknown>).stateNode = circularObj;

    let interceptedBody: string | undefined = undefined;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      interceptedBody = init?.body as string | undefined;
      return new Response(
        JSON.stringify({
          runId: 'run-123',
          mode: 'practice',
          flags: [],
          totalFlags: 10,
          durationSeconds: 60,
          startedAt: new Date().toISOString(),
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as typeof globalThis.fetch;

    try {
      const result = await startRun('test-token', circularObj as unknown as undefined);
      assert.equal(result.runId, 'run-123');
      // Verify body was undefined or not serialized with circular object
      assert.equal(interceptedBody, undefined);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('correctly serializes valid custom options', async () => {
    let interceptedBody: string | undefined = undefined;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      interceptedBody = init?.body as string | undefined;
      return new Response(
        JSON.stringify({
          runId: 'run-custom-456',
          mode: 'custom',
          flags: [],
          totalFlags: 20,
          durationSeconds: 90,
          startedAt: new Date().toISOString(),
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as typeof globalThis.fetch;

    try {
      const result = await startRun('test-token', {
        continent: 'europe',
        flagCount: 20,
        durationSeconds: 90,
      });
      assert.equal(result.runId, 'run-custom-456');
      assert.ok(interceptedBody);
      const parsed = JSON.parse(interceptedBody);
      assert.equal(parsed.continent, 'europe');
      assert.equal(parsed.flagCount, 20);
      assert.equal(parsed.durationSeconds, 90);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
