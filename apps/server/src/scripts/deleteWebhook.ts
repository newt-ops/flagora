import dotenv from 'dotenv';
import { deleteTelegramWebhook } from '../telegram/telegramService.js';

dotenv.config();

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    process.stderr.write('Error: TELEGRAM_BOT_TOKEN environment variable is not set.\n');
    process.exit(1);
  }

  process.stdout.write('Deleting Telegram webhook (switching to polling mode)...\n');

  const res = await deleteTelegramWebhook({ dropPendingUpdates: false });
  if (res.ok) {
    process.stdout.write('🎉 Webhook deleted successfully! Telegram is now in polling mode.\n');
  } else {
    process.stderr.write(`❌ Failed to delete webhook: ${res.description || 'Unknown error'}\n`);
    process.exit(1);
  }
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${String(err)}\n`);
  process.exit(1);
});
