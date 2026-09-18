# Flagora — Complete Game System & Architecture Guide

> **Document Version:** 1.0.0  
> **Audience:** Engineers, Product Designers, Community Leads, Stakeholders  
> **Prerequisites:** None. This document assumes zero prior knowledge of Flagora.

---

## 1. Executive Summary & What is Flagora?

**Flagora** is a high-speed, competitive, country-flag identification quiz game built natively for the **Telegram Mini App** platform.

At its core, players test their geography knowledge by identifying world flags against a ticking clock, racking up points through speed and consecutive correct answers (combos), climbing global leaderboards, unlocking cosmetic flex items, and battling friends in both asynchronous and real-time live head-to-head duels.

### Key Highlights
- **100% Telegram Native:** No passwords or registration screens. Players launch the game straight from a Telegram chat or channel button using their Telegram identity.
- **Server-Authoritative Anti-Cheat:** The client (browser) never knows the correct answer until it submits its choice. Scores, coins, XP, streaks, and ratings are calculated strictly on the backend.
- **Multi-Tiered Question Engine:** Features all 194 sovereign world countries organized into 4 calibrated difficulty tiers (from ultra-recognizable flags like Canada or Japan to visually deceptive lookalikes like Chad vs. Romania or Côte d’Ivoire vs. Ireland).
- **Multiple Game Modes:** Solo practice runs, custom geographic training, unified daily challenges, 1v1 asynchronous friend challenges, and synchronized real-time WebSocket battles.
- **Deep Retention & Economy Loops:** Daily login streaks, streak-freeze saves, level progression, cosmetics store, Elo-based seasonal ranked leagues, and mastery badge collection.

---

## 2. Technical Architecture & Monorepo Layout

Flagora is structured as a TypeScript monorepo powered by `pnpm` workspaces:

```
flagora/
├── apps/
│   ├── server/           # Node.js, Express, Socket.IO, MongoDB & Redis
│   └── web/              # Vite, React 18, Tailwind CSS, Zustand, TanStack Query
├── packages/
│   └── shared/           # Shared TypeScript interfaces, scoring logic & constants
├── load-tests/           # k6 high-concurrency simulation suites
└── prompt/               # Phase-by-phase design specifications & prompts
```

### Technology Matrix

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Client Frontend** | React 18, Vite, TypeScript | Fast, mobile-first responsive Single Page Application (SPA). |
| **Telegram SDK** | `@telegram-apps/sdk`, `@telegram-apps/sdk-react` | Handles Telegram viewport expansion, theme synchronization, back button, and haptics. |
| **Styling** | Tailwind CSS & CSS Custom Properties | Native Telegram look & feel (Telegram blues, rounded cards, dynamic themes). |
| **Frontend State & Cache** | Zustand + TanStack Query | Zustand for session/local UI state; TanStack Query for caching profiles, leaderboards, and badges. |
| **Backend Server** | Node.js 20+, Express, TypeScript, Zod | REST API endpoints, Telegram webhook handler, and game lifecycle validation. |
| **Real-time Layer** | Socket.IO with `@socket.io/redis-adapter` | Bidirectional WebSockets for live 1v1 battle matchmaking, room state, and score sync. |
| **Database** | MongoDB Atlas | Persistent storage for player profiles, game runs, challenges, battles, and unlocked cosmetics/badges. |
| **Cache & Real-time State** | Redis | Leaderboard sorted sets (`ZSET`), battle presence tracking, sliding-window rate limiters, and single-use reward tokens. |
| **Async Task Queue** | BullMQ | Redis-backed background worker queue for dispatching Telegram notifications without blocking API requests. |

---

## 3. Player Identity, Authentication & Anti-Cheat Security

### 3.1 Seamless Telegram Authentication
Players do not create accounts with usernames and passwords. Their stable identity anchor is their unique numerical **Telegram User ID** (`telegramUserId`).

