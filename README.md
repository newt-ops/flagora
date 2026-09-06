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
