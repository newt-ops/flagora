import { getBattleDeepLink, type BattleInfoResponse, type BattleWinner } from '@flagora/shared';

export type BattleViewerPerspective = 'won' | 'lost' | 'tie' | 'spectator';

interface TelegramWebApp {
  openTelegramLink?: (url: string) => void;
}

export function getBattleStartParam(
  search?: string,
  hash?: string,
  initData?: string,
): string | null {
  const currentSearch = search ?? (typeof window !== 'undefined' ? window.location.search : '');
  if (currentSearch) {
    const searchParams = new URLSearchParams(currentSearch);
    const directBattle = searchParams.get('battle');
    if (directBattle) {
      return directBattle.replace(/^battle_/, '');
    }
    const candidate =
      searchParams.get('startapp') ||
      searchParams.get('tgWebAppStartParam') ||
      searchParams.get('start_param');
    if (candidate?.startsWith('battle_')) {
      return candidate.slice('battle_'.length);
    }
  }

  const currentHash = hash ?? (typeof window !== 'undefined' ? window.location.hash : '');
  if (currentHash) {
    const rawHash = currentHash.startsWith('#') ? currentHash.slice(1) : currentHash;
    const hashParams = new URLSearchParams(rawHash);
    const directBattle = hashParams.get('battle');
    if (directBattle) {
      return directBattle.replace(/^battle_/, '');
    }
    const candidate =
      hashParams.get('tgWebAppStartParam') ||
      hashParams.get('startapp') ||
      hashParams.get('start_param');
    if (candidate?.startsWith('battle_')) {
      return candidate.slice('battle_'.length);
    }
    const tgWebAppData = hashParams.get('tgWebAppData');
    if (tgWebAppData) {
      const dataParams = new URLSearchParams(tgWebAppData);
      const dataBattle = dataParams.get('battle');
      if (dataBattle) {
        return dataBattle.replace(/^battle_/, '');
      }
      const dataCandidate = dataParams.get('start_param');
      if (dataCandidate?.startsWith('battle_')) {
        return dataCandidate.slice('battle_'.length);
      }
    }
  }

  const rawInitData =
    initData ??
    (typeof window !== 'undefined'
      ? (window as unknown as { Telegram?: { WebApp?: { initData?: string; initDataUnsafe?: { start_param?: string } } } })
          .Telegram?.WebApp?.initData
      : undefined);

  if (rawInitData) {
    const dataParams = new URLSearchParams(rawInitData);
    const candidate = dataParams.get('start_param');
    if (candidate?.startsWith('battle_')) {
      return candidate.slice('battle_'.length);
    }
  }

  if (typeof window !== 'undefined') {
    const unsafeParam = (
      window as unknown as { Telegram?: { WebApp?: { initDataUnsafe?: { start_param?: string } } } }
    ).Telegram?.WebApp?.initDataUnsafe?.start_param;
    if (unsafeParam?.startsWith('battle_')) {
      return unsafeParam.slice('battle_'.length);
    }
  }

  return null;
}

export function formatBattleShareText(): string {
  return 'Battle me live in Flagora! Who knows flags best?';
}

export function getTelegramBattleShareUrl(deepLink: string, text: string): string {
  return `https://t.me/share/url?url=${encodeURIComponent(deepLink)}&text=${encodeURIComponent(text)}`;
}

