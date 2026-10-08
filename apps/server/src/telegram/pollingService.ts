import type { Db } from 'mongodb';
import {
  deleteTelegramWebhook,
  getTelegramUpdates,
  type TelegramServiceOverrides,
} from './telegramService.js';
import { handleTelegramUpdate, type HandleUpdateOptions } from './botUpdateHandler.js';

export interface TelegramPollingController {
  stop: () => Promise<void>;
  isRunning: () => boolean;
}

export interface StartTelegramPollingOptions extends TelegramServiceOverrides, HandleUpdateOptions {
  timeoutSeconds?: number;
  errorBackoffBaseMs?: number;
}

export function startTelegramPolling(
  db: Db,
  options?: StartTelegramPollingOptions,
): TelegramPollingController {
  let isRunning = true;
  let nextOffset = 0;
  let currentAbortController: AbortController | null = null;
  let pollingPromise: Promise<void> | null = null;

  const botToken = options?.botToken ?? process.env.TELEGRAM_BOT_TOKEN;
  const apiBaseUrl = options?.apiBaseUrl ?? process.env.TELEGRAM_API_BASE_URL;
  const timeoutSeconds = options?.timeoutSeconds ?? 25;
  const baseBackoff = options?.errorBackoffBaseMs ?? 2000;

  async function pollLoop() {
    process.stdout.write('[Telegram Bot] Initializing long-polling mode...\n');

    // Remove any registered webhook so Telegram permits getUpdates
    try {
      const delRes = await deleteTelegramWebhook({ botToken, apiBaseUrl });
      if (!delRes.ok && delRes.description) {
        process.stderr.write(`[Telegram Bot] Notice on deleteWebhook: ${delRes.description}\n`);
      }
    } catch (err) {
      process.stderr.write(`[Telegram Bot] Warning: Failed to clean webhook before polling: ${String(err)}\n`);
    }

    process.stdout.write('[Telegram Bot] Long-polling active. Listening for messages & commands...\n');

    let consecutiveErrors = 0;

    while (isRunning) {
      try {
        currentAbortController = new AbortController();

        const updates = await getTelegramUpdates({
          offset: nextOffset,
          timeout: timeoutSeconds,
          botToken,
          apiBaseUrl,
          signal: currentAbortController.signal,
        });

        consecutiveErrors = 0;

        for (const update of updates) {
          if (!isRunning) break;
          if (typeof update?.update_id === 'number') {
            nextOffset = Math.max(nextOffset, update.update_id + 1);
          }

          try {
            await handleTelegramUpdate(update, db, options);
          } catch (handlerErr) {
            process.stderr.write(
              `[Telegram Bot] Error handling update ${update?.update_id}: ${String(handlerErr)}\n`,
            );
          }
        }
      } catch (err: any) {
        if (!isRunning) break;
        if (err?.name === 'AbortError') break;

        consecutiveErrors++;
        const backoff = Math.min(30000, baseBackoff * Math.pow(2, Math.min(consecutiveErrors - 1, 4)));
        process.stderr.write(
          `[Telegram Bot] Polling error (${consecutiveErrors}): ${err?.message || String(err)}. Retrying in ${backoff}ms...\n`,
        );

        await new Promise((resolve) => setTimeout(resolve, backoff));
      } finally {
        currentAbortController = null;
      }
    }

    process.stdout.write('[Telegram Bot] Polling stopped cleanly.\n');
  }

  pollingPromise = pollLoop();

  return {
    async stop() {
      if (!isRunning) return;
      isRunning = false;
      if (currentAbortController) {
        try {
          currentAbortController.abort();
        } catch {
          // ignore abort errors
        }
      }
      if (pollingPromise) {
        await pollingPromise;
      }
    },
    isRunning() {
      return isRunning;
    },
  };
}
