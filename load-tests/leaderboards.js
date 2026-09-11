import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, TARGET_VUS, getJsonHeaders } from './helpers/config.js';
import { getVirtualUserToken } from './helpers/auth.js';

export const options = {
  stages: [
    { duration: '30s', target: Math.max(1, Math.floor(TARGET_VUS * 0.25)) },
    { duration: '1m', target: TARGET_VUS },
    { duration: '2m', target: TARGET_VUS },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    'http_req_duration{endpoint:leaderboard_top}': ['p(95)<80', 'p(99)<150'],
    'http_req_duration{endpoint:leaderboard_me}': ['p(95)<80'],
    'http_req_duration{endpoint:daily_leaderboard}': ['p(95)<80'],
    'http_req_duration{endpoint:daily_status}': ['p(95)<80'],
    http_req_failed: ['rate<0.005'],
  },
};

export default function () {
  const { token } = getVirtualUserToken(__VU);
  const headers = getJsonHeaders(token);

  const topRes = http.get(`${BASE_URL}/api/leaderboard/top?limit=50`, {
    headers,
    tags: { endpoint: 'leaderboard_top' },
  });
  check(topRes, {
    'leaderboard top status is 200': (r) => r.status === 200,
    'leaderboard top returns array': (r) => Array.isArray(r.json()),
  });

  const meRes = http.get(`${BASE_URL}/api/leaderboard/me`, {
    headers,
    tags: { endpoint: 'leaderboard_me' },
  });
  check(meRes, {
    'leaderboard me status is 200': (r) => r.status === 200,
  });

  const dailyLbRes = http.get(`${BASE_URL}/api/daily/leaderboard?limit=50`, {
    headers,
    tags: { endpoint: 'daily_leaderboard' },
  });
  check(dailyLbRes, {
    'daily leaderboard status is 200': (r) => r.status === 200,
  });

  const dailyStatusRes = http.get(`${BASE_URL}/api/daily/status`, {
    headers,
    tags: { endpoint: 'daily_status' },
  });
  check(dailyStatusRes, {
    'daily status response is 200': (r) => r.status === 200,
  });

  sleep(0.2);
}
