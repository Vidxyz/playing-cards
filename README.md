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

## Supported Games

---

### President

**Players:** 3–8 · **Cards:** Standard 52-card deck, dealt evenly · **Objective:** Get rid of all your cards first

**How it plays:**
- All cards are dealt to players. Whoever holds the 3♣ (or lowest club) goes first — this is automatically the starting player.
- On your turn, play a single card or a set of equal-ranked cards face-up to the play pile, beating the previous play (higher rank, same count).
- After you play, pass turn to the next player. Anyone who can't beat (or doesn't want to) passes.
- When everyone passes consecutively, the pile is cleared and whoever last played starts fresh — they can play anything.
- The first player to empty their hand wins that round. Players finish in order (2nd, 3rd, …). The last player is the Scum.
- **Scoring:** 1 point to the winner each round. Play as many rounds as you like, track total via Scores.

**App specifics:**
- Hand zones have `owner-only` visibility — only you see your own cards.
- "Pass" button in the top bar is how you pass your turn.
- "Next Round" (host only) re-deals after everyone has agreed the round is over.

---

### Blackjack

**Players:** 2–7 (one is the dealer, typically the host) · **Cards:** Standard 52-card deck · **Objective:** Get closer to 21 than the dealer without busting

**How it plays:**
- Each player is dealt 2 cards face-up. The dealer gets 1 face-down and 1 face-up.
- Players take turns (hit = draw a card, stand = pass). Bust over 21 and you're out.
- After all players finish, the dealer reveals their face-down card (host taps **Reveal**), then draws until reaching 17 or higher (host taps **Hit dealer**).
- Players who are closer to 21 than the dealer (without busting) win. Ties push.
- **Ace** = 11 or 1 (auto-adjusted to avoid bust). **J/Q/K** = 10.

**App specifics:**
- Player hand zones have `face-up` visibility — all players' cards are visible to everyone on the table.
- The dealer's first card uses a `__facedown` id suffix; the Card component renders it face-down automatically.
- The host controls the dealer: **Reveal** flips the hidden card; **Hit dealer** draws a card from the shoe to the dealer's hand.
- Hand totals are shown live below each player's name. A **?** indicates a hidden dealer card is still in play.
- The draw pile is labelled "shoe · tap to hit" — tapping draws a card to your own hand.
- Scoring is manual — use the Scores panel (top bar) to record wins each round, then host taps **Next Round** to re-deal.

---

### Poker (Texas Hold'em)

**Players:** 2–9 · **Cards:** Standard 52-card deck · **Objective:** Best 5-card hand wins the pot

