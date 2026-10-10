import type { Db } from 'mongodb';
import { getDisplayName, type PlayerProfile, type BattleSession } from '@flagora/shared';
import {
  sendTelegramMessage,
  editTelegramMessage,
  answerCallbackQuery,
  answerPreCheckoutQuery,
  type InlineKeyboardButton,
} from './telegramService.js';
import { registerReferralSignup } from '../referral/referralService.js';
import { processSuccessfulPayment } from '../subscription/subscriptionService.js';
import {
  createGroupLobby,
  joinGroupLobby,
  leaveGroupLobby,
  cancelGroupLobby,
  startGroupBattle,
} from '../battle/groupBattleService.js';
import {
  LobbyFullError,
  BattleAlreadyJoinedError,
  BattleAlreadyStartedError,
} from '../battle/battleTypes.js';

export function formatGroupLobbyMessage(battle: BattleSession): {
  text: string;
  inlineKeyboard: InlineKeyboardButton[][];
} {
  const participants = battle.participants ?? [];
  const maxPlayers = battle.maxPlayers ?? 5;
  const isFull = participants.length >= maxPlayers;
  const host = participants.find((p) => p.userId === battle.hostUserId) || participants[0];
  const hostName = host?.displayName ?? 'Host';

  let text = `⚔️ <b>FLAGORA GROUP BATTLE</b> 🚩\n\n`;
  text += `👑 <b>Host:</b> ${hostName}\n`;
  text += `🎯 <b>Capacity:</b> ${participants.length}/${maxPlayers} Players ${isFull ? '<i>(FULL)</i>' : ''}\n`;
  text += `⏳ <b>Status:</b> Waiting for players (10m TTL)\n\n`;
  text += `👥 <b>Roster (${participants.length}):</b>\n`;
  participants.forEach((p, index) => {
    const isCrown = p.userId === battle.hostUserId ? ' 👑' : '';
    text += `${index + 1}. <b>${p.displayName}</b>${isCrown}\n`;
  });
  text += `\n<i>${isFull ? 'Lobby is full! Host can launch anytime.' : 'Tap Join to enter the battle lobby!'}</i>`;

  const inlineKeyboard: InlineKeyboardButton[][] = [
    [
      {
        text: `🚩 Join (${participants.length}/${maxPlayers})`,
        callback_data: `gb_join:${battle.battleId}`,
      },
      { text: '🚪 Leave', callback_data: `gb_leave:${battle.battleId}` },
    ],
    [
      { text: '🚀 Launch Battle ⚔️', callback_data: `gb_start:${battle.battleId}` },
      { text: '❌ Cancel', callback_data: `gb_cancel:${battle.battleId}` },
    ],
  ];

  return { text, inlineKeyboard };
}

export interface HandleUpdateOptions {
  rawUsername?: string;
  frontendUrl?: string;
  botToken?: string;
  apiBaseUrl?: string;
}

export interface HandleUpdateResult {
  handled: boolean;
  action?: string;
  error?: string;
}

export function buildMainMenuKeyboard(frontendUrl: string): InlineKeyboardButton[][] {
  return [
    [{ text: '🚀 Launch Flagora', web_app: { url: frontendUrl } }],
    [
      { text: '🎮 Game Modes', callback_data: 'menu_play' },
      { text: '📊 My Stats', callback_data: 'menu_stats' },
    ],
    [
      { text: '🏆 Leaderboard', callback_data: 'menu_leaderboard' },
      { text: '🎁 Invite (+100 🪙)', callback_data: 'menu_invite' },
    ],
    [{ text: '❓ How to Play', callback_data: 'menu_help' }],
  ];
}

