import type { ChallengeInfoResponse } from '@flagora/shared';

export type ChallengeViewerPerspective = 'won' | 'lost' | 'tie' | 'spectator';

export function getChallengeStartParam(
  search?: string,
  hash?: string,
  initData?: string,
): string | null {
  const currentSearch = search ?? (typeof window !== 'undefined' ? window.location.search : '');
  if (currentSearch) {
    const searchParams = new URLSearchParams(currentSearch);
    const candidate =
      searchParams.get('startapp') ||
      searchParams.get('tgWebAppStartParam') ||
      searchParams.get('start_param');
    if (candidate && !candidate.startsWith('battle_')) {
      return candidate;
    }
  }

  const currentHash = hash ?? (typeof window !== 'undefined' ? window.location.hash : '');
  if (currentHash) {
    const rawHash = currentHash.startsWith('#') ? currentHash.slice(1) : currentHash;
    const hashParams = new URLSearchParams(rawHash);
    const candidate =
      hashParams.get('tgWebAppStartParam') ||
      hashParams.get('startapp') ||
      hashParams.get('start_param');
    if (candidate && !candidate.startsWith('battle_')) {
      return candidate;
    }
    const tgWebAppData = hashParams.get('tgWebAppData');
    if (tgWebAppData) {
      const dataParams = new URLSearchParams(tgWebAppData);
      const dataCandidate = dataParams.get('start_param');
      if (dataCandidate && !dataCandidate.startsWith('battle_')) {
        return dataCandidate;
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
    if (candidate && !candidate.startsWith('battle_')) {
      return candidate;
    }
  }

  if (typeof window !== 'undefined') {
    const unsafeParam = (
      window as unknown as { Telegram?: { WebApp?: { initDataUnsafe?: { start_param?: string } } } }
    ).Telegram?.WebApp?.initDataUnsafe?.start_param;
    if (unsafeParam && !unsafeParam.startsWith('battle_')) {
      return unsafeParam;
    }
  }

  return null;
}

export function getChallengeViewerPerspective(
  info: ChallengeInfoResponse,
  currentUserId: number,
): ChallengeViewerPerspective {
  if (info.status !== 'completed' || !info.winner) {
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

export function getPerspectiveHeading(
  perspective: ChallengeViewerPerspective,
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
        subtitle: 'You won the challenge!',
        badgeClass: 'bg-emerald-500/20 text-emerald-400 ring-emerald-500/30',
      };
    case 'lost':
      return {
        title: 'Defeat!',
        subtitle: 'Better luck next time!',
        badgeClass: 'bg-rose-500/20 text-rose-400 ring-rose-500/30',
      };
    case 'tie':
      return {
        title: "It's a Tie!",
        subtitle: 'Both players achieved identical scores!',
        badgeClass: 'bg-tg-button/15 text-tg-button ring-tg-button/30',
      };
    case 'spectator':
    default:
      return {
        title: winnerName ? `${winnerName} Won!` : 'Challenge Completed',
        subtitle: 'Head-to-head match finished',
        badgeClass: 'bg-tg-button/15 text-tg-button ring-tg-button/30',
      };
  }
}

export function isChallengeAcceptable(info: ChallengeInfoResponse): boolean {
  return info.isOpen && !info.isChallenger && info.status === 'pending';
}

export function getInitials(name?: string | null): string {
  if (!name || name.trim().length === 0) {
    return 'P';
  }
  const clean = name.replace(/^@/, '').trim();
  return clean.length > 0 ? clean.charAt(0).toUpperCase() : 'P';
}