1. **Launch**: When the user opens the Telegram Mini App, the Telegram client injects a cryptographically signed payload called `initData`.
2. **Signature Verification**: The frontend sends `initData` in an HTTP request to `POST /api/session`.
3. **Backend Validation**:
   - The backend splits `initData` into key-value pairs, deletes the `hash`, sorts all keys alphabetically, and joins them with newlines (`\n`) into a check string.
   - It computes `HMAC-SHA256(bot_token, "WebAppData")` to derive a secret key.
   - It hashes the check string with this secret key and compares it against the provided `hash` using a constant-time comparison buffer (`crypto.timingSafeEqual`) to prevent timing attacks.
   - It checks `auth_date`: requests older than 15 minutes (900 seconds) or dated in the future are strictly rejected.
4. **Session Token Issuance**: If valid, the server finds or creates the player profile in MongoDB, creates an HMAC-signed session token bound to the Telegram ID, and returns it to the client. Subsequent REST and WebSocket requests authenticate using this Bearer session token.

### 3.2 Anti-Cheat Guarantees
- **No Answers in Frontend:** When a run is initiated, the server returns an array of flag questions. Each question only contains the country ISO code (to load the SVG image) and four randomized country name strings (`choices`). The correct country name is never sent to the client.
- **Server-Side Timers:** While the frontend displays a 60-second countdown clock, the backend records `startedAt`. Submitting an answer after the expiration window automatically fails with a `TimeExpiredError`.
- **Sliding-Window Rate Limiting:** Every endpoint is protected by Redis-backed rate limiters (e.g., max 30 run starts per minute, 60 answers per minute).
- **Stateless Session Validation:** Every state change (answering a flag, buying an item, saving a streak) is authenticated against the signed session token and authoritatively written by the database.

---

## 4. World Flag Dataset & Flag Selection Engine

### 4.1 The 194-Country Dataset
Flagora includes all 194 internationally recognized sovereign states, tagged across 5 geographic continents (`africa`, `asia`, `europe`, `americas`, `oceania`) and classified into 4 difficulty tiers:

| Tier | Category | Description | Example Countries |
| :---: | :--- | :--- | :--- |
| **1** | **Common / Iconic** | Universally known flags with high media visibility. | United States, United Kingdom, Japan, France, Brazil, Germany. |
| **2** | **Moderate** | Moderately recognizable sovereign states. | Belgium, Denmark, Thailand, Vietnam, Egypt, Morocco, Nigeria, Panama. |
| **3** | **Challenging** | Smaller nations, island states, or less publicized flags. | Bhutan, Suriname, Vanuatu, Cabo Verde, Liechtenstein, Tuvalu. |
| **4** | **Deceptive / Lookalikes** | Visually similar tricolors, near-identical geometries, or inverse colors. | Chad vs. Romania, Monaco vs. Indonesia, Ireland vs. Côte d’Ivoire, Mali vs. Guinea. |

### 4.2 Run Composition & Distractor Generation
In a standard 10-flag run:
1. **Tier Mix Formula:** The engine selects an intentional mix:
   - **4** Tier 1 flags (warm-up / confidence builder)
   - **3** Tier 2 flags (moderate challenge)
   - **2** Tier 3 flags (differentiator)
   - **1** Tier 4 flag (decisive mastery test)
2. **Distractor Pool (False Choices):**
   - For every flag shown, the player sees 4 multiple-choice buttons (1 correct answer + 3 distractors).
   - Distractors are drawn from the same difficulty tier or same region to prevent obvious process-of-elimination giveaways.
   - The final list of 4 choices is randomized so the correct answer does not favor a specific button index.

---

## 5. Core Game Loop & Authoritative Scoring Model

A standard run consists of **10 flags** under a single **60-second global timer**.

### 5.1 The Scoring Formula

$$\text{Run Score} = \sum_{i=1}^{N} \left( \text{BasePoints}(\text{tier}_i) \times \text{ComboMultiplier}_i \right) + \text{LeftoverTimeBonus}$$

#### 1. Base Points per Tier
Harder flags yield structurally higher base rewards:
- **Tier 1:** 50 points
- **Tier 2:** 75 points
- **Tier 3:** 100 points
- **Tier 4:** 150 points

