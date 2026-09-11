import { WebSocket } from 'k6/websockets';
import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';
import { BASE_URL, WS_URL, TARGET_VUS, getJsonHeaders } from './helpers/config.js';
import { createSessionToken } from './helpers/auth.js';

const battlesCompletedCounter = new Counter('battles_completed');
const battleErrorsCounter = new Counter('battle_errors');

export const options = {
  stages: [
    { duration: '20s', target: Math.max(2, Math.floor(TARGET_VUS * 0.2)) },
    { duration: '40s', target: Math.max(4, Math.floor(TARGET_VUS * 0.5)) },
    { duration: '20s', target: 0 },
  ],
  thresholds: {
    ws_connecting: ['p(95)<200'],
    battles_completed: ['count>0'],
    battle_errors: ['count==0'],
  },
};

export default function () {
  const challengerId = 200000 + (__VU * 2);
  const opponentId = challengerId + 1;

  const challengerToken = createSessionToken(challengerId);
  const opponentToken = createSessionToken(opponentId);

  const createRes = http.post(
    `${BASE_URL}/api/battles`,
    JSON.stringify({}),
    { headers: getJsonHeaders(challengerToken) },
  );

  const createOk = check(createRes, {
    'battle created successfully': (r) => r.status === 200 && Boolean(r.json('battleId')),
  });

  if (!createOk) {
    battleErrorsCounter.add(1);
    return;
  }

  const battleId = createRes.json('battleId');

  const joinRes = http.post(
    `${BASE_URL}/api/battles/${battleId}/join`,
    JSON.stringify({}),
    { headers: getJsonHeaders(opponentToken) },
  );

  const joinOk = check(joinRes, {
    'battle joined successfully': (r) => r.status === 200,
  });

  if (!joinOk) {
    battleErrorsCounter.add(1);
    return;
  }

  const socketUrl = `${WS_URL}/socket.io/?EIO=4&transport=websocket`;

  const challengerWs = new WebSocket(socketUrl);
  const opponentWs = new WebSocket(socketUrl);

  let finishedCount = 0;
  let hasRecordedResult = false;

  const timer = setTimeout(() => {
    if (!hasRecordedResult) {
      hasRecordedResult = true;
      battleErrorsCounter.add(1);
      challengerWs.close();
      opponentWs.close();
    }
  }, 15000);

  function setupSocket(wsInstance, token) {
    let flags = [];
    let currentIndex = 0;

    wsInstance.addEventListener('open', () => {
      wsInstance.send(`40{"token":"${token}"}`);
    });

    wsInstance.addEventListener('error', () => {
      if (!hasRecordedResult) {
        hasRecordedResult = true;
        battleErrorsCounter.add(1);
      }
      wsInstance.close();
    });

    wsInstance.addEventListener('message', (event) => {
      const msg = event.data;
      if (typeof msg !== 'string') {
        return;
      }

      if (msg.startsWith('40')) {
        wsInstance.send(`42["joinBattleRoom",{"battleId":"${battleId}"}]`);
        return;
      }

      if (msg.includes('bothPlayersPresent')) {
        wsInstance.send(`42["playerReady",{"battleId":"${battleId}"}]`);
        return;
      }

      if (msg.includes('battleStart')) {
        try {
          const parsed = JSON.parse(msg.slice(2));
          flags = parsed[1]?.flags || [];
          currentIndex = 0;
          if (flags.length > 0) {
            const choice = flags[0]?.choices?.[0] || flags[0]?.isoCode || 'fr';
            wsInstance.send(
              `42["submitAnswer",{"battleId":"${battleId}","flagIndex":0,"selectedIsoCode":"${choice}"}]`,
            );
          }
        } catch {
          if (!hasRecordedResult) {
            hasRecordedResult = true;
            battleErrorsCounter.add(1);
          }
          wsInstance.close();
        }
        return;
      }

      if (msg.includes('answerResult')) {
        currentIndex++;
        if (currentIndex < flags.length) {
          const choice = flags[currentIndex]?.choices?.[0] || flags[currentIndex]?.isoCode || 'fr';
          wsInstance.send(
            `42["submitAnswer",{"battleId":"${battleId}","flagIndex":${currentIndex},"selectedIsoCode":"${choice}"}]`,
          );
        }
        return;
      }

      if (msg.includes('battleFinished')) {
        finishedCount++;
        if (finishedCount >= 2 && !hasRecordedResult) {
          hasRecordedResult = true;
          battlesCompletedCounter.add(1);
          clearTimeout(timer);
        }
        wsInstance.close();
        return;
      }

      if (msg.includes('battleError')) {
        if (!hasRecordedResult) {
          hasRecordedResult = true;
          battleErrorsCounter.add(1);
        }
        wsInstance.close();
      }
    });
  }

  setupSocket(challengerWs, challengerToken);
  setupSocket(opponentWs, opponentToken);
}
