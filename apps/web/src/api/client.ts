import type {
  PlayerProfile,
  SessionResponse,
  ProfileResponse,
  StartRunResponse,
  AnswerRunResponse,
  FinishRunResponse,
  LeaderboardEntry,
  LeaderboardMeResponse,
  DailyChallengeStatusResponse,
  DailyLeaderboardResponse,
  CreateChallengeResponse,
  AcceptChallengeResponse,
  ChallengeInfoResponse,
  CreateBattleResponse,
  BattleInfoResponse,
  JoinBattleResponse,
  StreakStatusResponse,
  BonusCoinsIntentSuccessResponse,
  BonusCoinsRedeemSuccessResponse,
  StreakSaveIntentSuccessResponse,
  StreakSaveRedeemSuccessResponse,
  ShopCatalogResponse,
  PurchaseResponse,
  EquipResponse,
  RankStatusResponse,
  RankedLeaderboardResponse,
} from '@flagora/shared';

const API_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || 'http://localhost:3001';

export class TimeExpiredApiError extends Error {
  constructor(message = 'Time has expired for this run') {
    super(message);
    this.name = 'TimeExpiredApiError';
  }
}

export class RewardCapReachedApiError extends Error {
  readonly dailyCap: number;
  readonly usedCount: number;
  readonly resetAtUtc?: string;

  constructor(message: string, dailyCap: number, usedCount: number, resetAtUtc?: string) {
    super(message);
    this.name = 'RewardCapReachedApiError';
    this.dailyCap = dailyCap;
    this.usedCount = usedCount;
    this.resetAtUtc = resetAtUtc;
  }
}

export class StreakNotAtRiskApiError extends Error {
  constructor(message = 'Streak is not at risk') {
    super(message);
    this.name = 'StreakNotAtRiskApiError';
  }
}

export async function exchangeSession(initData: string): Promise<SessionResponse> {
  const response = await fetch(`${API_URL}/api/session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Telegram-Init-Data': initData,
    },
  });

  if (!response.ok) {
    let message = `Session exchange failed with status ${response.status}`;
    try {
      const data = await response.json();
      if (data?.message) {
        message = data.message;
      }
    } catch {
      void 0;
    }
    throw new Error(message);
  }

  return response.json();
}

export async function fetchProfile(sessionToken: string): Promise<PlayerProfile> {
  const response = await fetch(`${API_URL}/api/profile/me`, {
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
  });

  if (!response.ok) {
    let message = `Profile fetch failed with status ${response.status}`;
    try {
      const data = await response.json();
      if (data?.message) {
        message = data.message;
      }
    } catch {
      void 0;
    }
    throw new Error(message);
  }

  const data: ProfileResponse = await response.json();
  return data.profile;
}

export interface StartRunOptions {
  continent?: string;
  flagCount?: number;
  durationSeconds?: number;
}

export async function startRun(
  sessionToken: string,
  options?: StartRunOptions,
): Promise<StartRunResponse> {
  const response = await fetch(`${API_URL}/api/runs/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionToken}`,
    },
    body: options ? JSON.stringify(options) : undefined,
  });

  if (!response.ok) {
    let message = `Start run failed with status ${response.status}`;
    try {
      const data = await response.json();
      if (data?.message) {
        message = data.message;
      }
    } catch {
      void 0;
    }
    throw new Error(message);
  }

  return response.json();
}

export async function answerRun(
  sessionToken: string,
  runId: string,
  flagIndex: number,
  selectedIsoCode: string,
): Promise<AnswerRunResponse> {
  const response = await fetch(`${API_URL}/api/runs/${runId}/answer`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionToken}`,
    },
    body: JSON.stringify({ flagIndex, selectedIsoCode }),
  });

  if (!response.ok) {
    let message = `Answer failed with status ${response.status}`;
    let isExpired = false;
    try {
      const data = await response.json();
      if (data?.message) {
        message = data.message;
      }
      if (data?.timeExpired) {
        isExpired = true;
      }
    } catch {
      void 0;
    }

    if (isExpired) {
      throw new TimeExpiredApiError(message);
    }

    throw new Error(message);
  }

  return response.json();
}