#### 2. Streak / Combo Multiplier
Consecutive correct answers build momentum:
- Initial multiplier: **1.0x**
- Each consecutive correct answer adds **+0.1x** to the multiplier.
- Caps at **1.5x** (at combo streak of 5+).
- **A wrong answer immediately resets the combo to 0** (multiplier returns to 1.0x).
- *Strategic Impact:* Missing a Tier 4 flag with an active 1.5x combo causes a massive scoring loss ($150 \times 1.5 = 225$ potential points lost), rewarding accuracy over wild guessing.

#### 3. Leftover Time Bonus
Speed is rewarded as a single lump-sum bonus at the end of the run:
$$\text{Bonus} = \lfloor \text{Unused Seconds} \rfloor \times 10 \text{ points}$$
If a player finishes all 10 flags with 24 seconds remaining on the clock, they receive an extra $+240$ points.

---

## 6. Player Progression, Economy & Profile

Every game run translates directly into long-term player progression.

```
                    ┌─────────────────────────┐
                    │      Game Run Score     │
                    └────────────┬────────────┘
                                 │
                 ┌───────────────┴───────────────┐
                 ▼                               ▼
     ┌───────────────────────┐       ┌───────────────────────┐
     │  Experience Points    │       │     In-Game Coins     │
     │      (Score × 0.1)    │       │  (5 Coins / Correct)  │
     └───────────┬───────────┘       └───────────┬───────────┘
                 │                               │
                 ▼                               ▼
       Player Level Up                 Cosmetics & Shop
     (Every 500 Total XP)          (Frames, Themes, Banners)
```

- **XP Calculation:** Earn $0.1 \times \text{Score}$ rounded down. A score of 1,200 yields $+120\text{ XP}$.
- **Level Calculation:** $\text{Level} = \lfloor \frac{\text{Total XP}}{500} \rfloor + 1$.
- **Coins Calculation:** Earn $5\text{ Coins}$ for each correct flag in a run (up to $50\text{ Coins}$ per flawless 10/10 run).
- **Profile Record:** Tracks `telegramUserId`, `level`, `xp`, `coins`, `bestScore`, `gamesPlayed`, `currentStreak`, `longestStreak`, `referralCount`, and equipped cosmetics.

---

## 7. Daily Streak & Grace Period Mechanics

To encourage high daily retention, Flagora implements an automated UTC calendar-based streak system.

1. **Daily Increments:**
   - If a player finishes at least one run on date $D$, and their last played date was $D - 1\text{ day}$, their `currentStreak` increments by $+1$.
   - If their last played date was already $D$, their streak remains unchanged.
2. **Streak at Risk:**
   - If more than 24–48 hours pass without completing a game (difference $> 1\text{ day}$), the streak is classified as **At Risk**.
3. **Streak-Freeze Save (Ad Reward):**
   - When a streak is at risk of resetting, the player can watch a short sponsored video (via AdsGram) or redeem a streak-save pass.
   - This sets their `lastPlayedDate` to yesterday, rescuing the streak from dropping back to 1.

---

## 8. Game Modes Overview

```
                                  ┌─────────────────────────┐
                                  │      FLAGORA MODES      │
                                  └────────────┬────────────┘
         ┌──────────────────┬──────────────────┼──────────────────┬──────────────────┐
         ▼                  ▼                  ▼                  ▼                  ▼
   ┌───────────┐      ┌───────────┐      ┌───────────┐      ┌───────────┐      ┌───────────┐
   │ Solo Run  │      │Custom Game│      │   Daily   │      │Async Duel │      │ Live 1v1  │
   │(Practice) │      │  Filter   │      │ Challenge │      │(Challenge)│      │  Battle   │
   └───────────┘      └───────────┘      └───────────┘      └───────────┘      └───────────┘
```

### 8.1 Solo Practice Run
- Default 10 flags, standard tier mix, 60s countdown.
- Playable anytime with no limits; awards XP, coins, and updates all-time personal best scores.

