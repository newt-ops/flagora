# Flagora

A fast, replayable country-flag identification game where players answer a sequence of flags under time pressure, earn points based on accuracy and speed, build streaks, and compete against their own previous scores. Social competition sits on top of that core loop once the loop itself is proven fun.

## Repository Structure

```
.
├── apps/
│   ├── server/      # Node.js + Express backend service
│   └── web/         # Vite + React Telegram Mini App frontend
├── packages/
│   └── shared/      # Shared TypeScript types and utilities
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

## Getting Started

### Prerequisites

- Node.js 20+ (tested on Node.js 24)
- pnpm 10+ (tested on pnpm 12)

### Installation

Install dependencies across the monorepo:

```bash
pnpm install
```

### Running Locally

To run all apps simultaneously:

```bash
pnpm dev
```

Or run individual apps:

Backend server:

```bash
pnpm --filter @flagora/server dev
```

Server runs at `http://localhost:3001` (health check at `http://localhost:3001/health`).

Web client:

```bash
pnpm --filter @flagora/web dev
```

Web client runs at `http://localhost:5173`.

### Building

Build all packages and apps:

```bash
pnpm build
```

### Linting & Formatting

Lint all workspaces:

```bash
pnpm lint
```

Check code formatting:

```bash
pnpm format
```

## Deployment & Scaling

Flagora is architected for horizontal scaling across multiple instances behind Render's load balancer using `@socket.io/redis-adapter`, Redis-backed battle presence tracking, BullMQ job queues, and stateless sessions.

For instructions on configuring multiple instances and shared environment variables on Render, see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Load Testing

Flagora includes a comprehensive k6 load testing suite in `load-tests/` that exercises core gameplay, high-concurrency leaderboard reads, reward claims (rate limits & daily caps), and live multiplayer WebSocket battles.

For documentation on running load tests and target SLA thresholds, see [load-tests/README.md](load-tests/README.md).