export async function finishRun(
  sessionToken: string,
  runId: string,
): Promise<FinishRunResponse> {
  const response = await fetch(`${API_URL}/api/runs/${runId}/finish`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionToken}`,
    },
  });

  if (!response.ok) {
    let message = `Finish run failed with status ${response.status}`;
    try {
      const data = await response.json();
      if (data?.message) {
        message = data.message;
      }
    } catch {
      void 0;
    }
    throw new Error(message);
  }

  return response.json();
}

export async function getLeaderboardTop(
  sessionToken: string,
  limit = 50,
): Promise<LeaderboardEntry[]> {
  const response = await fetch(`${API_URL}/api/leaderboard/top?limit=${limit}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
  });

  if (!response.ok) {
    let message = `Failed to fetch leaderboard: status ${response.status}`;
    try {
      const data = await response.json();
      if (data?.message) {
        message = data.message;
      }
    } catch {
      void 0;
    }
    throw new Error(message);
  }

  return response.json();
}

export async function getLeaderboardMe(
  sessionToken: string,
): Promise<LeaderboardMeResponse> {
  const response = await fetch(`${API_URL}/api/leaderboard/me`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
  });

  if (!response.ok) {
    let message = `Failed to fetch player rank: status ${response.status}`;
    try {
      const data = await response.json();
      if (data?.message) {
        message = data.message;
      }
    } catch {
      void 0;
    }
    throw new Error(message);
  }

  return response.json();
}

export async function startDailyRun(
  sessionToken: string,
): Promise<StartRunResponse> {
  const response = await fetch(`${API_URL}/api/daily/start`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
  });

  if (!response.ok) {
    let message = `Failed to start daily challenge: status ${response.status}`;
    try {
      const data = await response.json();
      if (data?.message) {
        message = data.message;
      }
    } catch {
      void 0;
    }
    throw new Error(message);
  }

  return response.json();
}

export async function getDailyStatus(
  sessionToken: string,
): Promise<DailyChallengeStatusResponse> {
  const response = await fetch(`${API_URL}/api/daily/status`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
  });

  if (!response.ok) {
    let message = `Failed to fetch daily challenge status: status ${response.status}`;
    try {
      const data = await response.json();
      if (data?.message) {
        message = data.message;
      }
    } catch {
      void 0;
    }
    throw new Error(message);
  }

  return response.json();
}

export async function getDailyLeaderboard(
  sessionToken: string,
  limit = 50,
): Promise<DailyLeaderboardResponse> {
  const response = await fetch(`${API_URL}/api/daily/leaderboard?limit=${limit}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
  });

  if (!response.ok) {
    let message = `Failed to fetch daily leaderboard: status ${response.status}`;
    try {
      const data = await response.json();
      if (data?.message) {
        message = data.message;
      }
    } catch {
      void 0;
    }
    throw new Error(message);
  }

  return response.json();
}

export async function createChallenge(
  sessionToken: string,
): Promise<CreateChallengeResponse> {
  const response = await fetch(`${API_URL}/api/challenges`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
  });

  if (!response.ok) {
    let message = `Failed to create challenge: status ${response.status}`;
    try {
      const data = await response.json();
      if (data?.message) {
        message = data.message;
      }
    } catch {
      void 0;
    }
    throw new Error(message);
  }

  return response.json();
}

export async function getChallengeInfo(
  sessionToken: string,
  challengeId: string,
): Promise<ChallengeInfoResponse> {
  const response = await fetch(`${API_URL}/api/challenges/${encodeURIComponent(challengeId)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
  });

  if (!response.ok) {
    let message = `Failed to fetch challenge info: status ${response.status}`;
    try {
      const data = await response.json();
      if (data?.message) {
        message = data.message;
      }
    } catch {
      void 0;
    }
    throw new Error(message);
  }

  return response.json();
}

export async function acceptChallenge(
  sessionToken: string,
  challengeId: string,
): Promise<AcceptChallengeResponse> {
  const response = await fetch(`${API_URL}/api/challenges/${encodeURIComponent(challengeId)}/accept`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
  });

  if (!response.ok) {
    let message = `Failed to accept challenge: status ${response.status}`;
    try {
      const data = await response.json();
      if (data?.message) {
        message = data.message;
      }
    } catch {
      void 0;
    }
    throw new Error(message);
  }

  return response.json();
}

