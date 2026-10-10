import type { Db } from 'mongodb';
import type { Redis as RedisClient } from 'ioredis';
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
import type { TypedSocketServer } from '../multiplayer/socketTypes.js';

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
  io?: TypedSocketServer;
  redis?: RedisClient;
  botUserId?: number;
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

      let queryAnswered = false;
      const replyQuery = async (text?: string, showAlert?: boolean) => {
        if (!queryAnswered && callbackQuery.id) {
          queryAnswered = true;
          await answerCallbackQuery(callbackQuery.id, text, showAlert, botToken, apiBaseUrl);
        }
      };

      if (!chatId || !messageId) {
        await replyQuery();
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
        await replyQuery();
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
        await replyQuery();
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
        await replyQuery();
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
        await replyQuery();
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
        await replyQuery();
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
        await replyQuery();
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
          await replyQuery('Battle lobby created!');
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
            await replyQuery('✅ You joined the battle!', false);
          } catch (err: unknown) {
            let alertMsg = '⚠️ Could not join battle';
            if (err instanceof LobbyFullError) {
              alertMsg = '⚠️ Sorry, this battle lobby is full!';
            } else if (err instanceof BattleAlreadyJoinedError) {
              alertMsg = 'ℹ️ You are already in this battle!';
            } else if (err instanceof BattleAlreadyStartedError) {
              alertMsg = '⚠️ Battle has already started!';
            }
            await replyQuery(alertMsg, true);
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
                text: '❌ <b>Battle lobby canceled because the host left.</b>\nType /battle to start a new one.',
                parseMode: 'HTML',
                inlineKeyboard: [],
                botToken,
                apiBaseUrl,
              });
            }
            await replyQuery('You left the battle lobby.', false);
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Could not leave lobby';
            await replyQuery(`⚠️ ${msg}`, true);
          }
        }
      } else if (data && typeof data === 'string' && data.startsWith('gb_start:')) {
        const battleId = data.replace('gb_start:', '');
        const userId = Number(fromUser?.id ?? 0);

        if (userId) {
          const battle = await db.collection<BattleSession>('battles').findOne({ battleId });
          if (!battle) {
            await replyQuery('⚠️ Battle not found or expired', true);
          } else if (battle.hostUserId !== userId) {
            await replyQuery('⚠️ Only the host can launch the battle!', true);
          } else if ((battle.participants?.length ?? 0) < 2) {
            await replyQuery('⚠️ At least 2 players are needed to start! Ask group members to tap "🚩 Join".', true);
          } else {
            try {
              await startGroupBattle(battleId, userId, db, options?.redis, options?.io);
              const launchText = `⚔️ <b>BATTLE LAUNCHED!</b> 🚀\n\nAll joined players, enter the battle arena now!\n⏱️ <b>Time Limit:</b> 60 seconds\n\n<i>Tap below to enter:</i>`;
              const launchKeyboard: InlineKeyboardButton[][] = [
                [
                  {
                    text: '🎮 ENTER BATTLE NOW 🚩',
                    url: `https://t.me/${cleanUsername}?startapp=battle_${battleId}`,
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
              await replyQuery('🚀 Battle launched!', false);
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : 'Could not launch battle';
              await replyQuery(`⚠️ ${msg}`, true);
            }
          }
        }
      } else if (data && typeof data === 'string' && data.startsWith('gb_cancel:')) {
        const battleId = data.replace('gb_cancel:', '');
        const userId = Number(fromUser?.id ?? 0);

        if (userId) {
          const battle = await db.collection<BattleSession>('battles').findOne({ battleId });
          if (!battle) {
            await replyQuery('⚠️ Battle not found or already closed', true);
          } else if (battle.hostUserId !== userId && (battle.participants?.length ?? 0) > 1) {
            await replyQuery('⚠️ Only the host can cancel this battle lobby!', true);
          } else {
            await cancelGroupLobby(battleId, battle.hostUserId ?? userId, db);
            await editTelegramMessage({
              chatId,
              messageId,
              text: '❌ <b>Battle lobby canceled.</b>\nType /battle to start a new one.',
              parseMode: 'HTML',
              inlineKeyboard: [],
              botToken,
              apiBaseUrl,
            });
            await replyQuery('Lobby canceled.', false);
          }
        }
      }

      // Fallback answer if not answered yet
      if (!queryAnswered) {
        await replyQuery();
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

    // 3. New chat members (Bot added to group)
    const newMembers = message?.new_chat_members || (message?.new_chat_participant ? [message.new_chat_participant] : []);
    if (Array.isArray(newMembers) && newMembers.length > 0) {
      const isBotAdded = newMembers.some(
        (m: any) =>
          m?.is_bot &&
          (m?.username?.toLowerCase() === cleanUsername.toLowerCase() ||
            (options?.botUserId && m?.id === options?.botUserId)),
      );
      if (isBotAdded) {
        const chatId = Number(message.chat.id);
        const welcomeGroupText = `👋 <b>Hello everyone! I'm Flagora!</b> 🚩\n\nI host real-time multiplayer flag trivia battles right here in your group!\n\n⚔️ <b>Group Commands:</b>\n• <code>/battle</code> — Start a multiplayer flag battle\n• <code>/battle 5</code> — Custom player limit (e.g. 2, 5, 10)\n• <code>/help</code> — How to play\n• <code>/play</code> — Launch Flagora Mini App\n\nOr mention me anytime: @${cleanUsername} battle! 🏆`;
        await sendTelegramMessage({
          chatId,
          text: welcomeGroupText,
          parseMode: 'HTML',
          inlineKeyboard: [
            [{ text: '⚔️ Start Group Battle 🚩', callback_data: 'gb_preset:5' }],
            [{ text: '🎮 Open Flagora', url: `https://t.me/${cleanUsername}` }],
          ],
          botToken,
          apiBaseUrl,
        });
        return { handled: true, action: 'bot_added_to_group' };
      }
    }

    // 4. Successful Stars Payment
    if (message?.successful_payment) {
      const payment = message.successful_payment;
      const userId = Number(message.from?.id);
      const isStars = !payment.currency || payment.currency === 'XTR';
      const isProPayload =
        !payment.invoice_payload ||
        (typeof payment.invoice_payload === 'string' && payment.invoice_payload.startsWith('pro_sub_'));

      if (isStars && isProPayload && userId) {
        await processSuccessfulPayment(
          userId,
          payment.telegram_payment_charge_id,
          db,
        );

        await sendTelegramMessage({
          chatId: userId,
          text: `⭐ <b>Payment Confirmed!</b>\n\nThank you for subscribing to <b>Flagora Pro</b>!\n\n✨ <b>Your Perks Are Now Active:</b>\n• Verified Pro checkmark badge\n• Ad-free streak saver protection\n• Exclusive Pro player flair\n\nEnjoy the game! 🚩`,
          parseMode: 'HTML',
          inlineKeyboard: [[{ text: '🎮 Launch Flagora Pro', web_app: { url: frontendUrl } }]],
          botToken,
          apiBaseUrl,
        });
      }
      return { handled: true, action: 'successful_payment' };
    }

    // 5. Message text commands & mentions
    if (message?.text && typeof message.text === 'string') {
      const chatId = Number(message.chat.id);
      const chatType = message.chat?.type;
      const isGroup = chatType === 'group' || chatType === 'supergroup';
      const text = message.text.trim();
      const parts = text.split(/\s+/);
      const rawCmd = parts[0] || '';
      // Normalizes /start@FlagoraBot -> /start
      const command = rawCmd.split('@')[0].toLowerCase();
      const startParam = parts[1];

      const botMention = `@${cleanUsername}`.toLowerCase();
      const lowerText = text.toLowerCase();
      const isBotMentioned = lowerText.includes(botMention);

      // Handle mention in group chat (e.g. "@FlagoraBot" or "@FlagoraBot battle" or "@FlagoraBot help")
      if (isGroup && isBotMentioned) {
        if (lowerText.includes('battle')) {
          // Extract number if specified, e.g. "@FlagoraBot battle 5"
          const numberMatch = text.match(/\b([2-9]|1[0-5])\b/);
          const customLimit = numberMatch ? parseInt(numberMatch[1], 10) : undefined;
          if (customLimit && customLimit >= 2 && customLimit <= 20) {
            const fromUserId = Number(message.from?.id ?? 0);
            const fromName = message.from?.first_name || message.from?.username || 'Host';
            const lobby = await createGroupLobby(
              {
                chatId,
                hostUserId: fromUserId,
                hostDisplayName: fromName,
                hostPhotoUrl: null,
                maxPlayers: customLimit,
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
            return { handled: true, action: 'mention_battle_created' };
          }

          // Otherwise show preset capacity picker
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
          return { handled: true, action: 'mention_battle_preset_picker' };
        }

        // Mentioned for help or general call -> show Group Command Guide
        const groupGuideText = `👋 <b>Flagora Group Battle Bot</b> 🚩\n\nChallenge your friends in real-time flag trivia duels!\n\n⚔️ <b>Group Commands:</b>\n• <code>/battle</code> — Start a multiplayer battle\n• <code>/battle 5</code> — Set custom player limit (e.g. 2, 5, 10)\n• <code>/help</code> — How to play\n• <code>/play</code> — Open Flagora Mini App\n\n<i>Tap below to create a match:</i>`;
        await sendTelegramMessage({
          chatId,
          text: groupGuideText,
          parseMode: 'HTML',
          inlineKeyboard: [
            [{ text: '⚔️ Start Group Battle 🚩', callback_data: 'gb_preset:5' }],
            [{ text: '🎮 Open Flagora', url: `https://t.me/${cleanUsername}` }],
          ],
          botToken,
          apiBaseUrl,
        });
        return { handled: true, action: 'mention_group_guide' };
      }

      if (command === '/start') {
        if (isGroup) {
          const groupGuideText = `👋 <b>Flagora Group Battle Bot</b> 🚩\n\nChallenge your friends in real-time flag trivia duels!\n\n⚔️ <b>Group Commands:</b>\n• <code>/battle</code> — Start a multiplayer battle\n• <code>/battle 5</code> — Custom player limit (e.g. 2, 5, 10)\n• <code>/help</code> — How to play\n• <code>/play</code> — Open Flagora Mini App\n\n<i>Tap below to create a match:</i>`;
          await sendTelegramMessage({
            chatId,
            text: groupGuideText,
            parseMode: 'HTML',
            inlineKeyboard: [
              [{ text: '⚔️ Start Group Battle 🚩', callback_data: 'gb_preset:5' }],
              [{ text: '🎮 Open Flagora', url: `https://t.me/${cleanUsername}` }],
            ],
            botToken,
            apiBaseUrl,
          });
          return { handled: true, action: 'command_start_group' };
        }

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
        if (isGroup) {
          const helpGroupText = `❓ <b>How to Play in Groups:</b>\n\n1. Type <code>/battle</code> to open a new battle lobby.\n2. Group members tap <b>🚩 Join</b> to enter.\n3. The host taps <b>🚀 Launch Battle</b> when ready.\n4. Everyone races to answer 10 flags in 60s.\n5. Winners earn pin rewards & climb the victory podium! 🏆`;
          await sendTelegramMessage({
            chatId,
            text: helpGroupText,
            parseMode: 'HTML',
            inlineKeyboard: [
              [{ text: '⚔️ Start Battle 🚩', callback_data: 'gb_preset:5' }],
              [{ text: '🎮 Open Flagora', url: `https://t.me/${cleanUsername}` }],
            ],
            botToken,
            apiBaseUrl,
          });
          return { handled: true, action: 'command_help_group' };
        }

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
        if (isGroup) {
          await sendTelegramMessage({
            chatId,
            text: `🎮 <b>Play Flagora!</b>\n\nTap below to launch the game:`,
            parseMode: 'HTML',
            inlineKeyboard: [
              [{ text: '⚔️ Start Group Battle', callback_data: 'gb_preset:5' }],
              [{ text: '🎮 Open Flagora Solo', url: `https://t.me/${cleanUsername}` }],
            ],
            botToken,
            apiBaseUrl,
          });
          return { handled: true, action: 'command_play_group' };
        }

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

        const keyboard = isGroup
          ? [[{ text: '🎮 Open Flagora', url: `https://t.me/${cleanUsername}` }]]
          : [
              [
                {
                  text: '🚀 View Full Leaderboard',
                  web_app: { url: `${frontendUrl}#leaderboard` },
                },
              ],
              [{ text: '« Main Menu', callback_data: 'menu_main' }],
            ];

        await sendTelegramMessage({
          chatId,
          text: lbText,
          parseMode: 'HTML',
          inlineKeyboard: keyboard,
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
        const fromUserId = Number(message.from?.id ?? 0);
        const fromName = message.from?.first_name || message.from?.username || 'Host';

        if (!isGroup) {
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
