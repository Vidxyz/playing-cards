# DealMeIn — Codebase Guide for New Maintainers

This document is written for someone taking over maintenance of this project with little or no prior exposure to it. It covers architecture, conventions, gotchas, and the things that are not obvious from reading the code alone.

---

## What the app is

**DealMeIn** is a real-time multiplayer card game platform for mobile and web. Players create or join rooms via a 6-character code, choose a game, and play through a shared table UI. All game logic lives on the server; the client is purely reactive — it receives state and renders it.

Supported games: President, Poker (Texas Hold'em), Blackjack, Euchre, Cambio, Bluff, Go Fish, Rummy, Crazy Eights.

---

## Repository layout

```
playing-cards/                  ← monorepo root (Turborepo + pnpm)
├── apps/
│   ├── web/                    ← Next.js 15 frontend (deployed to Vercel)
│   │   └── src/
│   │       ├── app/            ← Next.js App Router pages
│   │       │   ├── page.tsx            home screen (create/join room)
│   │       │   ├── about/page.tsx      about/credits page
│   │       │   └── room/[code]/page.tsx   in-room page (lobby → game)
│   │       ├── components/     ← all UI components
│   │       ├── hooks/          ← useRoom.ts (WebSocket), useTheme.ts, useAccent.ts
│   │       ├── lib/            ← ws.ts (WebSocket client), poker.ts (blind utils)
│   │       └── shared/         ← LOCAL COPY of shared types (see below — critical)
│   │
│   └── worker/                 ← Cloudflare Workers (deployed to CF)
│       └── src/
│           ├── index.ts        ← Hono router: HTTP API + WS proxy
│           ├── RoomDO.ts       ← MAIN FILE — all game logic (~3000 lines)
│           └── game/           ← pure helper modules
│               ├── deck.ts     card + deck construction, shuffle
│               ├── deal.ts     card distribution per game type
│               ├── zones.ts    GAME_CONFIGS — one entry per game type
│               ├── president.ts  President-specific combo logic
│               ├── euchre.ts   Euchre-specific trick/bidding logic
│               └── poker.ts    Texas Hold'em hand evaluation
│
└── packages/
    └── shared/                 ← CANONICAL shared types (worker uses these)
        └── src/
            ├── types.ts        GameState, Player, Zone, Card, etc.
            ├── events.ts       ClientEvent, ServerEvent (WebSocket message types)
            └── utils.ts        rankName() utility
```

---

## The two-copy shared types problem — READ THIS FIRST

This is the most important gotcha in the entire codebase.

The worker (`apps/worker`) imports from `@playing-cards/shared` which resolves to `packages/shared/src/`.

The web app (`apps/web`) **also** imports from `@playing-cards/shared`, but its `tsconfig.json` path alias redirects that import to `apps/web/src/shared/index.ts` — a **local copy** of the same types.

```json
// apps/web/tsconfig.json
"paths": {
  "@playing-cards/shared": ["./src/shared/index.ts"]
}
```

**Why this exists:** The two apps deploy to completely different platforms (Vercel vs Cloudflare Workers). The build pipelines are separate and the worker's shared package isn't bundled into the web build in the standard workspace way. Rather than fighting that, the web app keeps its own copy.

**The rule:** Any time you touch `packages/shared/src/types.ts`, `events.ts`, or `utils.ts`, you **must** make the exact same change to `apps/web/src/shared/types.ts`, `events.ts`, or `utils.ts`. If you forget, the TypeScript compiler will not catch it because both copies compile independently. The symptom is a runtime mismatch: the server sends a field the client doesn't know about, or vice versa, and things silently break.

---

## How a room works end-to-end

### Creating a room

1. Browser POSTs to `POST /api/rooms` on the Cloudflare Worker.
2. The Hono router in `index.ts` generates a `roomCode` (6-char alphanumeric) and a `playerId` (9-char random string), then calls `/init` on the Durable Object to pre-create its state.
3. The response `{ roomCode, playerId }` is returned to the browser.
4. The browser stores the session in `sessionStorage` as `player_<roomCode>: { playerId, name }`.
5. The browser navigates to `/room/<roomCode>`.

### Joining a room

1. Browser GETs `GET /api/rooms/<code>` to verify the room exists.
2. If it does, the browser generates its own `playerId`, stores session, and navigates to `/room/<code>`.

### The room page

`apps/web/src/app/room/[code]/page.tsx` does two things:

- On mount: reads the session from `sessionStorage`. If no session is found (e.g., direct URL navigation without joining), redirects to `/?join=<code>`.
- Renders `<RoomView>` which calls `useRoom()`.

### useRoom and WebSocket lifecycle

`apps/web/src/hooks/useRoom.ts` is the heart of the client-side connection. It:

1. Creates a `RoomSocket` (from `lib/ws.ts`) which opens a WebSocket to `wss://worker/api/rooms/<code>/ws?playerId=<id>`.
2. On connect, sends a `{ type: 'join', name }` event.
3. Handles all server events: `state`, `action`, `error`, `peek_result`, `round_restarted`, `kicked`.
4. On disconnect, `RoomSocket` auto-reconnects every 2 seconds indefinitely.

When the server sends a `state` event, `gameState` in `useRoom` is updated and the entire UI re-renders from the new state. **The client never mutates game state** — it only sends actions and receives state.

### The Durable Object (RoomDO.ts)

Every room is a single Cloudflare Durable Object instance. The DO:

- Accepts WebSocket connections (WebSocket Hibernation API — important, see below).
- Receives player messages and dispatches to handler methods.
- Maintains game state in durable storage (key `'room'`), in-memory cache (`this.gameState`).
- Broadcasts updated state to all connected clients after every state change.

The DO has a single alarm that fires for two purposes: player disconnect grace period expiry and room TTL expiry (4 hours of inactivity). See the alarm section below.

---

## GameState — the single source of truth

`GameState` (defined in `types.ts`) is the entire state of a room. It is:

- Stored on the server in Durable Object storage.
- Sent to every client on every state change (with per-player redaction — hidden cards are replaced with `HIDDEN_CARD`).
- Never mutated client-side.

The object is large — it holds every game's fields in a flat structure. Most fields are game-specific and are `null`/empty for irrelevant game types. This is intentional: a single flat object is easier to serialize, store, and broadcast than a discriminated union.

Key fields to understand:

| Field | Meaning |
|---|---|
| `phase` | `'lobby' \| 'dealing' \| 'playing' \| 'round-over' \| 'game-over'` |
| `players` | Active players (in-seat). Disconnected players with `isConnected: false` are removed after their grace period. |
| `pendingPlayers` | Players who joined mid-game and are waiting for the next round. |
| `zones` | All card zones (hands, piles, etc.) — both per-player and shared. |
| `turnOrder` | Ordered array of playerIds for whose turn it is. |
| `currentTurnPlayerId` | The player whose turn it currently is. |
| `drawPileCount` | Size of the draw pile (actual cards are server-only, never sent to clients). |

---

## The Zone / card model

Cards live in **Zones**. A Zone has:

- `id` — unique string (e.g., `hand-<playerId>`, `play-pile`, `discard`)
- `ownerId` — `null` for shared zones; a playerId for per-player zones
- `visibility` — `'face-up'` (everyone sees), `'face-down'` (no one sees), `'owner-only'` (only owner sees)
- `cards` — array of `Card` objects (or `HIDDEN_CARD` placeholders for redacted cards)

Zone templates are defined per game in `apps/worker/src/game/zones.ts` (`GAME_CONFIGS`). The `buildZones` function in `deal.ts` instantiates them for each round by expanding per-player templates.

The server's `redactFor(playerId)` method replaces cards in `owner-only` zones with `HIDDEN_CARD = { id: '??', rank: '2', suit: 'spades' }` before sending state to other players.

---

## Player identity and session

Player identity is entirely client-driven and stored in `sessionStorage` (not `localStorage` — it's tab-scoped):

```
sessionStorage['player_<ROOMCODE>'] = JSON.stringify({ playerId: '...', name: '...' })
```

The `playerId` is a random string generated at join time. It is passed as a URL query param on the WebSocket connection (`?playerId=...`) and is used as the DO's key for routing events to the correct player.

**No authentication exists.** Anyone who knows a `playerId` can impersonate that player by connecting to the same room with that ID. This is fine for the casual use case but is worth knowing.

---

## Disconnect / reconnect flow

1. Player's browser drops connection → `webSocketClose` fires on the DO.
2. The DO marks `player.isConnected = false` and `player.disconnectedAt = Date.now()`, saves state, broadcasts — all other players see the "leaving Xs" countdown.
3. A `pendingLeaves` entry is written to durable storage: `{ [playerId]: Date.now() + 15_000 }`.
4. `scheduleNextAlarm()` sets the DO's alarm to fire in 15 seconds (or sooner if another alarm is already pending for something earlier).
5. **If the player reconnects within 15 seconds:** `handleJoin` fires, `cancelLeaveTimer` removes the player from `pendingLeaves`, `player.isConnected = true`, game resumes.
6. **If 15 seconds elapse:** the alarm fires, `applyPlayerLeave` runs, removes the player from `gs.players`, broadcasts — they disappear from everyone's UI.

**Why `setAlarm` and not `setTimeout`:** Cloudflare DOs use WebSocket Hibernation — when all WebSocket connections are idle, the DO is hibernated and all in-memory `setTimeout` calls are silently dropped. `setAlarm` is durable and survives hibernation. The `leaveTimers` Map (previously used for this) has been removed for this reason.

The `DisconnectTimer` component (`components/DisconnectTimer.tsx`) renders the client-side countdown. It reads `player.disconnectedAt` from the game state and counts down from 15 seconds. When the server actually removes the player, the next state broadcast simply omits them from `gs.players` and the component unmounts.

---

## Alarm multiplexing

The DO can only have **one alarm at a time**. Two things need alarms:

1. **Leave timers** — one per disconnected player, fire 15s after disconnect.
2. **Room TTL** — fires 4 hours after the last WebSocket connection, to expire idle rooms.

These are managed via two durable storage keys:

- `'pendingLeaves'` — `Record<playerId, fireAtTimestamp>`
- `'roomExpiresAt'` — `number` (timestamp)

`scheduleNextAlarm()` always sets the alarm to `min(roomExpiresAt, ...pendingLeaves values)`. When the alarm fires, it processes all due leave entries first, then checks room expiry, then reschedules for whatever remains.

---

## RoomDO.ts structure

This is the largest file (~3000 lines). It is a single class with no external state. Key sections:

| Section | What it does |
|---|---|
| Class fields | `sessions` Map (playerId → WebSocket), `gameState` (in-memory cache), `drawPile` (server-only, never sent to clients) |
| `fetch()` | Handles HTTP: WS upgrade, `/init`, `/state` |
| `webSocketMessage()` | Parses incoming JSON, calls `handleEvent()` |
| `webSocketClose()` | Marks player disconnected, schedules leave timer |
| `alarm()` | Processes due leave timers and room TTL expiry |
| `handleEvent()` | Switch statement dispatching to per-action handlers |
| `handleJoin()` | Player joins/reconnects. Adds to players or pending. Cancels leave timer on reconnect. |
| `applyPlayerLeave()` | Called after grace period. Removes player from `gs.players`, handles host transfer, game-specific cleanup. |
| `handlePlayerLeave()` | Game-specific cleanup when a player leaves mid-game (president roles, bluff pass counts, etc.) |
| `handleDeal()` | Starts a round: promotes pending players, filters out disconnected players, builds deck, creates zones, deals cards. |
| `handleNextRound()` | Per-game logic for advancing to the next round or entering game-over. |
| `broadcastState()` | Sends redacted `GameState` to all connected WebSockets via `getWebSockets()`. |
| `saveState()` | Writes to both the in-memory cache and durable storage. |
| `loadState()` | Reads from in-memory cache if warm; otherwise reads from durable storage (needed after hibernation). |
| `redactFor(playerId)` | Deep-copies game state replacing hidden cards with `HIDDEN_CARD` for that player. |
| Per-game handlers | `handlePoker*`, `handleBlackjack*`, `handleCambio*`, etc. — grouped at the bottom of the file. |

---

## Game phases

```
lobby → dealing → playing → round-over → (back to dealing OR game-over)
```

- `lobby` — players are choosing a game and waiting to start. The host can change game type and config.
- `dealing` — transitional. Cards are being distributed. UI shows a dealing animation.
- `playing` — active game.
- `round-over` — round has ended. Score display shown. Host can start next round.
- `game-over` — final scores. Host can start a new game (returns to `lobby`).

The `phase` field on `GameState` drives which component the UI renders.

---

## Frontend architecture

### Page → component tree

```
room/[code]/page.tsx
  └── RoomView
        ├── useRoom()          ← WebSocket state
        ├── <Lobby>            ← when phase === 'lobby'
        ├── <GameTable>        ← when phase === 'playing' | 'dealing' | 'round-over'
        └── game-over UI       ← inline in page.tsx
```

### GameTable.tsx

The main in-game component. It:

- Renders the top bar (exit/restart/leave buttons, game name, player strip).
- Delegates to a `*Board` component for the game-specific central UI.
- Renders the player's hand at the bottom.
- Hosts global overlays: ScoreBoard, tutorial modals, confirm modals, toasts.

Each game with significant unique UI has its own `*Board.tsx`:

| Component | Game |
|---|---|
| `PresidentBoard.tsx` | President |
| `PokerBoard.tsx` | Poker |
| `BlackjackBoard.tsx` | Blackjack |
| `EuchreBoard.tsx` | Euchre |
| `GoFishBoard.tsx` | Go Fish |
| `RummyBoard.tsx` | Rummy |
| `CrazyEightsBoard.tsx` | Crazy Eights |
| Inline in GameTable.tsx | Cambio, Bluff (and generic zone games) |

### Styling

The app uses **Tailwind CSS v4** with a custom CSS variable design system. Do not reach for Tailwind colour utilities (e.g., `bg-amber-500`) — use the CSS variables instead:

```
var(--bg)            page background
var(--surface)       card/panel background
var(--surface-mid)   slightly elevated surface
var(--surface-hi)    highest elevation surface
var(--border)        subtle border
var(--border-hi)     more prominent border
var(--text)          primary text
var(--text-muted)    secondary text
var(--text-dim)      very faint text
var(--accent)        accent colour (default amber, user-selectable)
var(--accent-dim)    tinted accent background
```

Theme (dark/light) is set by `[data-theme="light"]` on `<html>`. Accent colour is set by `[data-accent="blue|green|purple"]`. Both are persisted in `localStorage` and applied before first paint via an inline script in `layout.tsx` to avoid flash.

**Safe area insets:** The app is designed for mobile. Two utility classes defined in `globals.css` handle notch/home-bar padding:
- `.pt-safe` → `padding-top: env(safe-area-inset-top, 0px)`
- `.pb-safe` → `padding-bottom: env(safe-area-inset-bottom, 0px)`

**Important pattern:** Never combine `.pt-safe` and `py-N` on the same element — `pt-safe` will override `py-N`'s top padding (evaluates to 0px on non-notch devices). Instead, use an outer div with `.pt-safe` for the inset, and an inner div with `py-N` for the content padding. See `GameTable.tsx` top bar for the reference implementation.

### Card rendering

`components/Card.tsx` renders individual cards. `components/Hand.tsx` renders a draggable/selectable hand of cards. `components/Zone.tsx` renders a card zone (pile, grid, etc.).

Cards that are hidden from the current player arrive as `{ id: '??', rank: '2', suit: 'spades' }` — the `Card` component detects `id === '??'` and renders a face-down card back.

---

## Host mechanics

One player in each room is the host. The host:

- Is the only one who can start the game, configure settings, deal, trigger next round, restart the round, end the room, and kick players.
- Is identified by `player.isHost === true` and `gameState.hostId`.
- Is automatically transferred when the current host disconnects (after the grace period elapses). All players see a toast notification: "You are now the host" or "[Name] is now the host".

The host transfer happens inside `applyPlayerLeave` when `player.isHost` is true — the next connected player in the players array is promoted.

---

## Pending players

Players who join a room while a game is in progress are added to `gameState.pendingPlayers` instead of `gameState.players`. They can watch but not play. At the start of each round (`handleDeal`), pending players who are connected and haven't set `staySpectator: true` are promoted into `players` up to the game's max player count.

---

## Adding a new game — checklist

1. **Shared types** (both copies):
   - Add the game type string to `GameType` in `types.ts`.
   - Add any game-specific fields to `GameState` in `types.ts`.
   - Add game-specific `ClientEvent` variants to `events.ts`.
   - Remember: edit both `packages/shared/src/` AND `apps/web/src/shared/`.

2. **Server** (`apps/worker/src/`):
   - Add a `GameConfig` entry to `GAME_CONFIGS` in `game/zones.ts`. This defines min/max players, deck filter (ranks, suits, copies, jokers), cards per player, and zone templates.
   - Add any special dealing logic in `game/deal.ts` (if the standard `dealCards` doesn't cover it).
   - Initialise game-specific state fields in `makeInitialState()` in `RoomDO.ts`.
   - Add event routing in the `handleEvent()` switch statement.
   - Add handler methods (e.g., `handleMyGame*`).
   - Add a `handleNextRound` branch for the game.
   - Add a `handlePlayerLeave` branch for game-specific cleanup when a player leaves mid-game.
   - Add a `resetToLobby` cleanup block (if the game has per-game state that needs clearing between sessions).

3. **Frontend** (`apps/web/src/`):
   - Add the game to the `GAMES` array in `components/Lobby.tsx`.
   - Create `components/MyGameBoard.tsx` for the game's central UI.
   - Wire into `GameTable.tsx`: add to `GAME_LABEL`, add to `GAMES_WITH_OWN_RESULTS` if the game manages its own round-over screen, import and render the board component, exclude from generic `Pass`/`Next` button visibility as needed.
   - Create a tutorial modal in `components/CambioTutorial.tsx` (all tutorials live in this file despite the name) and wire it into GameTable's tutorial system (`setShowTutorialFor`).

---

## Development workflow

### Running locally

```bash
# Install dependencies (from repo root)
pnpm install

# Start everything in parallel (Next.js dev + Wrangler dev)
pnpm dev

# Or individually:
cd apps/web   && pnpm dev    # http://localhost:3000
cd apps/worker && pnpm dev   # http://localhost:8787
```

The web app reads `NEXT_PUBLIC_WORKER_URL` to know where the worker is. In development this defaults to `http://localhost:8787`. In production it must be set as a Vercel environment variable.

### Deploying

```bash
# Deploy worker to Cloudflare
cd apps/worker && pnpm deploy

# Deploy web to Vercel (usually done via git push + Vercel CI)
cd apps/web && vercel --prod
```

### Type checking

```bash
cd apps/web    && npx tsc --noEmit
cd apps/worker && npx tsc --noEmit
```

There is no test suite. Correctness is validated through manual playtesting.

---

## Known nuances and edge cases

**Draw pile is server-only.** `gameState.drawPileCount` tells clients how many cards remain, but the actual card array (`this.drawPile` in the DO) is never sent to clients. This prevents cheating by inspecting the network tab.

**`GameState` in-memory cache.** `RoomDO.ts` keeps `this.gameState` as an in-memory field for fast access. After hibernation, this is null and `loadState()` reads from durable storage. Never write directly to `this.gameState` — always go through `saveState()` so the storage stays in sync.

**Euchre has no tutorial wired in GameTable.** The `EuchreTutorialModal` exists in `CambioTutorial.tsx` and is used in the Lobby, but it is intentionally excluded from the in-game `?` tutorial button (which only shows for Cambio, Bluff, President, Blackjack, Poker, Go Fish, Rummy, Crazy Eights).

**President double deck.** When President has 5+ players, a double deck is used (two copies of all cards + 4 jokers). Card IDs for the second copy have a `_1` suffix (e.g., `AS_1`) to keep them unique. This is handled automatically in `handleDeal`.

**Bluff vs. play_cards action.** The `play_cards` client event is used by most games. For Bluff, it includes a `bluffClaim: { rank }` field. For President, it uses `wildRank` instead. CrazyEights has its own `crazy8s_play` event. Don't assume a single action covers all games.

**President finish order and roles.** `presidentFinishOrder` is an ordered array of playerIds tracking who finishes first (gets rid of all cards). It drives role assignment (President, VP, Neutral, Vice Bum, Bum). Leavers/disconnects are assigned `presidentRoles[playerId] = 'neutral'` directly and never enter `presidentFinishOrder` — this ensures early disconnects can't accidentally earn a good title.

**Cambio board is inline.** Unlike other complex games, Cambio's board UI is rendered inline within `GameTable.tsx` rather than in a separate `*Board.tsx` file. This is a historical artifact — it predates the board extraction pattern.

**`sessionStorage` scope.** Player sessions are `sessionStorage` (tab-scoped, not `localStorage`). If a player opens the same room in a new tab, they'll be treated as a new player. This is by design — it prevents issues with multiple sessions for the same player.

**Kick vs. leave.** When a player is kicked, the server sends them a `kicked` event, stores the reason in their `sessionStorage` (for display on the home page), then closes their WebSocket. When a player leaves voluntarily, they navigate away — no explicit leave message is sent; the WebSocket close is the signal.

**`HIDDEN_CARD` sentinel.** `{ id: '??', rank: '2', suit: 'spades' }` is the sentinel for a face-down card. The `Card` component and any code reading card data from zones must handle this case. Never use `rank` or `suit` of a `HIDDEN_CARD` for game logic.

**`redactFor` and peek results.** The `peek_result` server event (used by Cambio) delivers a single card's true rank/suit to the peeker only, outside of the main game state. This is stored client-side in `peekResults` (in `useRoom`) and overlaid on the UI for a few seconds. It never enters `gameState`.