export async function rematchChallenge(
  sessionToken: string,
  challengeId: string,
): Promise<CreateChallengeResponse> {
  const response = await fetch(`${API_URL}/api/challenges/${encodeURIComponent(challengeId)}/rematch`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
  });

  if (!response.ok) {
    let message = `Failed to create rematch: status ${response.status}`;
    try {
      const data = await response.json();
      if (data?.message) {
        message = data.message;
      }
    } catch {
      void 0;
    }
    throw new Error(message);
  }

  return response.json();
}

export async function createBattle(
  sessionToken: string,
): Promise<CreateBattleResponse> {
  const response = await fetch(`${API_URL}/api/battles`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
  });

  if (!response.ok) {
    let message = `Failed to create battle: status ${response.status}`;
    try {
      const data = await response.json();
      if (data?.message) {
        message = data.message;
      }
    } catch {
      void 0;
    }
    throw new Error(message);
  }

  return response.json();
}

export async function getBattleInfo(
  sessionToken: string,
  battleId: string,
): Promise<BattleInfoResponse> {
  const response = await fetch(`${API_URL}/api/battles/${encodeURIComponent(battleId)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
  });

  if (!response.ok) {
    let message = `Failed to get battle: status ${response.status}`;
    try {
      const data = await response.json();
      if (data?.message) {
        message = data.message;
      }
    } catch {
      void 0;
    }
    throw new Error(message);
  }

  return response.json();
}

export async function joinBattle(
  sessionToken: string,
  battleId: string,
): Promise<JoinBattleResponse> {
  const response = await fetch(`${API_URL}/api/battles/${encodeURIComponent(battleId)}/join`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
  });

  if (!response.ok) {
    let message = `Failed to join battle: status ${response.status}`;
    try {
      const data = await response.json();
      if (data?.message) {
        message = data.message;
      }
    } catch {
      void 0;
    }
    throw new Error(message);
  }

  return response.json();
}

interface RewardErrorPayload {
  error?: string;
  message?: string;
  dailyCap?: number;
  usedCount?: number;
  resetAtUtc?: string;
}

export async function getStreakStatus(
  sessionToken: string,
): Promise<StreakStatusResponse> {
  const response = await fetch(`${API_URL}/api/streak/status`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
  });

  if (!response.ok) {
    let message = `Failed to get streak status: status ${response.status}`;
    try {
      const data: RewardErrorPayload = await response.json();
      if (data?.message) {
        message = data.message;
      }
    } catch {
      void 0;
    }
    throw new Error(message);
  }

  return response.json();
}

export async function requestBonusCoinsIntent(
  sessionToken: string,
): Promise<BonusCoinsIntentSuccessResponse> {
  const response = await fetch(`${API_URL}/api/rewards/bonus-coins/intent`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
  });

  if (!response.ok) {
    let message = `Failed to request bonus coins intent: status ${response.status}`;
    let body: RewardErrorPayload | null = null;
    try {
      body = await response.json();
      if (body?.message) {
        message = body.message;
      }
    } catch {
      void 0;
    }

    if (response.status === 429) {
      throw new RewardCapReachedApiError(
        message,
        body?.dailyCap ?? 5,
        body?.usedCount ?? 5,
        body?.resetAtUtc,
      );
    }

    throw new Error(message);
  }

  return response.json();
}

export async function redeemBonusCoins(
  sessionToken: string,
  token: string,
): Promise<BonusCoinsRedeemSuccessResponse> {
  const response = await fetch(`${API_URL}/api/rewards/bonus-coins/redeem`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionToken}`,
    },
    body: JSON.stringify({ token }),
  });

  if (!response.ok) {
    let message = `Failed to redeem bonus coins: status ${response.status}`;
    try {
      const data: RewardErrorPayload = await response.json();
      if (data?.message) {
        message = data.message;
      }
    } catch {
      void 0;
    }
    throw new Error(message);
  }

  return response.json();
}

