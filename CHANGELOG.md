# Changelog

All notable changes to the Flagora project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2026-10-10

### 🏁 Flagora v1.0 — Initial Official Release

Flagora v1.0 is the complete, production-grade release of the fast-paced, competitive country-flag identification quiz game natively built for the **Telegram Mini App** ecosystem.

### Key Features & Capabilities

#### 🎮 Core Gameplay Engine
- **194 Sovereign Countries**: Full international coverage with authentic SVG vector flag rendering across 4 calibrated difficulty tiers.
- **Server-Authoritative Anti-Cheat**: Questions, answer keys, combo multipliers, and leftover time bonuses are resolved securely on the backend.
- **Fluid Timer & Live Combos**: Continuous countdown with instant feedback, showing the correct answer alongside incorrect choices for seamless learning.
- **Multi-Factor Scoring**: Base points, speed tier bonuses, combo multipliers (up to 3.0x), and leftover time bonuses.

#### 🕹️ Game Modes
- **Solo Practice Mode**: Standard 60-second calibrated run with dynamic question progression across world tiers.
- **Custom Mode**: Configurable continent selection (Americas, Europe, Africa, Asia, Oceania, World), customizable question counts, and flexible durations (30s, 60s, 90s, 120s).
- **Daily Challenge**: Unified daily synchronized seed for all global players, awarding bonus XP, pins, and daily streak progression with deduplicated single-attempt tracking.
- **1v1 Asynchronous Friend Challenges**: Generate deep-linked challenge cards to share directly with friends via Telegram chats.
- **Live Real-Time Multiplayer Battles**: Head-to-head live matches orchestrated over WebSockets (Socket.IO) backed by Redis presence tracking and real-time score streaming.

#### 🏆 Ranked Seasons & Leaderboards
- **Elo-Based Rating System**: Skill rating system with dynamic tier categorization (Bronze, Silver, Gold, Platinum, Diamond, Legend).
- **Multiple Leaderboards**: Global all-time, Seasonal ranked, and Daily Challenge leaderboards with pinned user rank deduplication.
- **Promotion Detection**: Visual fanfare and notifications when promoting to higher leagues.

#### 💎 Economy, Retention & Monetization
- **Currency System**: Earn Pins and XP through runs, challenges, and daily activities.
- **Daily Login Streaks & Streak Saves**: Track consecutive active days with streak-freeze protections (costing pins or free for Pro members).
- **Telegram Star Store**: Integrated Star payments via Telegram Stars for Pro verification checkmarks and premium cosmetic packs.
- **Verified Pro Status**: Star-shaped verified checkmark badge with gold gradient styling and exclusive perks.
- **Cosmetic Personalization**: Avatar frames, player titles, customizable badge showcases, and achievement pins.

#### 📱 Native Telegram Integration
- **Apple UI / Telegram Guidelines**: Seamless theming using Telegram CSS tokens (`bg-tg-bg`, `bg-tg-button`, `text-tg-button-text`, etc.) without harsh borders or non-native colors.
- **Haptic Feedback**: Fine-tuned haptic triggers (`impact`, `notification`, `selection`) across answer choices and button interactions.
- **Safe Area & Fullscreen Adaptation**: Responsive top and bottom notch padding adapting dynamically to mobile and desktop Telegram clients.

#### ⚙️ Infrastructure & Reliability
- **Monorepo Architecture**: Clean separation into `@flagora/server`, `@flagora/web`, and `@flagora/shared`.
- **Horizontal Scalability**: Stateless API design ready for multi-instance scaling via Render and Redis adapters.
- **Comprehensive Test Suites**: Over 360 unit and integration tests passing across server and web clients, backed by k6 load test scenarios.
