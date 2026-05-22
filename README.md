# Playing Cards

A virtual card table for your phone. Create a room, deal cards privately to each player, and play any card game — no physical deck needed.

Supports: **President · Blackjack · Poker (Texas Hold'em) · Euchre (2v2) · Cambio · Bluff**

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 + React 19 + Tailwind CSS v4 + TypeScript |
| Backend | Cloudflare Workers + Hono + Durable Objects (WebSockets) |
| Shared types | `@playing-cards/shared` workspace package |
| Monorepo | Turborepo + pnpm workspaces |
| Frontend deploy | Vercel |
| Backend deploy | Cloudflare Workers |

---

## How It Works — Architecture Overview

```
Browser (Next.js / Vercel)
        │  HTTPS REST (create/join room)
        │  WebSocket (real-time game events)
        ▼
Cloudflare Worker (edge HTTP routing)
        │  forwards WebSocket upgrade
        ▼
Durable Object — one instance per room
  ├── Holds full GameState in persistent storage
  ├── Manages all player WebSocket connections
  └── Broadcasts redacted state to each player on every change
```

The key insight: **one Durable Object = one card room**. Because all players in a room connect to the exact same DO instance, the server can hold authoritative state in memory and push updates to everyone instantly — no polling, no separate database needed.

---

## Key Technologies Explained

### Cloudflare Workers
Serverless functions that run at Cloudflare's edge (200+ locations worldwide). They handle HTTP requests — creating rooms, checking if a room exists, and upgrading connections to WebSockets. Workers are stateless: each request can hit a different machine, so they can't store game state directly.

### Durable Objects
Cloudflare's answer to stateful serverless. A Durable Object is a single JavaScript class instance that is:
- **Globally unique** — Cloudflare guarantees only one instance exists per room code at a time, no matter how many edge nodes receive requests
- **Persistent** — built-in key/value storage survives worker restarts and deployments
- **WebSocket-aware** — the DO holds open WebSocket connections to all players using the *Hibernation API*, which keeps connections alive even while the DO is idle (no compute cost while players are idle)

When a player makes a move, the message travels: browser → Cloudflare edge → DO. The DO updates `GameState`, serialises it to storage, then pushes the new state to every connected player. The whole round-trip takes under 100 ms from anywhere in the world.

### WebSocket Hibernation API
A Cloudflare-specific feature used here. Instead of the standard WebSocket API (`ws.onmessage`), the DO uses `state.acceptWebSocket(ws)` — this lets Cloudflare *hibernate* (park) the DO between events. The WebSocket stays open in the browser, but the DO is not billed or running. When a new message arrives, Cloudflare wakes the DO and calls `webSocketMessage()`. This makes long-lived idle sessions essentially free.

### Hono
A lightweight HTTP framework for Cloudflare Workers (similar to Express, but built for the edge). Used here for the three HTTP endpoints (`POST /api/rooms`, `GET /api/rooms/:code`, `GET /api/rooms/:code/ws`).

### Zone + Visibility Model
The core abstraction of the card table. Every card lives in a **Zone** — a named container with three attributes:
- `visibility`: `'face-up'` (everyone sees), `'face-down'` (nobody sees values), or `'owner-only'` (only the owner sees their own cards)
- `ownerId`: which player owns this zone, or `null` for shared zones (the table)
- `capacity`: how many cards fit (e.g. Blackjack dealer slot = 1)

Before broadcasting state to a player, the server **redacts** any card the player shouldn't see — replacing real card data with blank stubs. The browser never receives hidden card data. This model works for any card game without encoding game-specific rules.

### Next.js 15 (App Router)
React framework for the frontend. Deployed to Vercel. Uses the App Router (`app/` directory) with client components (`'use client'`) for the interactive game UI.

### Tailwind CSS v4
Utility-first CSS framework for styling. V4 uses a new CSS-native approach (no config file needed). All card visuals are pure CSS — no image assets.

### Turborepo + pnpm workspaces
Monorepo tooling. The repo has three packages: `apps/web` (Next.js), `apps/worker` (Cloudflare Worker), and `packages/shared` (TypeScript types shared by both). Turborepo handles build ordering and caching.

---

## Prerequisites

- **Node.js** >= 20
- **pnpm** >= 9 (`npm install -g pnpm`)
- **Wrangler CLI** (`pnpm add -g wrangler`)
- A **Cloudflare account** (paid Workers plan required for Durable Objects)
- A **Vercel account** (free tier is fine)

---

## Local Development

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment

Copy the example env file for the web app:

```bash
cp apps/web/.env.example apps/web/.env.local
```

Edit `apps/web/.env.local`:

```env
# URL of your locally running Cloudflare Worker
NEXT_PUBLIC_WORKER_URL=http://localhost:8787
```

### 3. Authenticate with Cloudflare (first time only)

```bash
wrangler login
```

### 4. Run everything

```bash
pnpm dev
```

This starts both:
- **Web** at `http://localhost:3000` (Next.js dev server)
- **Worker** at `http://localhost:8787` (Wrangler dev with local Durable Objects)

To run them individually:

```bash
# Frontend only
pnpm --filter @playing-cards/web dev

# Worker only
pnpm --filter @playing-cards/worker dev
```

### 5. Open on mobile (local network)

Wrangler dev binds to `localhost` by default. To test on your phone on the same WiFi:

```bash
# Find your local IP
ipconfig getifaddr en0   # macOS
ip route get 1 | awk '{print $7}' | head -1  # Linux

# Then in apps/web/.env.local set:
NEXT_PUBLIC_WORKER_URL=http://<your-local-ip>:8787

# And start Next.js on all interfaces:
pnpm --filter @playing-cards/web dev -- --hostname 0.0.0.0
```

---

## Deployment

### Deploy the Worker (Cloudflare)

```bash
# First deployment — creates the Durable Object migration
pnpm --filter @playing-cards/worker deploy

# Subsequent deployments
pnpm --filter @playing-cards/worker deploy
```

Your worker URL will be printed on success, e.g. `https://playing-cards-worker.<your-subdomain>.workers.dev`

#### Durable Objects note

Durable Objects require a **paid Cloudflare Workers plan** (Workers Paid, $5/mo). The `wrangler.toml` already contains the correct `[[durable_objects.bindings]]` and `[[migrations]]` config — no manual steps needed.

### Deploy the Frontend (Vercel)

#### Option A — Vercel CLI

```bash
pnpm add -g vercel
vercel --cwd apps/web
```

Follow the prompts. On first deploy, set the environment variable:

```
NEXT_PUBLIC_WORKER_URL=https://playing-cards-worker.<your-subdomain>.workers.dev
```

#### Option B — Vercel Dashboard

1. Import the repo from GitHub
2. Set **Root Directory** to `apps/web`
3. Add environment variable `NEXT_PUBLIC_WORKER_URL` pointing to your deployed worker
4. Deploy

#### Update CORS in the Worker

After getting your Vercel URL, update `apps/worker/src/index.ts` to add it to the CORS `origin` list:

```typescript
cors({
  origin: [
    "http://localhost:3000",
    "https://your-app.vercel.app",   // ← add this
  ],
})
```

Then redeploy the worker.

---

## Project Structure

```
playing-cards/
├── apps/
│   ├── web/                        # Next.js frontend
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── page.tsx        # Home — create or join room
│   │   │   │   └── room/[code]/
│   │   │   │       └── page.tsx    # Game room (lobby + table)
│   │   │   ├── components/
│   │   │   │   ├── Card.tsx        # CSS-drawn playing card
│   │   │   │   ├── Hand.tsx        # Player's private hand
│   │   │   │   ├── Zone.tsx        # Named card area on table
│   │   │   │   ├── GameTable.tsx   # Main table layout
│   │   │   │   ├── Lobby.tsx       # Pre-game waiting room
│   │   │   │   ├── ActionBar.tsx   # Contextual action buttons
│   │   │   │   └── ScoreBoard.tsx  # Scores across rounds
│   │   │   ├── hooks/
│   │   │   │   ├── useRoom.ts      # WebSocket connection + state
│   │   │   │   └── useGame.ts      # Game action dispatchers
│   │   │   └── lib/
│   │   │       └── ws.ts           # WebSocket client wrapper
│   │   ├── .env.example
│   │   └── package.json
│   └── worker/                     # Cloudflare Worker
│       ├── src/
│       │   ├── index.ts            # Hono app + DO binding
│       │   ├── RoomDO.ts           # Durable Object — room state + WS
│       │   └── game/
│       │       ├── deck.ts         # Deck creation, shuffle, filter by game
│       │       ├── deal.ts         # Deal logic per game config
│       │       ├── zones.ts        # Zone templates per game
│       │       └── games/
│       │           ├── president.ts
│       │           ├── blackjack.ts
│       │           ├── poker.ts
│       │           ├── euchre.ts
│       │           ├── cambio.ts
│       │           └── bluff.ts
│       ├── wrangler.toml
│       └── package.json
└── packages/
    └── shared/                     # Shared types (no runtime deps)
        └── src/
            ├── types.ts            # All core types
            ├── events.ts           # WS message types (client↔server)
            └── index.ts
```

---

## Adding a New Game

1. Add a `GameType` entry in `packages/shared/src/types.ts`
2. Create `apps/worker/src/game/games/<name>.ts` exporting a `GameConfig`
3. Register it in `apps/worker/src/game/zones.ts`
4. Add a preset card and any game-specific UI hints in the frontend lobby

The zone + visibility framework handles all card state automatically.
