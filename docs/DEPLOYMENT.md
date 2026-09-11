# Flagora Deployment & Horizontal Scaling Guide

This document outlines how to deploy and horizontally scale Flagora's backend across multiple instances on Render.

## Horizontal Scaling Readiness

Flagora's backend is architected to run safely across multiple Node.js instances behind a load balancer:

1. **Socket.IO Redis Adapter (`@socket.io/redis-adapter`)**:
   - Outbound Socket.IO room events (`bothPlayersPresent`, `battlePlayerReady`, `battleCountdown`, `battleStart`, `opponentProgress`, `battleFinished`) are published across Redis pub/sub.
   - Sockets connected to any backend instance receive broadcasts transparently regardless of which physical instance they are connected to.

2. **Redis-Backed Battle Presence & Readiness**:
   - Active player presence in battle rooms is tracked in Redis (`battle:<id>:presence` and `battle:<id>:sockets:<userId>`).
   - Ready status is stored centrally in Redis (`battle:<id>:ready`).
   - Countdown triggers use an atomic lock (`battle:<id>:countdown_lock`) to prevent duplicate game loops when players on separate instances click ready simultaneously.

3. **Stateless Services & Distributed Queues**:
   - **Session Verification**: Stateless HMAC SHA-256 JWT tokens. Any instance can verify tokens using the shared `SESSION_SECRET`.
   - **Notification Queue**: BullMQ manages job workers across all instances using Redis, guaranteeing single-execution with retries.
   - **Rate Limiting**: `rate-limiter-flexible` stores sliding window counters in Redis, enforcing global rate limits per user ID across all instances.
   - **Static Flag Cache**: Read-only dataset cached identically from MongoDB at boot on each instance.

---

## Enabling Multiple Instances on Render

Render supports horizontal scaling for paid plans (Starter, Standard, Pro).

### Step 1: Upgrade Service Plan
In Render Dashboard:
1. Navigate to your **`flagora-server`** Web Service.
2. Under **Settings** -> **Instance Type**, select **Starter** or higher (free instances do not support multi-instance scaling).

### Step 2: Configure Scaling / Instance Count
1. In the service dashboard, navigate to **Scaling** (or **Settings** -> **Scaling**).
2. Set **Instances** to your target number (e.g. `2` or higher).
3. Save changes. Render will automatically provision additional container instances behind its internal load balancer.

### Step 3: Shared Environment Variables
Verify that the following environment variables are configured in the **Environment** tab. On Render, environment variables set at the service level are automatically shared identically across all running instances:

| Variable | Description | Requirement for Multi-Instance |
| :--- | :--- | :--- |
| `MONGODB_URI` | MongoDB connection string (e.g. MongoDB Atlas) | Shared database for all instances. |
| `REDIS_URL` | Redis connection URL (e.g. `rediss://...`) | **Must point to a managed Redis instance** (e.g. Render Redis or Upstash). Do NOT use `memory` in multi-instance production. |
| `SESSION_SECRET` | Secret key for JWT session signing | Shared across instances so tokens signed by instance A can be verified by instance B. |
| `TELEGRAM_BOT_TOKEN` | Bot API token from @BotFather | Shared across instances. |
| `CLIENT_URL` | Frontend origin (e.g. Vercel deployment) | Allowed CORS origin. |
| `NODE_ENV` | `production` | Enables production optimizations. |

### Step 4: Health Checks & Zero-Downtime Deploys
- Health check path is `/health`, returning `200 {"status":"ok"}`.
- Render uses this endpoint during rolling restarts to ensure new instances are fully booted before routing traffic to them.