**How it plays (standard Texas Hold'em):**
- Each player is dealt 2 private hole cards.
- Betting round (Pre-Flop) → host deals 3 community cards face-up (Flop) → betting → 1 more (Turn) → betting → 1 more (River) → final betting → showdown.
- Best 5 cards from your 2 hole cards + 5 community cards wins.
- A player may **Fold** at any time to exit the hand.

**App specifics:**
- Hole card zones have `owner-only` visibility — only you see your own hole cards.
- Community zone cards (Flop, Turn, River, Burn) are `face-up` — visible to all. The host draws cards from the deck to these zones using the shared draw pile; the host uses **move_card** or manually flips cards as needed for the burn.
- The **Fold** button appears in the bottom action bar. Folded players are shown at 40% opacity in the player strip.
- **Scoring** is manual — the host adjusts scores via the Scores panel after each hand.
- The app does not enforce bet amounts or pot — those are tracked verbally or with chips.

---

### Euchre

**Players:** Exactly 4 (2 teams of 2) · **Cards:** 24-card deck (9 through A in all suits) · **Objective:** First team to 10 points wins

**How it plays:**
- Players are seated in alternating teams (Team A: seats 0 & 2, Team B: seats 1 & 3).
- 5 cards are dealt to each player; 4 cards go to the Kitty (face-down).
- The **trump suit** is set by the host using the Trump selector in the top bar.
- Players play one card per trick. The highest trump wins; if no trump played, highest card of the led suit wins.
- Winner of a trick draws from Kitty (Euchre rule: host can let winner draw the top Kitty card) and plays the next lead.
- Team that takes 3+ tricks scores 1 point (or 2 for a march — taking all 5). Euchre (ordering trump but taking fewer than 3) gives 2 points to the opposing team.
- **Scoring:** Tracked in the Scores panel. Host taps **Next Round** after scoring.

**App specifics:**
- Hand zones are `owner-only` — only you see your cards.
- The **Kitty** zone is `face-down`; the host reveals it using `flip_card` if needed.
- Tricks won go into **Team A Tricks** / **Team B Tricks** zones; the count badge shows total tricks won.
- Seat assignment happens in the Lobby — players must be in alternating seats for teams to be correct.

---

### Cambio

**Players:** 2–6 · **Cards:** Standard 52-card deck + 2 jokers (optional) · **Objective:** Have the lowest total card value when Cambio is called

**How it plays:**
- Each player is dealt 4 cards face-down in a 2×2 grid. Before play starts, each player peeks at their **bottom 2 cards** for 15 seconds.
- On your turn, either:
  - **Draw from the deck** → view the card, then swap it with one of your grid positions (placing your old card on the discard pile) or discard it (which may activate a power).
  - **Take the top discard** → you must swap it with one of your grid positions (can't discard it back).
- **Card powers** (activated when you discard without swapping):
  - **7 or 8** → peek at one of your own cards.
  - **9 or 10** → peek at one opponent's card.
  - **Jack or Queen** → blind swap: exchange one of your cards with one opponent's card (neither player looks).
  - **Red King** → peek any card; then optionally swap the peeked card with one of your own.
  - **Black King** = 0 points. Red King = 13 points (highest).
- When you think you have the lowest total, tap **Call Cambio** instead of drawing. Everyone else gets exactly one more turn, then all cards are revealed and scored.

**Card values:** A = 1, 2–10 = face value, J/Q = 10, Black K = 0, Red K = 13.

**App specifics:**
- All grid positions use `face-down` visibility — the server never sends card values; only `peek_result` events reveal cards temporarily.
- The initial 15-second peek is sent server-side after dealing, via targeted `peek_result` events (not broadcast to other players).
- `cambioDrawn` is only sent in the state to the current turn player (server-side redaction).
- Power state machine: `cambioPower` field drives the UI — the board shows contextual tap instructions for each state (`peek-own`, `peek-opponent`, `blind-swap`, `peek-swap`, `peek-swap-ready`).
- Lowest total score wins the round. Scores accumulate across rounds.

---

### Bluff

**Players:** 3–8 · **Cards:** Standard 52-card deck, dealt evenly · **Objective:** Get rid of all your cards first, without getting caught lying

**How it plays:**
- All cards are dealt evenly. Players take turns playing 1 or more cards face-down to the central pile, verbally claiming a rank (e.g., "Three fours").
- Any other player can challenge by clicking **Call Bluff**. The last played batch of cards is revealed.
  - If the player **was lying** (any card ≠ claimed rank): the bluffer takes the entire pile.
  - If the player **was honest**: the caller takes the entire pile.
- The host resolves each bluff call (since you said the claim verbally, the host decides based on what was claimed vs. revealed).
- If everyone passes consecutively (all other players pass without playing cards), the pile is cleared and the last player who played starts fresh — they can play any rank.
- First player to empty their hand wins.

**App specifics:**
- Hand zones are `owner-only` — only you see your own cards. Cards can be freely rearranged within your hand.
- The bluff pile is `face-down`; players can't see what's been played.
- **Claim is verbal** — there is no written claim input. The app doesn't enforce what you say matches what you play.
- `bluffReveal` field holds the revealed cards + submitter + caller during host resolution. All players see the BluffRevealModal with the actual cards until the host decides.
- `bluffPassCount` tracks consecutive passes; when it reaches `turnOrder.length - 1`, the pile clears automatically and the last submitter goes again.
- "Call Bluff" button appears only on the bluff pile zone when it has cards.

---

## Adding a New Game

1. Add a `GameType` entry in `packages/shared/src/types.ts`
2. Create `apps/worker/src/game/games/<name>.ts` exporting a `GameConfig`
3. Register it in `apps/worker/src/game/zones.ts`
4. Add a preset card and any game-specific UI hints in the frontend lobby

The zone + visibility framework handles all card state automatically.
