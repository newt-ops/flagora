import type { Db } from 'mongodb';
import {
  getDisplayName,
  getChallengeDeepLink,
  getBattleDeepLink,
  type Challenge,
  type PlayerProfile,
  type BattleSession,
} from '@flagora/shared';
import { enqueueTelegramNotification } from '../notifications/notificationQueue.js';

export interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
  web_app?: { url: string };
}

export interface SendTelegramMessageOptions {
  chatId: number | string;
  text: string;
  buttonText?: string;
  buttonUrl?: string;
  webAppUrl?: string;
  inlineKeyboard?: InlineKeyboardButton[][];
  parseMode?: 'HTML' | 'MarkdownV2';
  botToken?: string;
  apiBaseUrl?: string;
}

export interface EditTelegramMessageOptions {
  chatId: number | string;
  messageId: number;
  text: string;
  inlineKeyboard?: InlineKeyboardButton[][];
  parseMode?: 'HTML' | 'MarkdownV2';
  botToken?: string;
  apiBaseUrl?: string;
}

export interface TelegramServiceOverrides {
  botToken?: string;
  apiBaseUrl?: string;
  botUsername?: string;
}

export async function sendTelegramMessage(
  options: SendTelegramMessageOptions,
): Promise<boolean> {
  const token = options.botToken ?? process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    process.stderr.write('Warning: TELEGRAM_BOT_TOKEN is missing when sending message\n');
    return false;
  }

  const apiBaseUrl =
    options.apiBaseUrl ?? process.env.TELEGRAM_API_BASE_URL ?? 'https://api.telegram.org';
  const url = `${apiBaseUrl}/bot${token}/sendMessage`;

  const payload: Record<string, unknown> = {
    chat_id: options.chatId,
    text: options.text,
  };

  if (options.parseMode) {
    payload.parse_mode = options.parseMode;
  }

  if (options.inlineKeyboard) {
    payload.reply_markup = {
      inline_keyboard: options.inlineKeyboard,
    };
  } else if (options.buttonText && options.webAppUrl) {
    payload.reply_markup = {
      inline_keyboard: [
        [
          {
            text: options.buttonText,
            web_app: { url: options.webAppUrl },
          },
        ],
      ],
    };
  } else if (options.buttonText && options.buttonUrl) {
    payload.reply_markup = {
      inline_keyboard: [
        [
          {
            text: options.buttonText,
            url: options.buttonUrl,
          },
        ],
      ],
    };
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errorText = await res.text();
      process.stderr.write(
        `Warning: Failed to send Telegram message to ${options.chatId}: ${res.status} ${errorText}\n`,
      );
      return false;
    }

    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(
      `Warning: Telegram message network error to ${options.chatId}: ${message}\n`,
    );
    return false;
  }
}