export async function requestStreakSaveIntent(
  sessionToken: string,
): Promise<StreakSaveIntentSuccessResponse> {
  const response = await fetch(`${API_URL}/api/rewards/streak-save/intent`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
  });

  if (!response.ok) {
    let message = `Failed to request streak save intent: status ${response.status}`;
    let body: RewardErrorPayload | null = null;
    try {
      body = await response.json();
      if (body?.message) {
        message = body.message;
      }
    } catch {
      void 0;
    }

    if (response.status === 429) {
      throw new RewardCapReachedApiError(
        message,
        body?.dailyCap ?? 1,
        body?.usedCount ?? 1,
        body?.resetAtUtc,
      );
    }

    if (response.status === 400 && (message.includes('not at risk') || body?.error === 'Streak not at risk')) {
      throw new StreakNotAtRiskApiError(message);
    }

    throw new Error(message);
  }

  return response.json();
}

export async function redeemStreakSave(
  sessionToken: string,
  token: string,
): Promise<StreakSaveRedeemSuccessResponse> {
  const response = await fetch(`${API_URL}/api/rewards/streak-save/redeem`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionToken}`,
    },
    body: JSON.stringify({ token }),
  });

  if (!response.ok) {
    let message = `Failed to redeem streak save: status ${response.status}`;
    try {
      const data: RewardErrorPayload = await response.json();
      if (data?.message) {
        message = data.message;
      }
    } catch {
      void 0;
    }
    throw new Error(message);
  }

  return response.json();
}

export async function fetchShopCatalog(sessionToken: string): Promise<ShopCatalogResponse> {
  const response = await fetch(`${API_URL}/api/shop/catalog`, {
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
  });

  if (!response.ok) {
    let message = `Failed to fetch shop catalog: status ${response.status}`;
    try {
      const data = await response.json();
      if (data?.message) {
        message = data.message;
      }
    } catch {
      void 0;
    }
    throw new Error(message);
  }

  return response.json();
}

export async function purchaseCosmeticItem(
  sessionToken: string,
  itemId: string,
): Promise<PurchaseResponse> {
  const response = await fetch(`${API_URL}/api/shop/purchase`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionToken}`,
    },
    body: JSON.stringify({ itemId }),
  });

  if (!response.ok) {
    let message = `Failed to purchase item: status ${response.status}`;
    try {
      const data = await response.json();
      if (data?.message) {
        message = data.message;
      }
    } catch {
      void 0;
    }
    throw new Error(message);
  }

  return response.json();
}

export async function equipCosmeticItem(
  sessionToken: string,
  itemId: string,
): Promise<EquipResponse> {
  const response = await fetch(`${API_URL}/api/shop/equip`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionToken}`,
    },
    body: JSON.stringify({ itemId }),
  });

  if (!response.ok) {
    let message = `Failed to equip item: status ${response.status}`;
    try {
      const data = await response.json();
      if (data?.message) {
        message = data.message;
      }
    } catch {
      void 0;
    }
    throw new Error(message);
  }

  return response.json();
}

export async function fetchRankStatus(sessionToken: string): Promise<RankStatusResponse> {
  const response = await fetch(`${API_URL}/api/rank/status`, {
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
  });

  if (!response.ok) {
    let message = `Failed to fetch rank status: status ${response.status}`;
    try {
      const data = await response.json();
      if (data?.message) {
        message = data.message;
      }
    } catch {
      void 0;
    }
    throw new Error(message);
  }

  return response.json();
}

export async function fetchRankedLeaderboard(
  sessionToken: string,
  limit?: number,
): Promise<RankedLeaderboardResponse> {
  const url = limit ? `${API_URL}/api/rank/leaderboard?limit=${limit}` : `${API_URL}/api/rank/leaderboard`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
  });

  if (!response.ok) {
    let message = `Failed to fetch ranked leaderboard: status ${response.status}`;
    try {
      const data = await response.json();
      if (data?.message) {
        message = data.message;
      }
    } catch {
      void 0;
    }
    throw new Error(message);
  }

  return response.json();
}

