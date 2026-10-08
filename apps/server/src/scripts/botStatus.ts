import dotenv from 'dotenv';
import { getTelegramBotMe, getTelegramWebhookInfo } from '../telegram/telegramService.js';

dotenv.config();

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    process.stderr.write('Error: TELEGRAM_BOT_TOKEN environment variable is not set.\n');
    process.exit(1);
  }

  process.stdout.write('🔍 Checking Telegram Bot Status...\n\n');

  const me = await getTelegramBotMe();
  if (!me) {
    process.stderr.write('❌ Failed to connect to Telegram Bot API. Verify that TELEGRAM_BOT_TOKEN is correct.\n');
    process.exit(1);
  }

  process.stdout.write(`✅ Bot Connected:\n`);
  process.stdout.write(`   • Name: ${me.first_name}\n`);
  process.stdout.write(`   • Username: @${me.username || 'unknown'}\n`);
  process.stdout.write(`   • Bot ID: ${me.id}\n\n`);

  const info = await getTelegramWebhookInfo();
  if (!info) {
    process.stderr.write('❌ Failed to retrieve Webhook info.\n');
    process.exit(1);
  }

  process.stdout.write(`📡 Webhook Status:\n`);
  if (!info.url) {
    process.stdout.write(`   • Mode: Long-Polling (No Webhook registered)\n`);
    process.stdout.write(`   • Pending Updates in Queue: ${info.pending_update_count}\n`);
    process.stdout.write(`\n💡 To receive /start via webhook in production, run:\n   pnpm --filter @flagora/server run bot:set-webhook <YOUR_PUBLIC_URL>/api/telegram/webhook\n`);
    process.stdout.write(`   Or enable polling locally by adding to .env:\n   TELEGRAM_USE_POLLING=true\n`);
  } else {
    process.stdout.write(`   • Mode: Webhook\n`);
    process.stdout.write(`   • Webhook URL: ${info.url}\n`);
    process.stdout.write(`   • Pending Updates in Queue: ${info.pending_update_count}\n`);
    process.stdout.write(`   • Custom Certificate: ${info.has_custom_certificate ? 'Yes' : 'No'}\n`);
    if (info.ip_address) {
      process.stdout.write(`   • Resolved IP: ${info.ip_address}\n`);
    }

    if (info.last_error_date) {
      const errorDate = new Date(info.last_error_date * 1000).toISOString();
      process.stdout.write(`\n⚠️ LAST TELEGRAM DELIVERY ERROR:\n`);
      process.stdout.write(`   • Time: ${errorDate}\n`);
      process.stdout.write(`   • Message: ${info.last_error_message}\n`);
      process.stdout.write(`\n👉 If the error mentions 401 Unauthorized, make sure TELEGRAM_WEBHOOK_SECRET matches the secret_token registered in Telegram!\n`);
    } else {
      process.stdout.write(`   • Health: No recent delivery errors reported by Telegram.\n`);
    }
  }
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${String(err)}\n`);
  process.exit(1);
});