### 8.2 Custom Training Mode
- Players can configure custom runs:
  - **Continent Filter:** Choose from `Africa`, `Asia`, `Europe`, `Americas`, `Oceania`, or `All World`.
  - **Flag Count:** Adjust question volume (e.g., 5, 10, 15, 20 flags).
  - **Duration:** Set custom timers (e.g., 30s blitz to 120s relaxed study).

### 8.3 The Daily Challenge
- **One Global Board:** All players worldwide receive the exact same 10 flags on any given calendar day (seeded by `YYYY-MM-DD`).
- **Single Attempt:** Players only get **one official attempt** per day.
- **Daily Leaderboard:** Resets every midnight UTC, highlighting the most accurate and quickest players of that day.

### 8.4 Asynchronous 1v1 Friend Challenge
Designed for viral Telegram sharing:
1. **Host Plays:** Player A starts a challenge run, records their score, and receives a Telegram Deep Link:
   `https://t.me/flagora_bot?startapp=challenge_<id>`
2. **Opponent Accepts:** Player B clicks the link inside Telegram, launching the game directly onto the **Challenge Landing Screen**.
3. **Identical Question Seed:** Player B answers the exact same 10 flags under the same time constraints.
4. **Head-to-Head Screen:** Both players can view a comparative breakdown showing who had higher accuracy, faster completion time, and who claimed victory. Includes a 1-tap **Rematch** button.

### 8.5 Live 1v1 Real-Time Multiplayer Battle
For synchronous, competitive duels:
- Connects both players over WebSockets via **Socket.IO**.
- **Battle Lobby:** Displays both players' avatars, active frames, and ready checkboxes.
- **Synchronized 3-2-1 Countdown:** Guarantees both clients render Question 1 at the exact same millisecond.
- **Live Opponent Progress:** As your opponent answers each flag, their running score and answer indicator (correct/wrong) immediately stream to your screen in real time.
- **Live Disconnect / Timeout Recovery:** Redis presence keys monitor disconnects. If a player drops connection, a 60-second fallback window evaluates the match cleanly.

---

## 9. Competitive Ranked Seasons & Battle Rating (Elo)

Competitive 1v1 battles contribute to each player's **Battle Rating** within monthly competitive seasons (`YYYY-MM`).

### 9.1 Ranked Tiers

| Tier Name | Rating Threshold | Badge / Icon Color |
| :--- | :---: | :--- |
| **Bronze** | $0 - 299$ | Amber Bronze |
| **Silver** | $300 - 599$ | Slate Silver |
| **Gold** | $600 - 999$ | Warm Gold |
| **Platinum** | $1,000 - 1,499$ | Cyan Platinum |
| **Diamond** | $1,500 - 1,999$ | Radiant Blue |
| **Legend** | $2,000+$ | Purple / Violet Grandmaster |

### 9.2 Rating Adjustments per Battle
- **Win:** $+20$ Rating points
- **Loss:** $-15$ Rating points
- **Tie:** $+2$ Rating points
- At the end of each UTC month, ratings are snapshotted to a permanent `SeasonResult` archive, and the top 100 players receive exclusive prestige rewards.

---

## 10. Mastery Badges & Achievements System

Flagora features permanent milestone badges displayed in the player's **Badge Showcase**:

| Badge ID | Badge Name | Condition Required |
| :--- | :--- | :--- |
| `flawless_run` | **Flawless Run** | Score 10/10 correct in any practice, daily, challenge, or battle run. |
| `speed_demon` | **Speed Demon** | Finish a 10/10 run with $\ge 20$ seconds remaining on the timer. |
| `tier_4_specialist` | **Tier 4 Specialist** | Correctly identify 50 Tier 4 (deceptive) flags over career games. |
| `week_warrior` | **Week Warrior** | Maintain an active daily streak of 7 consecutive days. |
| `month_warrior` | **Month Warrior** | Maintain an active daily streak of 30 consecutive days. |
| `season_top_100` | **Season Top 100** | Finish an official monthly ranked season among the top 100 players. |

