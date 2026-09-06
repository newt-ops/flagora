import type {
  PlayerProfile,
  SessionResponse,
  ProfileResponse,
  StartRunResponse,
  AnswerRunResponse,
  FinishRunResponse,
} from '@flagora/shared';

const API_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || 'http://localhost:3001';

export class TimeExpiredApiError extends Error {
  constructor(message = 'Time has expired for this run') {
    super(message);
    this.name = 'TimeExpiredApiError';
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

export async function startRun(sessionToken: string): Promise<StartRunResponse> {
  const response = await fetch(`${API_URL}/api/runs/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionToken}`,
    },
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