export async function editTelegramMessage(
  options: EditTelegramMessageOptions,
): Promise<boolean> {
  const token = options.botToken ?? process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return false;
  }

  const apiBaseUrl =
    options.apiBaseUrl ?? process.env.TELEGRAM_API_BASE_URL ?? 'https://api.telegram.org';
  const url = `${apiBaseUrl}/bot${token}/editMessageText`;

  const payload: Record<string, unknown> = {
    chat_id: options.chatId,
    message_id: options.messageId,
    text: options.text,
  };

  if (options.parseMode) {
    payload.parse_mode = options.parseMode;
  }

  if (options.inlineKeyboard) {
    payload.reply_markup = {
      inline_keyboard: options.inlineKeyboard,
    };
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string,
  showAlert?: boolean,
  botToken?: string,
  apiBaseUrl?: string,
): Promise<boolean> {
  const token = botToken ?? process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;
  const base = apiBaseUrl ?? process.env.TELEGRAM_API_BASE_URL ?? 'https://api.telegram.org';

  try {
    const res = await fetch(`${base}/bot${token}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text,
        show_alert: showAlert,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function notifyChallengeCompletion(
  challengeId: string,
  db: Db,
  overrides?: TelegramServiceOverrides,
): Promise<void> {
  try {
    const challenge = await db.collection<Challenge>('challenges').findOne({ challengeId });
    if (!challenge || challenge.status !== 'completed' || !challenge.opponentUserId) {
      return;
    }

    const profilesCollection = db.collection<PlayerProfile>('profiles');
    const [challengerProfile, opponentProfile] = await Promise.all([
      profilesCollection.findOne({ telegramUserId: challenge.challengerUserId }),
      profilesCollection.findOne({ telegramUserId: challenge.opponentUserId }),
    ]);

    const challengerName = challengerProfile
      ? getDisplayName(challengerProfile)
      : `Player ${challenge.challengerUserId}`;
    const opponentName = opponentProfile
      ? getDisplayName(opponentProfile)
      : `Player ${challenge.opponentUserId}`;

    const challengerScore = challenge.challengerScore ?? 0;
    const opponentScore = challenge.opponentScore ?? 0;
    const winner = challenge.winner ?? 'tie';

    const rawUsername =
      overrides?.botUsername ?? process.env.TELEGRAM_BOT_USERNAME ?? process.env.BOT_USERNAME ?? 'flagora_bot';
    const botUsername = rawUsername.replace(/^@/, '');
    const deepLink = getChallengeDeepLink(challenge.challengeId, botUsername);

    let challengerText = '';
    let opponentText = '';

    if (winner === 'challenger') {
      challengerText = `You won the challenge against ${opponentName}! Your score: ${challengerScore} vs ${opponentScore}.\n\n<a href="${deepLink}">View Result</a>`;
      opponentText = `${challengerName} won the challenge! Your score: ${opponentScore} vs ${challengerScore}.\n\n<a href="${deepLink}">View Result</a>`;
    } else if (winner === 'opponent') {
      challengerText = `${opponentName} beat your score in the challenge! Your score: ${challengerScore} vs ${opponentScore}.\n\n<a href="${deepLink}">View Result</a>`;
      opponentText = `You won the challenge against ${challengerName}! Your score: ${opponentScore} vs ${challengerScore}.\n\n<a href="${deepLink}">View Result</a>`;
    } else {
      challengerText = `Your challenge against ${opponentName} ended in a tie! Both scored ${challengerScore} points.\n\n<a href="${deepLink}">View Result</a>`;
      opponentText = `Your challenge against ${challengerName} ended in a tie! Both scored ${opponentScore} points.\n\n<a href="${deepLink}">View Result</a>`;
    }

    await Promise.all([
      enqueueTelegramNotification({
        chatId: challenge.challengerUserId,
        text: challengerText,
        parseMode: 'HTML',
        buttonText: 'View Result',
        buttonUrl: deepLink,
        botToken: overrides?.botToken,
        apiBaseUrl: overrides?.apiBaseUrl,
      }),
      enqueueTelegramNotification({
        chatId: challenge.opponentUserId,
        text: opponentText,
        parseMode: 'HTML',
        buttonText: 'View Result',
        buttonUrl: deepLink,
        botToken: overrides?.botToken,
        apiBaseUrl: overrides?.apiBaseUrl,
      }),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Warning: Failed to complete challenge notifications: ${message}\n`);
  }
}