- **Non-Disruptive Unlock Banners:** When a new badge is unlocked upon completing a game or checking rank, a subtle celebratory toast banner slides down displaying the badge icon and title without freezing gameplay.
- **In-Game Tier 4 Flourish:** When a deceptive Tier 4 flag appears during a game, a purple mastery glow highlights the question card, signaling higher stakes and point values.

---

## 11. Cosmetic Shop & Visual Customization Engine

Players spend coins earned in-game to customize their appearance across leaderboards, battles, and profile cards:

### 11.1 Cosmetic Categories
1. **Avatar Frames:** Custom neon or metallic borders surrounding the player’s Telegram profile avatar (e.g., *Cyan Glow*, *Golden Ring*, *Emerald Aura*, *Royal Velvet*, *Crimson Blaze*).
2. **Flag Screen Themes:** Color palettes that transform the game interface during quiz runs (e.g., *Midnight Ocean*, *Sunset Dusk*, *Cyber Grid*, *Forest Canopy*, *Golden Nebula*).
3. **Profile Banners:** Header graphics displayed on the player's personal profile card (e.g., *Aurora Borealis*, *Volcanic Ash*, *Cosmic Purple*, *Solar Flare*, *Diamond Frost*).

### 11.2 Dynamic CSS Variable Injection
Cosmetic items do not use heavy image assets. Instead, each item defines a dictionary of CSS custom properties (e.g., `--avatar-frame-border`, `--avatar-frame-shadow`, `--theme-bg-gradient`). When equipped, these properties are injected directly onto the component container, rendering silky 60fps native visual effects with zero load times.

---

## 12. Ad-Reward Infrastructure & Anti-Cheat Token Flow

For sponsored rewards (e.g., daily bonus coins and streak saves) powered by **AdsGram**, Flagora employs a **pre-flight single-use reward token flow**:

```
Client (Mini App)                   Server (Express)                 Redis
      │                                    │                           │
      ├──── POST /rewards/intent ─────────►│                           │
      │                                    ├─ Check daily cap (≤ 5) ───┤
      │                                    ├─ Generate UUID token ─────┤
      │                                    ├─ Store token (TTL: 5m) ──►│
      │◄─── { token, rewardType } ─────────┤                           │
      │                                    │                           │
  [Shows AdsGram Ad]                       │                           │
  [Ad finishes / onReward]                 │                           │
      │                                    │                           │
      ├──── POST /rewards/redeem {token} ─►│                           │
      │                                    ├─ Atomic GETDEL token ────►│
      │                                    │  (Valid & unredeemed?)    │
      │                                    ├─ Credit Coins / Streak ───┤
      │◄─── { ok: true, newCoins } ────────┤                           │
```

1. **Daily Caps:** Users are capped at 5 bonus coin ad views per UTC day.
2. **No Client Trust:** The client cannot simply notify the server "I watched an ad, give me 50 coins." It must present a valid, unexpired, server-issued intent token.
3. **Atomic Consumption:** Tokens are stored in Redis and consumed using atomic read-and-delete operations (`GETDEL`), completely eliminating double-redemption replay attacks.

---

## 13. Telegram Bot Integration & Referral Loops

The backend runs an integrated Telegram bot webhook listener:

### 13.1 Interactive Bot Menu
When users interact with `@flagora_bot` directly in Telegram:
- `/start`: Welcomes the user with rich inline buttons to **Launch Mini App**, view **Game Modes**, check **My Stats**, inspect the **Leaderboard**, or **Invite Friends**.
- **Inline Callback Navigation:** Users can inspect their current streak, level, coins, and best scores directly in Telegram chat bubbles without launching the web app.

### 13.2 Viral Referral Engine
- Every user has a unique referral link: `https://t.me/flagora_bot?start=ref_<telegramUserId>`.
- When a new player signs up through a friend's referral link:
  - The inviter receives **+100 Coins**.
  - The new player receives a **+50 Coin** welcome bonus.
  - A background notification is pushed to the inviter via Telegram: *"🎉 A friend just joined Flagora using your invite link! You earned +100 Coins."*

---

## 14. High-Concurrency Scaling & Horizontal Readiness