export async function handleTelegramUpdate(
  update: any,
  db: Db,
  options?: HandleUpdateOptions,
): Promise<HandleUpdateResult> {
  const rawUsername =
    options?.rawUsername ||
    process.env.TELEGRAM_BOT_USERNAME ||
    process.env.BOT_USERNAME ||
    'flagora_bot';
  const cleanUsername = rawUsername.replace(/^@/, '');
  const frontendUrl =
    options?.frontendUrl ||
    process.env.CLIENT_URL ||
    process.env.FRONTEND_URL ||
    'https://flagora-delta.vercel.app';
  const botToken = options?.botToken;
  const apiBaseUrl = options?.apiBaseUrl;

  try {
    if (!update || typeof update !== 'object') {
      return { handled: false, action: 'ignored_invalid_payload' };
    }

    // 1. Callback query handling
    if (update.callback_query) {
      const callbackQuery = update.callback_query;
      const data = callbackQuery.data;
      const msg = callbackQuery.message;
      const fromUser = callbackQuery.from;
      const chatId = msg?.chat?.id;
      const messageId = msg?.message_id;

      if (callbackQuery.id) {
        await answerCallbackQuery(callbackQuery.id, undefined, undefined, botToken, apiBaseUrl);
      }

      if (!chatId || !messageId) {
        return { handled: true, action: 'callback_query_missing_chat' };
      }

      const mainMenuKeyboard = buildMainMenuKeyboard(frontendUrl);

      if (data === 'menu_main') {
        const welcomeText = `🌍 <b>Welcome to Flagora!</b> 🚩\n\nTest your geography knowledge across 194 flags! Guess countries, beat streaks, and battle live opponents.\n\nChoose an option below:`;
        await editTelegramMessage({
          chatId,
          messageId,
          text: welcomeText,
          parseMode: 'HTML',
          inlineKeyboard: mainMenuKeyboard,
          botToken,
          apiBaseUrl,
        });
      } else if (data === 'menu_play') {
        const playText = `🎮 <b>Flagora Game Modes:</b>\n\n• <b>Solo Run:</b> 10 flags, 60s timer, combo multipliers\n• <b>Daily Challenge:</b> Same flag set for all players daily\n• <b>Live Battle:</b> Real-time 1v1 flag duel with live score syncing\n• <b>Custom Mode:</b> Pick your continent, flag count & custom time!\n\nTap below to play:`;
        await editTelegramMessage({
          chatId,
          messageId,
          text: playText,
          parseMode: 'HTML',
          inlineKeyboard: [
            [{ text: '🚀 Play Now', web_app: { url: frontendUrl } }],
            [{ text: '« Back to Menu', callback_data: 'menu_main' }],
          ],
          botToken,
          apiBaseUrl,
        });
      } else if (data === 'menu_stats') {
        const profile = fromUser?.id
          ? await db.collection<PlayerProfile>('profiles').findOne({ telegramUserId: Number(fromUser.id) })
          : null;
        const statsText = profile
          ? `📊 <b>Your Flagora Stats:</b>\n\n👤 <b>Name:</b> ${getDisplayName(profile)}\n⭐ <b>Level:</b> ${profile.level}\n✨ <b>XP:</b> ${profile.xp}\n🪙 <b>Pins:</b> ${profile.pins}\n🔥 <b>Current Streak:</b> ${profile.currentStreak} days\n🏆 <b>Best Score:</b> ${profile.bestScore}\n🎮 <b>Games Played:</b> ${profile.gamesPlayed}\n👥 <b>Friends Invited:</b> ${profile.referralCount ?? 0}`
          : `📊 <b>Your Flagora Stats:</b>\n\nYou haven't played yet! Tap Launch Flagora to start your journey.`;
        await editTelegramMessage({
          chatId,
          messageId,
          text: statsText,
          parseMode: 'HTML',
          inlineKeyboard: [
            [{ text: '🚀 Open Flagora', web_app: { url: frontendUrl } }],
            [{ text: '« Back to Menu', callback_data: 'menu_main' }],
          ],
          botToken,
          apiBaseUrl,
        });
      } else if (data === 'menu_leaderboard') {
        const topPlayers = await db
          .collection<PlayerProfile>('profiles')
          .find()
          .sort({ bestScore: -1 })
          .limit(5)
          .toArray();
        let lbText = `🏆 <b>Flagora Top Players:</b>\n\n`;
        if (topPlayers.length === 0) {
          lbText += `No records yet. Be the first to reach the top!\n`;
        } else {
          topPlayers.forEach((p, i) => {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
            lbText += `${medal} <b>${getDisplayName(p)}</b> — ${p.bestScore} pts (Lvl ${p.level})\n`;
          });
        }
        lbText += `\nClimb the ranks in Daily Challenges and Solo Runs!`;
        await editTelegramMessage({
          chatId,
          messageId,
          text: lbText,
          parseMode: 'HTML',
          inlineKeyboard: [
            [
              {
                text: '🚀 View Full Leaderboard',
                web_app: { url: `${frontendUrl}#leaderboard` },
              },
            ],
            [{ text: '« Back to Menu', callback_data: 'menu_main' }],
          ],
          botToken,
          apiBaseUrl,
        });
      } else if (data === 'menu_invite') {
        const userId = fromUser?.id ?? chatId;
        const inviteLink = `https://t.me/${cleanUsername}?start=ref_${userId}`;
        const shareText = encodeURIComponent(
          'Join me on Flagora and test your flag knowledge in live battles! 🚩🌍',
        );
        const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${shareText}`;
        const inviteText = `🎁 <b>Invite Friends & Earn Rewards!</b>\n\nInvite your friends to Flagora and earn <b>+100 Pins</b> 🪙 for each friend who joins!\nYour friend also gets a <b>+50 Pin</b> welcome bonus.\n\n🔗 <b>Your Personal Invite Link:</b>\n<code>${inviteLink}</code>`;
        await editTelegramMessage({
          chatId,
          messageId,
          text: inviteText,
          parseMode: 'HTML',
          inlineKeyboard: [
            [{ text: '📤 Share to Telegram', url: shareUrl }],
            [{ text: '« Back to Menu', callback_data: 'menu_main' }],
          ],
          botToken,
          apiBaseUrl,
        });
      } else if (data === 'menu_help') {
        const helpText = `❓ <b>How to Play Flagora:</b>\n\n1. <b>Identify the Flag:</b> Look at the country flag shown.\n2. <b>Select Country:</b> Pick the correct name among 4 options.\n3. <b>Build Combos:</b> Fast consecutive correct answers earn multiplier points!\n4. <b>Live Battles:</b> 1v1 real-time flag duel against friends or random opponents.\n\nHave fun and explore the world! 🚩`;
        await editTelegramMessage({
          chatId,
          messageId,
          text: helpText,
          parseMode: 'HTML',
          inlineKeyboard: [
            [{ text: '🚀 Start Playing', web_app: { url: frontendUrl } }],
            [{ text: '« Back to Menu', callback_data: 'menu_main' }],
          ],
          botToken,
          apiBaseUrl,
        });
      } else if (data && typeof data === 'string' && data.startsWith('gb_preset:')) {
        const parts = data.split(':');
        const limit = parseInt(parts[1], 10) || 5;
        const hostUserId = Number(fromUser?.id ?? 0);
        const hostName = fromUser?.first_name || fromUser?.username || 'Host';

        if (hostUserId) {
          const lobby = await createGroupLobby(
            {
              chatId: Number(chatId),
              hostUserId,
              hostDisplayName: hostName,
              hostPhotoUrl: null,
              maxPlayers: limit,
            },
            db,
          );
          const { text, inlineKeyboard } = formatGroupLobbyMessage(lobby);
          await editTelegramMessage({
            chatId,
            messageId,
            text,
            parseMode: 'HTML',
            inlineKeyboard,
            botToken,
            apiBaseUrl,
          });
        }
      } else if (data && typeof data === 'string' && data.startsWith('gb_join:')) {
        const battleId = data.replace('gb_join:', '');
        const userId = Number(fromUser?.id ?? 0);
        const userName = fromUser?.first_name || fromUser?.username || 'Player';

        if (userId) {
          try {
            const updated = await joinGroupLobby(
              {
                battleId,
                userId,
                telegramUserId: userId,
                displayName: userName,
                photoUrl: null,
              },
              db,
            );
            const { text, inlineKeyboard } = formatGroupLobbyMessage(updated);
            await editTelegramMessage({
              chatId,
              messageId,
              text,
              parseMode: 'HTML',
              inlineKeyboard,
              botToken,
              apiBaseUrl,
            });
            if (callbackQuery.id) {
              await answerCallbackQuery(callbackQuery.id, '✅ You joined the battle!', false, botToken, apiBaseUrl);
            }
          } catch (err: unknown) {
            let alertMsg = '⚠️ Could not join battle';
            if (err instanceof LobbyFullError) {
              alertMsg = '⚠️ Sorry, this battle lobby is full!';
            } else if (err instanceof BattleAlreadyJoinedError) {
              alertMsg = 'ℹ️ You are already in this battle!';
            } else if (err instanceof BattleAlreadyStartedError) {
              alertMsg = '⚠️ Battle has already started!';
            }
            if (callbackQuery.id) {
              await answerCallbackQuery(callbackQuery.id, alertMsg, true, botToken, apiBaseUrl);
            }
          }
        }
      } else if (data && typeof data === 'string' && data.startsWith('gb_leave:')) {
        const battleId = data.replace('gb_leave:', '');
        const userId = Number(fromUser?.id ?? 0);

        if (userId) {
          try {
            const updated = await leaveGroupLobby(battleId, userId, db);
            if (updated && updated.status !== 'expired') {
              const { text, inlineKeyboard } = formatGroupLobbyMessage(updated);
              await editTelegramMessage({
                chatId,
                messageId,
                text,
                parseMode: 'HTML',
                inlineKeyboard,
                botToken,
                apiBaseUrl,
              });
            } else {
              await editTelegramMessage({
                chatId,
                messageId,
                text: '❌ <b>Battle lobby canceled because the host left.</b>',
                parseMode: 'HTML',
                botToken,
                apiBaseUrl,
              });
            }
            if (callbackQuery.id) {
              await answerCallbackQuery(callbackQuery.id, 'You left the battle lobby.', false, botToken, apiBaseUrl);
            }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Could not leave lobby';
            if (callbackQuery.id) {
              await answerCallbackQuery(callbackQuery.id, msg, true, botToken, apiBaseUrl);
            }
          }
        }
      } else if (data && typeof data === 'string' && data.startsWith('gb_start:')) {
        const battleId = data.replace('gb_start:', '');
        const userId = Number(fromUser?.id ?? 0);

        if (userId) {
          const battle = await db.collection<BattleSession>('battles').findOne({ battleId });
          if (!battle) {
            if (callbackQuery.id) {
              await answerCallbackQuery(callbackQuery.id, '⚠️ Battle not found', true, botToken, apiBaseUrl);
            }
          } else if (battle.hostUserId !== userId) {
            if (callbackQuery.id) {
              await answerCallbackQuery(callbackQuery.id, '⚠️ Only the host can launch the battle!', true, botToken, apiBaseUrl);
            }
          } else if ((battle.participants?.length ?? 0) < 2) {
            if (callbackQuery.id) {
              await answerCallbackQuery(callbackQuery.id, '⚠️ Need at least 2 players to start!', true, botToken, apiBaseUrl);
            }
          } else {
            try {
              await startGroupBattle(battleId, userId, db);
              const launchText = `⚔️ <b>BATTLE LAUNCHED!</b> 🚀\n\nAll joined players, enter the battle arena now!\n⏱️ <b>Time Limit:</b> 60 seconds\n\n<i>Tap below to play:</i>`;
              const launchKeyboard: InlineKeyboardButton[][] = [
                [
                  {
                    text: '🎮 ENTER BATTLE NOW 🚩',
                    web_app: { url: `${frontendUrl}?startapp=battle_${battleId}` },
                  },
                ],
              ];
              await editTelegramMessage({
                chatId,
                messageId,
                text: launchText,
                parseMode: 'HTML',
                inlineKeyboard: launchKeyboard,
                botToken,
                apiBaseUrl,
              });
              if (callbackQuery.id) {
                await answerCallbackQuery(callbackQuery.id, '🚀 Battle launched!', false, botToken, apiBaseUrl);
              }
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : 'Could not launch battle';
              if (callbackQuery.id) {
                await answerCallbackQuery(callbackQuery.id, msg, true, botToken, apiBaseUrl);
              }
            }
          }
        }
      } else if (data && typeof data === 'string' && data.startsWith('gb_cancel:')) {
        const battleId = data.replace('gb_cancel:', '');
        const userId = Number(fromUser?.id ?? 0);

        if (userId) {
          const battle = await db.collection<BattleSession>('battles').findOne({ battleId });
          if (!battle) {
            if (callbackQuery.id) {
              await answerCallbackQuery(callbackQuery.id, '⚠️ Battle not found', true, botToken, apiBaseUrl);
            }
          } else if (battle.hostUserId !== userId) {
            if (callbackQuery.id) {
              await answerCallbackQuery(callbackQuery.id, '⚠️ Only the host can cancel the lobby!', true, botToken, apiBaseUrl);
            }
          } else {
            await cancelGroupLobby(battleId, userId, db);
            await editTelegramMessage({
              chatId,
              messageId,
              text: '❌ <b>Battle lobby canceled by host.</b>',
              parseMode: 'HTML',
              botToken,
              apiBaseUrl,
            });
            if (callbackQuery.id) {
              await answerCallbackQuery(callbackQuery.id, 'Battle lobby canceled.', false, botToken, apiBaseUrl);
            }
          }
        }
      }

      return { handled: true, action: `callback_query_${data}` };
    }

    // 2. Pre-checkout query handling (Telegram Stars payments)
    if (update.pre_checkout_query) {
      const query = update.pre_checkout_query;
      const isStars = !query.currency || query.currency === 'XTR';
      const isProPayload =
        !query.invoice_payload ||
        (typeof query.invoice_payload === 'string' && query.invoice_payload.startsWith('pro_sub_'));
      if (isStars && isProPayload) {
        await answerPreCheckoutQuery(query.id, true, undefined, botToken, apiBaseUrl);
      } else {
        await answerPreCheckoutQuery(query.id, false, 'Invalid currency or payment payload', botToken, apiBaseUrl);
      }
      return { handled: true, action: 'pre_checkout_query' };
    }

    const message = update.message;

    // 3. Successful payment handling
    if (message?.successful_payment) {
      const payment = message.successful_payment;
      const telegramUserId = Number(message.from?.id);
      const chargeId = payment.telegram_payment_charge_id;
      const isStars = !payment.currency || payment.currency === 'XTR';
      const isProPayload =
        !payment.invoice_payload ||
        (typeof payment.invoice_payload === 'string' && payment.invoice_payload.startsWith('pro_sub_'));

      if (telegramUserId && chargeId && isStars && isProPayload) {
        try {
          const processedCol = db.collection('processed_payments');
          let alreadyProcessed = false;
          try {
            await processedCol.insertOne({
              chargeId,
              telegramUserId,
              createdAt: new Date(),
            });
          } catch (dupErr: unknown) {
            const mongoErr = dupErr as { code?: number };
            if (mongoErr?.code === 11000) {
              alreadyProcessed = true;
            } else {
              throw dupErr;
            }
          }

          if (!alreadyProcessed) {
            await processSuccessfulPayment(telegramUserId, chargeId, db);
            void sendTelegramMessage({
              chatId: telegramUserId,
              text: '⭐ Welcome to Flagora Pro! Your verified checkmark is now active next to your name.',
              botToken,
              apiBaseUrl,
            });
          }
        } catch (e) {
          const errMessage = e instanceof Error ? e.message : String(e);
          process.stderr.write(`Warning: Failed to process successful payment: ${errMessage}\n`);
        }
      }
      return { handled: true, action: 'successful_payment' };
    }

    // 4. Message text commands
    if (message?.text && typeof message.text === 'string') {
      const chatId = Number(message.chat.id);
      const text = message.text.trim();
      const parts = text.split(/\s+/);
      const rawCmd = parts[0] || '';
      // Normalizes /start@FlagoraBot -> /start
      const command = rawCmd.split('@')[0].toLowerCase();
      const startParam = parts[1];

      if (command === '/start') {
        if (startParam && startParam.startsWith('ref_')) {
          const refUserId = Number(startParam.replace(/^ref_/, ''));
          if (refUserId && refUserId !== chatId) {
            try {
              await registerReferralSignup(refUserId, chatId, db);
            } catch (refErr) {
              const msg = refErr instanceof Error ? refErr.message : String(refErr);
              process.stderr.write(`Warning: Failed to register referral signup: ${msg}\n`);
            }
          }
        }

        const webAppUrl = startParam
          ? `${frontendUrl}?startapp=${encodeURIComponent(startParam)}`
          : frontendUrl;

        const welcomeText = `🌍 <b>Welcome to Flagora!</b> 🚩\n\nTest your geography knowledge across 194 flags! Guess countries, beat streaks, and battle live opponents.\n\nChoose an option below:`;

        const startKeyboard = buildMainMenuKeyboard(webAppUrl);

        await sendTelegramMessage({
          chatId,
          text: welcomeText,
          parseMode: 'HTML',
          inlineKeyboard: startKeyboard,
          botToken,
          apiBaseUrl,
        });

        return { handled: true, action: 'command_start' };
      }

      if (command === '/help') {
        const helpText = `❓ <b>How to Play Flagora:</b>\n\n1. <b>Identify the Flag:</b> Look at the country flag shown.\n2. <b>Select Country:</b> Pick the correct name among 4 options.\n3. <b>Build Combos:</b> Fast consecutive correct answers earn multiplier points!\n4. <b>Live Battles:</b> 1v1 real-time flag duel against friends or random opponents.\n\nHave fun and explore the world! 🚩`;
        await sendTelegramMessage({
          chatId,
          text: helpText,
          parseMode: 'HTML',
          inlineKeyboard: [
            [{ text: '🚀 Start Playing', web_app: { url: frontendUrl } }],
            [{ text: '« Main Menu', callback_data: 'menu_main' }],
          ],
          botToken,
          apiBaseUrl,
        });
        return { handled: true, action: 'command_help' };
      }

      if (command === '/play') {
        const playText = `🎮 <b>Flagora Game Modes:</b>\n\n• <b>Solo Run:</b> 10 flags, 60s timer, combo multipliers\n• <b>Daily Challenge:</b> Same flag set for all players daily\n• <b>Live Battle:</b> Real-time 1v1 flag duel with live score syncing\n• <b>Custom Mode:</b> Pick your continent, flag count & custom time!\n\nTap below to launch:`;
        await sendTelegramMessage({
          chatId,
          text: playText,
          parseMode: 'HTML',
          inlineKeyboard: [
            [{ text: '🚀 Play Now', web_app: { url: frontendUrl } }],
            [{ text: '« Main Menu', callback_data: 'menu_main' }],
          ],
          botToken,
          apiBaseUrl,
        });
        return { handled: true, action: 'command_play' };
      }

      if (command === '/stats') {
        const profile = await db.collection<PlayerProfile>('profiles').findOne({ telegramUserId: chatId });
        const statsText = profile
          ? `📊 <b>Your Flagora Stats:</b>\n\n👤 <b>Name:</b> ${getDisplayName(profile)}\n⭐ <b>Level:</b> ${profile.level}\n✨ <b>XP:</b> ${profile.xp}\n🪙 <b>Pins:</b> ${profile.pins}\n🔥 <b>Current Streak:</b> ${profile.currentStreak} days\n🏆 <b>Best Score:</b> ${profile.bestScore}\n🎮 <b>Games Played:</b> ${profile.gamesPlayed}\n👥 <b>Friends Invited:</b> ${profile.referralCount ?? 0}`
          : `📊 <b>Your Flagora Stats:</b>\n\nYou haven't played yet! Tap Launch Flagora to start your journey.`;
        await sendTelegramMessage({
          chatId,
          text: statsText,
          parseMode: 'HTML',
          inlineKeyboard: [
            [{ text: '🚀 Open Flagora', web_app: { url: frontendUrl } }],
            [{ text: '« Main Menu', callback_data: 'menu_main' }],
          ],
          botToken,
          apiBaseUrl,
        });
        return { handled: true, action: 'command_stats' };
      }

      if (command === '/leaderboard') {
        const topPlayers = await db
          .collection<PlayerProfile>('profiles')
          .find()
          .sort({ bestScore: -1 })
          .limit(5)
          .toArray();
        let lbText = `🏆 <b>Flagora Top Players:</b>\n\n`;
        if (topPlayers.length === 0) {
          lbText += `No records yet. Be the first to reach the top!\n`;
        } else {
          topPlayers.forEach((p, i) => {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
            lbText += `${medal} <b>${getDisplayName(p)}</b> — ${p.bestScore} pts (Lvl ${p.level})\n`;
          });
        }
        lbText += `\nClimb the ranks in Daily Challenges and Solo Runs!`;
        await sendTelegramMessage({
          chatId,
          text: lbText,
          parseMode: 'HTML',
          inlineKeyboard: [
            [
              {
                text: '🚀 View Full Leaderboard',
                web_app: { url: `${frontendUrl}#leaderboard` },
              },
            ],
            [{ text: '« Main Menu', callback_data: 'menu_main' }],
          ],
          botToken,
          apiBaseUrl,
        });
        return { handled: true, action: 'command_leaderboard' };
      }

      if (command === '/invite') {
        const inviteLink = `https://t.me/${cleanUsername}?start=ref_${chatId}`;
        const shareText = encodeURIComponent(
          'Join me on Flagora and test your flag knowledge in live battles! 🚩🌍',
        );
        const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${shareText}`;
        const inviteText = `🎁 <b>Invite Friends & Earn Rewards!</b>\n\nInvite your friends to Flagora and earn <b>+100 Pins</b> 🪙 for each friend who joins!\nYour friend also gets a <b>+50 Pin</b> welcome bonus.\n\n🔗 <b>Your Personal Invite Link:</b>\n<code>${inviteLink}</code>`;
        await sendTelegramMessage({
          chatId,
          text: inviteText,
          parseMode: 'HTML',
          inlineKeyboard: [
            [{ text: '📤 Share to Telegram', url: shareUrl }],
            [{ text: '« Main Menu', callback_data: 'menu_main' }],
          ],
          botToken,
          apiBaseUrl,
        });
        return { handled: true, action: 'command_invite' };
      }

      if (command === '/battle') {
        const chatType = message.chat?.type;
        const fromUserId = Number(message.from?.id ?? 0);
        const fromName = message.from?.first_name || message.from?.username || 'Host';

        if (chatType === 'private') {
          const infoText = `⚔️ <b>Flagora Group Battles!</b> 🚩\n\nTo play live multiplayer battles with friends:\n1. Add @${cleanUsername} to your Telegram group\n2. Type <code>/battle</code> in the group\n3. Choose your battle limit & duel in real time!\n\nOr launch a 1v1 battle below:`;
          await sendTelegramMessage({
            chatId,
            text: infoText,
            parseMode: 'HTML',
            inlineKeyboard: [
              [{ text: '🚀 Play 1v1 Battle', web_app: { url: frontendUrl } }],
              [{ text: '« Main Menu', callback_data: 'menu_main' }],
            ],
            botToken,
            apiBaseUrl,
          });
          return { handled: true, action: 'command_battle_private' };
        }

        // Group or supergroup chat
        const parsedLimit = parseInt(parts[1], 10);
        if (!isNaN(parsedLimit) && parsedLimit >= 2 && parsedLimit <= 20) {
          const lobby = await createGroupLobby(
            {
              chatId,
              hostUserId: fromUserId,
              hostDisplayName: fromName,
              hostPhotoUrl: null,
              maxPlayers: parsedLimit,
            },
            db,
          );
          const { text: lobbyText, inlineKeyboard } = formatGroupLobbyMessage(lobby);
          await sendTelegramMessage({
            chatId,
            text: lobbyText,
            parseMode: 'HTML',
            inlineKeyboard,
            botToken,
            apiBaseUrl,
          });
          return { handled: true, action: 'command_battle_group_created' };
        }

        // Send preset limit selector
        const presetText = `⚔️ <b>Flagora Group Battle</b> 🚩\n\nChoose player capacity for this battle:`;
        const presetKeyboard: InlineKeyboardButton[][] = [
          [
            { text: '👥 2 Players (Duel)', callback_data: 'gb_preset:2' },
            { text: '⚔️ 5 Players (Squad)', callback_data: 'gb_preset:5' },
          ],
          [
            { text: '🏆 10 Players (Party)', callback_data: 'gb_preset:10' },
            { text: '🎲 15 Players (Large)', callback_data: 'gb_preset:15' },
          ],
        ];

        await sendTelegramMessage({
          chatId,
          text: presetText,
          parseMode: 'HTML',
          inlineKeyboard: presetKeyboard,
          botToken,
          apiBaseUrl,
        });
        return { handled: true, action: 'command_battle_preset_picker' };
      }

      return { handled: false, action: 'unknown_command' };
    }

    return { handled: false, action: 'unhandled_update_type' };
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[Telegram Update] Handler error: ${errMessage}\n`);
    return { handled: false, error: errMessage };
  }
}
