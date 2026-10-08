import dotenv from 'dotenv';
import { setTelegramWebhook, getTelegramWebhookInfo } from '../telegram/telegramService.js';

dotenv.config();

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    process.stderr.write('Error: TELEGRAM_BOT_TOKEN environment variable is not set.\n');
    process.exit(1);
  }

  const rawArg = process.argv[2];
  let webhookUrl = rawArg || process.env.TELEGRAM_WEBHOOK_URL;

  if (!webhookUrl && process.env.SERVER_URL) {
    const base = process.env.SERVER_URL.replace(/\/+$/, '');
    webhookUrl = `${base}/api/telegram/webhook`;
  }

  if (!webhookUrl) {
    process.stderr.write('Usage: pnpm --filter @flagora/server run bot:set-webhook <https://your-domain.com/api/telegram/webhook>\n');
    process.stderr.write('Or set TELEGRAM_WEBHOOK_URL in your .env file.\n');
    process.exit(1);
  }

  if (!webhookUrl.startsWith('https://')) {
    process.stderr.write('⚠️ Telegram requires HTTPS for webhooks (e.g., https://your-server.com/api/telegram/webhook)\n');
  }

  const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;

  process.stdout.write(`Registering webhook with Telegram:\n   URL: ${webhookUrl}\n   Secret Token: ${secretToken ? 'Configured ✅' : 'None (Warning: production requires TELEGRAM_WEBHOOK_SECRET)'}\n\n`);

  const res = await setTelegramWebhook({
    url: webhookUrl,
    secretToken: secretToken || undefined,
    dropPendingUpdates: false,
  });

  if (res.ok) {
    process.stdout.write('🎉 Webhook registered successfully!\n');
    const info = await getTelegramWebhookInfo();
    if (info) {
      process.stdout.write(`   Active URL: ${info.url}\n`);
      process.stdout.write(`   Pending updates: ${info.pending_update_count}\n`);
    }
  } else {
    process.stderr.write(`❌ Failed to register webhook: ${res.description || 'Unknown error'}\n`);
    process.exit(1);
  }
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${String(err)}\n`);
  process.exit(1);
});
