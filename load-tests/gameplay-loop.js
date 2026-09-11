import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, TARGET_VUS, getJsonHeaders } from './helpers/config.js';
import { getVirtualUserToken } from './helpers/auth.js';

export const options = {
  stages: [
    { duration: '30s', target: Math.max(1, Math.floor(TARGET_VUS * 0.2)) },
    { duration: '1m', target: Math.max(2, Math.floor(TARGET_VUS * 0.6)) },
    { duration: '2m', target: TARGET_VUS },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    'http_req_duration{endpoint:run_start}': ['p(95)<250'],
    'http_req_duration{endpoint:run_answer}': ['p(95)<100'],
    'http_req_duration{endpoint:run_finish}': ['p(95)<250'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const { token } = getVirtualUserToken(__VU);
  const headers = getJsonHeaders(token);

  const startRes = http.post(
    `${BASE_URL}/api/runs/start`,
    JSON.stringify({}),
    {
      headers,
      tags: { endpoint: 'run_start' },
    },
  );

  const startOk = check(startRes, {
    'run start status is 200': (r) => r.status === 200,
    'run start returns runId': (r) => Boolean(r.json('id')),
  });

  if (!startOk) {
    sleep(1);
    return;
  }

  const run = startRes.json();
  const runId = run.id;
  const flags = run.flags || [];

  for (let i = 0; i < flags.length; i++) {
    sleep(0.5 + Math.random() * 1.5);

    const flag = flags[i];
    const selectedIsoCode = flag.choices?.[0] || flag.isoCode || 'fr';

    const answerRes = http.post(
      `${BASE_URL}/api/runs/${runId}/answer`,
      JSON.stringify({
        flagIndex: i,
        selectedIsoCode,
      }),
      {
        headers,
        tags: { endpoint: 'run_answer' },
      },
    );

    check(answerRes, {
      'answer status is 200': (r) => r.status === 200,
    });
  }

  sleep(0.5);

  const finishRes = http.post(
    `${BASE_URL}/api/runs/${runId}/finish`,
    JSON.stringify({}),
    {
      headers,
      tags: { endpoint: 'run_finish' },
    },
  );

  check(finishRes, {
    'finish status is 200': (r) => r.status === 200,
    'finish returns score': (r) => typeof r.json('finalScore') === 'number',
  });

  sleep(1);
}