export async function notifyRematchInvitation(
  newChallengeId: string,
  targetUserId: number,
  requesterUserId: number,
  db: Db,
  overrides?: TelegramServiceOverrides,
): Promise<void> {
  try {
    const requesterProfile = await db
      .collection<PlayerProfile>('profiles')
      .findOne({ telegramUserId: requesterUserId });
    const requesterName = requesterProfile
      ? getDisplayName(requesterProfile)
      : `Player ${requesterUserId}`;

    const rawUsername =
      overrides?.botUsername ?? process.env.TELEGRAM_BOT_USERNAME ?? process.env.BOT_USERNAME ?? 'flagora_bot';
    const botUsername = rawUsername.replace(/^@/, '');
    const deepLink = getChallengeDeepLink(newChallengeId, botUsername);

    const message = `${requesterName} has challenged you to a rematch! Tap below to play.\n\n<a href="${deepLink}">Accept Rematch</a>`;

    await enqueueTelegramNotification({
      chatId: targetUserId,
      text: message,
      parseMode: 'HTML',
      buttonText: 'Accept Rematch',
      buttonUrl: deepLink,
      botToken: overrides?.botToken,
      apiBaseUrl: overrides?.apiBaseUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Warning: Failed to send rematch invitation: ${message}\n`);
  }
}

export async function notifyBattleCompletion(
  battleId: string,
  db: Db,
  overrides?: TelegramServiceOverrides,
): Promise<void> {
  try {
    const battle = await db.collection<BattleSession>('battles').findOne({ battleId });
    if (!battle || battle.status !== 'completed' || !battle.opponentUserId) {
      return;
    }

    const profilesCollection = db.collection<PlayerProfile>('profiles');
    const [challengerProfile, opponentProfile] = await Promise.all([
      profilesCollection.findOne({ telegramUserId: battle.challengerUserId }),
      profilesCollection.findOne({ telegramUserId: battle.opponentUserId }),
    ]);

    const challengerName = challengerProfile
      ? getDisplayName(challengerProfile)
      : `Player ${battle.challengerUserId}`;
    const opponentName = opponentProfile
      ? getDisplayName(opponentProfile)
      : `Player ${battle.opponentUserId}`;

    const challengerScore = battle.challengerScore ?? 0;
    const opponentScore = battle.opponentScore ?? 0;
    const winner = battle.winner ?? 'tie';

    const rawUsername =
      overrides?.botUsername ?? process.env.TELEGRAM_BOT_USERNAME ?? process.env.BOT_USERNAME ?? 'flagora_bot';
    const botUsername = rawUsername.replace(/^@/, '');
    const deepLink = getBattleDeepLink(battle.battleId, botUsername);

    let challengerText = '';
    let opponentText = '';

    if (winner === 'challenger') {
      challengerText = `🏆 <b>Live Battle Won!</b>\nYou defeated <b>${opponentName}</b>!\nScore: <b>${challengerScore}</b> vs <b>${opponentScore}</b>\n\n<a href="${deepLink}">View Match Details</a>`;
      opponentText = `⚔️ <b>Live Battle Finished</b>\n<b>${challengerName}</b> won the match.\nScore: <b>${challengerScore}</b> vs <b>${opponentScore}</b>\n\n<a href="${deepLink}">View Match Details</a>`;
    } else if (winner === 'opponent') {
      challengerText = `⚔️ <b>Live Battle Finished</b>\n<b>${opponentName}</b> won the match.\nScore: <b>${opponentScore}</b> vs <b>${challengerScore}</b>\n\n<a href="${deepLink}">View Match Details</a>`;
      opponentText = `🏆 <b>Live Battle Won!</b>\nYou defeated <b>${challengerName}</b>!\nScore: <b>${opponentScore}</b> vs <b>${challengerScore}</b>\n\n<a href="${deepLink}">View Match Details</a>`;
    } else {
      challengerText = `🤝 <b>Live Battle Tied!</b>\nBoth scored <b>${challengerScore}</b> against <b>${opponentName}</b>.\n\n<a href="${deepLink}">View Match Details</a>`;
      opponentText = `🤝 <b>Live Battle Tied!</b>\nBoth scored <b>${opponentScore}</b> against <b>${challengerName}</b>.\n\n<a href="${deepLink}">View Match Details</a>`;
    }

    await Promise.all([
      enqueueTelegramNotification({
        chatId: battle.challengerUserId,
        text: challengerText,
        parseMode: 'HTML',
        buttonText: 'View Match',
        buttonUrl: deepLink,
        botToken: overrides?.botToken,
        apiBaseUrl: overrides?.apiBaseUrl,
      }),
      enqueueTelegramNotification({
        chatId: battle.opponentUserId,
        text: opponentText,
        parseMode: 'HTML',
        buttonText: 'View Match',
        buttonUrl: deepLink,
        botToken: overrides?.botToken,
        apiBaseUrl: overrides?.apiBaseUrl,
      }),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Warning: Failed to send battle completion notifications: ${message}\n`);
  }
}

export async function notifyOpponentReady(
  battleId: string,
  readyUserId: number,
  db: Db,
  overrides?: TelegramServiceOverrides,
): Promise<void> {
  try {
    const battle = await db.collection<BattleSession>('battles').findOne({ battleId });
    if (!battle || battle.status !== 'ready') return;

    const targetUserId =
      battle.challengerUserId === readyUserId ? battle.opponentUserId : battle.challengerUserId;
    if (!targetUserId) return;

    const readyProfile = await db
      .collection<PlayerProfile>('profiles')
      .findOne({ telegramUserId: readyUserId });
    const readyName = readyProfile ? getDisplayName(readyProfile) : 'Your opponent';

    const rawUsername =
      overrides?.botUsername ?? process.env.TELEGRAM_BOT_USERNAME ?? process.env.BOT_USERNAME ?? 'flagora_bot';
    const botUsername = rawUsername.replace(/^@/, '');
    const deepLink = getBattleDeepLink(battleId, botUsername);

    const message = `⚡ <b>${readyName}</b> is ready for your Live Battle!\nTap below to start the countdown: <a href="${deepLink}">Launch Battle</a>`;

    await enqueueTelegramNotification({
      chatId: targetUserId,
      text: message,
      parseMode: 'HTML',
      buttonText: 'Join Battle',
      buttonUrl: deepLink,
      botToken: overrides?.botToken,
      apiBaseUrl: overrides?.apiBaseUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Warning: Failed to send opponent ready notification: ${message}\n`);
  }
}

export async function notifyReferralReward(
  referrerUserId: number,
  invitedName: string,
  db: Db,
  overrides?: TelegramServiceOverrides,
): Promise<void> {
  try {
    const message = `🎉 <b>New Referral Reward!</b>\n<b>${invitedName}</b> joined Flagora with your invite link.\nYou earned <b>+100 Coins</b>! 🪙`;
    await enqueueTelegramNotification({
      chatId: referrerUserId,
      text: message,
      parseMode: 'HTML',
      botToken: overrides?.botToken,
      apiBaseUrl: overrides?.apiBaseUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Warning: Failed to send referral notification: ${message}\n`);
  }
}
