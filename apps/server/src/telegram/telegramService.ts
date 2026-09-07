import type { Db } from 'mongodb';
import {
  getDisplayName,
  getChallengeDeepLink,
  type Challenge,
  type PlayerProfile,
} from '@flagora/shared';

export interface SendTelegramMessageOptions {
  chatId: number;
  text: string;
  buttonText?: string;
  buttonUrl?: string;
  webAppUrl?: string;
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

  if (options.buttonText && options.webAppUrl) {
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
      challengerText = `You won the challenge against ${opponentName}! Your score: ${challengerScore} vs ${opponentScore}.`;
      opponentText = `${challengerName} won the challenge! Your score: ${opponentScore} vs ${challengerScore}.`;
    } else if (winner === 'opponent') {
      challengerText = `${opponentName} beat your score in the challenge! Your score: ${challengerScore} vs ${opponentScore}.`;
      opponentText = `You won the challenge against ${challengerName}! Your score: ${opponentScore} vs ${challengerScore}.`;
    } else {
      challengerText = `Your challenge against ${opponentName} ended in a tie! Both scored ${challengerScore} points.`;
      opponentText = `Your challenge against ${challengerName} ended in a tie! Both scored ${opponentScore} points.`;
    }

    await Promise.all([
      sendTelegramMessage({
        chatId: challenge.challengerUserId,
        text: challengerText,
        buttonText: 'View Result',
        buttonUrl: deepLink,
        botToken: overrides?.botToken,
        apiBaseUrl: overrides?.apiBaseUrl,
      }),
      sendTelegramMessage({
        chatId: challenge.opponentUserId,
        text: opponentText,
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

    const message = `${requesterName} has challenged you to a rematch! Tap below to play.`;

    await sendTelegramMessage({
      chatId: targetUserId,
      text: message,
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