Flagora is engineered for massive horizontal scale:
- **Stateless Application Servers:** Express and Socket.IO instances maintain no sticky memory. Any incoming HTTP or WebSocket connection can be handled by any server instance.
- **Redis Pub/Sub Adapter:** Multiple Socket.IO servers synchronize cross-instance room broadcasts seamlessly using `@socket.io/redis-adapter`.
- **Redis Sorted Sets (`ZSET`):** Global, daily, and ranked leaderboards use Redis sorted sets with player scores as weights, enabling $O(\log N)$ rank lookups across millions of players without overloading MongoDB.
- **BullMQ Asynchronous Queuing:** Telegram bot messages, duel rematch alerts, and referral reward notifications are routed through a Redis task queue with exponential backoff and rate-limit compliance.
- **Automated Database Indexing:** All primary query fields (`telegramUserId`, `status`, `expiresAt`, `createdAt`, `bestScore`) are pre-indexed in MongoDB.

---

## 15. Complete API Reference Cheat-Sheet

### Authentication & Profiles
- `POST /api/session` — Authenticate `initData`, fetch/create profile, issue session token.
- `GET /api/profile/me` — Retrieve authenticated user profile, stats, and cosmetics.

### Solo & Custom Gameplay
- `POST /api/runs/start` — Start a standard or custom run (`continent`, `flagCount`, `durationSeconds`).
- `POST /api/runs/:id/answer` — Submit answer for a flag (`flagIndex`, `selectedIsoCode`).
- `POST /api/runs/:id/finish` — Finalize run, calculate leftover bonus, XP, coins, and streaks.

### Leaderboards & Daily Challenge
- `GET /api/leaderboard/top?limit=50` — Global high-score leaderboard.
- `GET /api/leaderboard/me` — Current user's global standing and percentile.
- `POST /api/daily/start` — Start today's official daily challenge run.
- `GET /api/daily/status` — Check today's daily challenge attempt state.
- `GET /api/daily/leaderboard` — Today's daily challenge high-score table.

### 1v1 Async Challenges
- `POST /api/challenges` — Create a new friend challenge and obtain run flags.
- `GET /api/challenges/:id` — Inspect challenge status, challenger name, and results.
- `POST /api/challenges/:id/accept` — Accept and begin an opponent's challenge run.
- `POST /api/challenges/:id/rematch` — Initiate a fresh rematch duel.

### Live 1v1 Battles (REST + WebSockets)
- `POST /api/battles` — Create a real-time battle lobby and generate an invite link.
- `GET /api/battles/:id` — Fetch battle lobby details and participant statuses.
- `POST /api/battles/:id/join` — Join an active battle room as an opponent.
- *Socket.IO Events:* `joinBattleRoom`, `playerReady`, `submitAnswer`, `opponentProgress`, `battleFinished`.

### Shop, Badges & Rewards
- `GET /api/shop/catalog` — List all cosmetic frames, themes, and banners with ownership status.
- `POST /api/shop/purchase` — Buy a cosmetic item using in-game coins.
- `POST /api/shop/equip` — Equip an owned cosmetic item.
- `GET /api/rank/status` — Get current season tier, rating, and standing.
- `GET /api/rank/leaderboard` — Get ranked seasonal leaderboard.
- `GET /api/badges/me` — Get user's earned achievement and mastery badges.
- `POST /api/rewards/bonus-coins/intent` — Request single-use ad reward token.
- `POST /api/rewards/bonus-coins/redeem` — Claim bonus coins after ad completion.
- `POST /api/rewards/streak-save/intent` — Request single-use streak save token.
- `POST /api/rewards/streak-save/redeem` — Claim streak save to protect at-risk streak.

---

## 16. Summary

Flagora combines an addictive, lightning-fast geography trivia loop with the viral power of Telegram Mini Apps and the technical rigor of modern multiplayer web engineering. With server-authoritative security, synchronized WebSockets, Elo-based ranked seasons, and an extensible economy, Flagora is engineered for high retention, viral growth, and seamless cross-platform competition.
