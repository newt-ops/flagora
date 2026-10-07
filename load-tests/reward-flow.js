import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';
import { BASE_URL, TARGET_VUS, getJsonHeaders } from './helpers/config.js';
import { getVirtualUserToken } from './helpers/auth.js';

const rateLimit429Counter = new Counter('expected_429_rate_limit');
const dailyCap429Counter = new Counter('expected_429_daily_cap');
const server500Counter = new Counter('server_500_errors');
const successfulStreakSavesCounter = new Counter('successful_streak_saves');

export const options = {
  stages: [
    { duration: '20s', target: Math.max(2, Math.floor(TARGET_VUS * 0.2)) },
    { duration: '40s', target: Math.max(5, TARGET_VUS) },
    { duration: '20s', target: 0 },
  ],
  thresholds: {
    'http_req_duration{endpoint:streak_status}': ['p(95)<120'],
    'http_req_duration{endpoint:streak_save}': ['p(95)<120'],
    server_500_errors: ['count==0'],
  },
};

export default function () {
  const { token } = getVirtualUserToken(__VU);
  const headers = getJsonHeaders(token);

  const streakStatusRes = http.get(`${BASE_URL}/api/streak/status`, {
    headers,
    tags: { endpoint: 'streak_status' },
  });
  check(streakStatusRes, {
    'streak status returned': (r) => r.status === 200,
  });

  const streakSaveRes = http.post(
    `${BASE_URL}/api/streak/save`,
    JSON.stringify({}),
    {
      headers,
      tags: { endpoint: 'streak_save' },
    },
  );

  if (streakSaveRes.status === 200) {
    successfulStreakSavesCounter.add(1);
  } else if (streakSaveRes.status === 429) {
    const body = streakSaveRes.json();
    if (body?.error === 'Daily cap reached' || body?.code === 'DAILY_CAP_REACHED') {
      dailyCap429Counter.add(1);
    } else {
      rateLimit429Counter.add(1);
    }
  } else if (streakSaveRes.status >= 500) {
    server500Counter.add(1);
  }

  sleep(0.3);
}
