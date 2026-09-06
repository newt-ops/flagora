import type { PlayerProfile, SessionResponse, ProfileResponse } from '@flagora/shared';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

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
