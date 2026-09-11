# Flagora Load Testing Runbook (k6)

This directory contains load-testing scripts for validating Flagora's performance, caching, indexing, asynchronous queues, rate limiting, and horizontal scaling under concurrent load.

> **CRITICAL RULE**: Load tests must **NEVER** be run against production with real players. Run only against isolated staging environments or local test deployments.

---

## 1. Prerequisites & k6 Installation

Ensure `k6` is installed on your machine:

- **Windows (winget)**:
  ```powershell
  winget install GrafanaLabs.k6 --source winget
  ```
- **macOS (Homebrew)**:
  ```bash
  brew install k6
  ```
- **Linux (Debian/Ubuntu)**:
  ```bash
  sudo gpg -k
  sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
  echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
  sudo apt-get update && sudo apt-get install k6
  ```

Verify installation:
```bash
k6 version
```

---

## 2. Target Environment Configuration

All scripts read the following environment variables (configured via `--env` or OS environment):

| Variable | Description | Default |
| :--- | :--- | :--- |
| `TARGET_URL` | Base HTTP URL of the target backend | `http://localhost:3001` |
| `WS_URL` | Base WebSocket URL | `ws://localhost:3001` |
| `SESSION_SECRET` | Secret key used to sign JWT test sessions | `test_session_secret_for_load_testing_32chars` |
| `TARGET_VUS` | Target peak virtual users (concurrency) | Script default (e.g. `500`) |
| `DURATION` | Total execution duration | Script default (e.g. `3m`) |

---

## 3. Test Scripts & Execution

### Script 1: Core Gameplay Loop (`gameplay-loop.js`)
Simulates full solo runs: starting a run, answering 10 flags with realistic human delay, and finalizing the run.

```bash
k6 run --env TARGET_URL=http://localhost:3001 --env TARGET_VUS=500 load-tests/gameplay-loop.js
```

### Script 2: Leaderboards Read Hammer (`leaderboards.js`)
Hammers the high-frequency read endpoints (`/api/leaderboard/top`, `/api/leaderboard/me`, `/api/daily/leaderboard`, `/api/daily/status`) to verify Redis sorted set performance and index efficiency.

```bash
k6 run --env TARGET_URL=http://localhost:3001 --env TARGET_VUS=500 load-tests/leaderboards.js
```

### Script 3: Concurrent Reward Flow (`reward-flow.js`)
Tests reward intent generation and redemption under heavy concurrency, verifying that Phase 8 daily caps and Phase 9-04 rate limiters trigger cleanly with `429 Too Many Requests` and `Retry-After` headers without any 500 server crashes.

```bash
k6 run --env TARGET_URL=http://localhost:3001 --env TARGET_VUS=100 load-tests/reward-flow.js
```

### Script 4: Live Multiplayer Battles (`battles.js`)
Simulates paired multiplayer battles over Socket.IO WebSockets (`joinBattleRoom`, `bothPlayersPresent`, `playerReady`, `battleCountdown`, `battleStart`, `submitAnswer`, `battleFinished`), validating Redis adapter broadcast synchronization and presence tracking.

```bash
k6 run --env TARGET_URL=http://localhost:3001 --env TARGET_VUS=50 load-tests/battles.js
```

---

## 4. Health Baselines & Performance SLAs

A test run is considered **HEALTHY** only if all thresholds below are satisfied:

| Endpoint / Operation | Metric | SLA Threshold | Expected Behavior |
| :--- | :--- | :--- | :--- |
| `POST /api/runs/start` | Latency (p95) | **< 250ms** | Run creation with flag selection from in-memory cache |
| `POST /api/runs/:id/answer` | Latency (p95) | **< 100ms** | Fast state update in MongoDB (indexed by `runId`) |
| `POST /api/runs/:id/finish` | Latency (p95) | **< 250ms** | Combo calculation, profile stats update, Redis leaderboard update |
| `GET /api/leaderboard/top` | Latency (p95) | **< 80ms** | Redis sorted set range query (`p99 < 150ms`) |
| `GET /api/leaderboard/me` | Latency (p95) | **< 80ms** | Redis sorted set rank query |
| `GET /api/daily/leaderboard` | Latency (p95) | **< 80ms** | Daily sorted set query |
| Reward Endpoints | Latency (p95) | **< 120ms** | Atomic token verification and daily cap check |
| HTTP Error Rate (`http_req_failed`) | Rate | **< 1.0%** | Non-429 failures must be near zero (`< 0.5%` target) |
| Server Crashes (`500 errors`) | Count | **0** | No uncaught exceptions or database connection pool exhaustion |
| Rate Limit / Daily Cap | Status Code | **429** | Must include `Retry-After` header and clean error payload |
| WebSocket Handshake (`ws_connecting`)| Latency (p95) | **< 200ms** | Fast WebSocket upgrade over HTTP/1.1 |
| Battle Full Session | Duration (p95) | **< 15s** | Full 10-flag duel completion across instances |

---

## 5. Pre-Release Verification Checklist

Run this load testing suite before every significant production release:

1. [ ] Deploy release candidate to isolated staging environment with identical Render instance plan and Redis instance.
2. [ ] Execute `load-tests/leaderboards.js` at 500 VUs; verify p95 latency stays under 80ms.
3. [ ] Execute `load-tests/gameplay-loop.js` at 500 VUs; verify run start and finish latencies stay under 250ms.
4. [ ] Execute `load-tests/reward-flow.js`; verify daily caps and rate limiters return 429 without server crashes.
5. [ ] Execute `load-tests/battles.js`; verify paired battles complete across instances with 0 errors.
6. [ ] Review database and Redis resource utilization in monitoring dashboards during peak load.