export function shareBattle(
  battleId: string,
  botUsername?: string,
): void {
  const deepLink = getBattleDeepLink(battleId, botUsername);
  const text = formatBattleShareText();
  const shareUrl = getTelegramBattleShareUrl(deepLink, text);

  const telegramWebApp = (
    typeof window !== 'undefined'
      ? (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp
      : undefined
  );

  if (typeof telegramWebApp?.openTelegramLink === 'function') {
    telegramWebApp.openTelegramLink(shareUrl);
  } else if (typeof window !== 'undefined' && typeof window.open === 'function') {
    window.open(shareUrl, '_blank');
  }
}

export async function copyBattleLink(
  battleId: string,
  botUsername?: string,
): Promise<boolean> {
  const deepLink = getBattleDeepLink(battleId, botUsername);
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(deepLink);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export function getBattleViewerPerspective(
  info: BattleInfoResponse | {
    winner?: BattleWinner | null;
    challengerUserId: number;
    opponentUserId?: number | null;
  },
  currentUserId: number,
): BattleViewerPerspective {
  if (!info.winner) {
    return 'spectator';
  }

  if (info.winner === 'tie') {
    return info.challengerUserId === currentUserId || info.opponentUserId === currentUserId
      ? 'tie'
      : 'spectator';
  }

  const isViewerChallenger = info.challengerUserId === currentUserId;
  const isViewerOpponent = info.opponentUserId === currentUserId;

  if (isViewerChallenger) {
    return info.winner === 'challenger' ? 'won' : 'lost';
  }

  if (isViewerOpponent) {
    return info.winner === 'opponent' ? 'won' : 'lost';
  }

  return 'spectator';
}

export function getBattlePerspectiveHeading(
  perspective: BattleViewerPerspective,
  winnerName?: string,
): {
  title: string;
  subtitle: string;
  badgeClass: string;
} {
  switch (perspective) {
    case 'won':
      return {
        title: 'Victory!',
        subtitle: 'You won the live battle!',
        badgeClass: 'bg-tg-button/15 text-tg-button ring-tg-button/30',
      };
    case 'lost':
      return {
        title: 'Defeat!',
        subtitle: 'Better luck in the next battle!',
        badgeClass: 'bg-tg-destructive/15 text-tg-destructive ring-tg-destructive/30',
      };
    case 'tie':
      return {
        title: "It's a Tie!",
        subtitle: 'Both players tied in the live battle!',
        badgeClass: 'bg-tg-button/15 text-tg-button ring-tg-button/30',
      };
    case 'spectator':
    default:
      return {
        title: winnerName ? `${winnerName} Won!` : 'Live Battle Completed',
        subtitle: 'Head-to-head battle finished',
        badgeClass: 'bg-tg-button/15 text-tg-button ring-tg-button/30',
      };
  }
}

export function getInitials(name?: string | null): string {
  if (!name || name.trim().length === 0) {
    return 'P';
  }
  const clean = name.replace(/^@/, '').trim();
  return clean.length > 0 ? clean.charAt(0).toUpperCase() : 'P';
}

export interface RankBadgeInfo {
  medal: string;
  label: string;
  bgClass: string;
  textClass: string;
  stepHeightClass: string;
}

export function getRankBadge(rank: number): RankBadgeInfo {
  switch (rank) {
    case 1:
      return {
        medal: '🥇',
        label: '1st Place',
        bgClass: 'bg-amber-400/20',
        textClass: 'text-amber-300',
        stepHeightClass: 'h-36',
      };
    case 2:
      return {
        medal: '🥈',
        label: '2nd Place',
        bgClass: 'bg-slate-300/20',
        textClass: 'text-slate-200',
        stepHeightClass: 'h-28',
      };
    case 3:
      return {
        medal: '🥉',
        label: '3rd Place',
        bgClass: 'bg-amber-700/20',
        textClass: 'text-amber-500',
        stepHeightClass: 'h-20',
      };
    default:
      return {
        medal: `#${rank}`,
        label: `${rank}th Place`,
        bgClass: 'bg-tg-secondary-bg',
        textClass: 'text-tg-hint',
        stepHeightClass: 'h-16',
      };
  }
}

export function formatGroupVictoryShareText(
  podium: Array<{ rank: number; displayName: string; score: number; pinsEarned?: number }>,
  currentUserName?: string,
): string {
  let text = `🏆 FLAGORA GROUP BATTLE RESULTS! 🚩\n\n`;
  podium.slice(0, 5).forEach((p) => {
    const medal = p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : p.rank === 3 ? '🥉' : `#${p.rank}`;
    const meMarker = currentUserName && p.displayName === currentUserName ? ' (You)' : '';
    text += `${medal} ${p.displayName}${meMarker} — ${p.score} pts\n`;
  });
  text += `\nThink you can beat me? Join the next battle! ⚔️`;
  return text;
}

