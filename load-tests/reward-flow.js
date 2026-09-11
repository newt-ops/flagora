import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';
import { BASE_URL, TARGET_VUS, getJsonHeaders } from './helpers/config.js';
import { getVirtualUserToken } from './helpers/auth.js';

const rateLimit429Counter = new Counter('expected_429_rate_limit');
const dailyCap429Counter = new Counter('expected_429_daily_cap');
const server500Counter = new Counter('server_500_errors');
const successfulRedemptionsCounter = new Counter('successful_redemptions');

export const options = {
  stages: [
    { duration: '20s', target: Math.max(2, Math.floor(TARGET_VUS * 0.2)) },
    { duration: '40s', target: Math.max(5, TARGET_VUS) },
    { duration: '20s', target: 0 },
  ],
  thresholds: {
    'http_req_duration{endpoint:reward_intent}': ['p(95)<120'],
    'http_req_duration{endpoint:reward_redeem}': ['p(95)<120'],
    server_500_errors: ['count==0'],
  },
};

export default function () {
  const { token } = getVirtualUserToken(__VU);
  const headers = getJsonHeaders(token);

  const intentRes = http.post(
    `${BASE_URL}/api/rewards/bonus-coins/intent`,
    JSON.stringify({}),
    {
      headers,
      tags: { endpoint: 'reward_intent' },
    },
  );

  if (intentRes.status === 200) {
    const rewardToken = intentRes.json('token');
    if (rewardToken) {
      const redeemRes = http.post(
        `${BASE_URL}/api/rewards/bonus-coins/redeem`,
        JSON.stringify({ token: rewardToken }),
        {
          headers,
          tags: { endpoint: 'reward_redeem' },
        },
      );

      if (redeemRes.status === 200) {
        successfulRedemptionsCounter.add(1);
      } else if (redeemRes.status === 429) {
        rateLimit429Counter.add(1);
      } else if (redeemRes.status >= 500) {
        server500Counter.add(1);
      }
    }
  } else if (intentRes.status === 429) {
    const errorBody = intentRes.json();
    if (errorBody?.error === 'Daily cap reached') {
      dailyCap429Counter.add(1);
    } else {
      rateLimit429Counter.add(1);
      check(intentRes, {
        'rate limit includes Retry-After header': (r) => Boolean(r.headers['Retry-After']),
      });
    }
  } else if (intentRes.status >= 500) {
    server500Counter.add(1);
  }

  const streakStatusRes = http.get(`${BASE_URL}/api/streak/status`, {
    headers,
    tags: { endpoint: 'streak_status' },
  });
  check(streakStatusRes, {
    'streak status returned': (r) => r.status === 200,
  });

  const streakIntentRes = http.post(
    `${BASE_URL}/api/rewards/streak-save/intent`,
    JSON.stringify({}),
    {
      headers,
      tags: { endpoint: 'streak_intent' },
    },
  );

  if (streakIntentRes.status === 429) {
    const body = streakIntentRes.json();
    if (body?.error === 'Daily cap reached') {
      dailyCap429Counter.add(1);
    } else {
      rateLimit429Counter.add(1);
    }
  } else if (streakIntentRes.status >= 500) {
    server500Counter.add(1);
  }

  sleep(0.3);
}
