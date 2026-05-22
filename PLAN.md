# Implementation Plan — Playing Cards

## Goal

A mobile-first virtual card table. Players join a room via code, each phone shows only their private hand, and a shared table view shows public card state. Supports six games via a zone + visibility framework — no rules enforced, cards behave like a physical deck.

---

## Core Design Decisions

### 1. Zone + Visibility Framework

All card state is modelled as **zones**. Each zone has:

| Property | Values | Purpose |
|---|---|---|
| `visibility` | `face-up` \| `face-down` \| `owner-only` | Who can see card values |
| `owner` | `playerId` \| `null` | Per-player or shared |
| `capacity` | `number` \| `null` | Max cards (null = unlimited) |
| `position` | `{row, col}` \| `null` | For Cambio 2×2 grid slots |

Every game is expressed purely through zone definitions + an initial deal config. No game rules are encoded — only card state and visibility.

### 2. Real-time via Durable Objects

Each room is one Durable Object instance. It:
- Holds full `GameState` in DO storage
- Manages WebSocket connections (one per player)
- Broadcasts deltas to all connected clients on every state change
- Persists state across worker restarts

### 3. No Chips / No Rule Enforcement

Betting, card validity, and scoring logic are all self-managed by players, just like a real deck. The one exception: Bluff's reveal mechanic (cards flip when challenged) — the app executes the flip but players decide who picks up the pile.

### 4. Bluff's Claim Mechanic

Bluff needs one unique primitive: **play face-down with a text claim**. When cards are played to the Bluff pile:
- Cards go face-down
- A text label (the claim, e.g. "3× Kings") is attached and shown to all
- Any player gets a "Call Bluff" button
- Tapping it flips the top batch of played cards for 3 seconds, then leaves them face-down on the pile

### 5. Euchre Teams

Two teams of two. Players are assigned to seats (0, 1, 2, 3) — seats 0 & 2 are Team A, seats 1 & 3 are Team B. The host assigns seats in the lobby. Team score is tracked separately from individual scores.

---

## Data Models (`packages/shared/src/types.ts`)

```typescript
type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs'
type Rank = '2'|'3'|'4'|'5'|'6'|'7'|'8'|'9'|'10'|'J'|'Q'|'K'|'A'

interface Card {
  id: string        // e.g. "AS", "10H", "JD"
  rank: Rank
  suit: Suit
}

type ZoneVisibility = 'face-up' | 'face-down' | 'owner-only'

interface Zone {
  id: string
  name: string
  visibility: ZoneVisibility
  ownerId: string | null          // null = shared zone
  cards: Card[]
  capacity: number | null
  gridPosition: { row: number; col: number } | null  // Cambio slots
  claimLabel: string | null       // Bluff claim text
}

interface Player {
  id: string                      // UUID assigned on join
  name: string
  seatIndex: number               // 0-based seat order
  teamId: string | null           // Euchre only
  isHost: boolean
  isConnected: boolean
  isReady: boolean
  isFolded: boolean               // Poker: sat out this hand
  trickCount: number              // Euchre: tricks won this round
  roundScore: number              // score this round
  totalScore: number              // cumulative score
}

interface Team {
  id: string
  name: string                    // "Team A" / "Team B"
  seatIndices: number[]           // [0,2] or [1,3]
  roundScore: number
  totalScore: number
}

type GamePhase = 'lobby' | 'dealing' | 'playing' | 'round-over' | 'game-over'

type GameType =
  | 'president'
  | 'blackjack'
  | 'poker'
  | 'euchre'
  | 'cambio'
  | 'bluff'

interface GameState {
  roomCode: string
  gameType: GameType | null       // null in lobby
  phase: GamePhase
  players: Player[]
  teams: Team[]
  zones: Zone[]
  drawPile: Card[]                // face-down deck, server-only (not sent to clients)
  discardPile: Card[]             // face-up, visible to all
  currentTurnPlayerId: string | null
  turnOrder: string[]             // player IDs in play order
  roundNumber: number
  trumpSuit: Suit | null          // Euchre
  lastAction: GameAction | null   // for animation hints
  config: GameConfig | null
}

// GameConfig — defines how a game is set up
interface GameConfig {
  gameType: GameType
  deckFilter: DeckFilter          // which cards to include
  cardsPerPlayer: number | 'all'
  zoneTemplates: ZoneTemplate[]
  hasTeams: boolean
  hasTurnOrder: boolean
  dealerDrawsFor: ZoneTemplate[]  // zones dealer populates (Poker community cards)
}

interface DeckFilter {
  ranks?: Rank[]                  // whitelist (Euchre: 9–A only)
  suits?: Suit[]
  jokers?: boolean
  copies?: number                 // number of full decks (default 1)
}

interface ZoneTemplate {
  id: string
  name: string
  visibility: ZoneVisibility
  perPlayer: boolean
  capacity: number | null
  gridRows?: number               // Cambio: 2
  gridCols?: number               // Cambio: 2
}
```

---

## WebSocket Events (`packages/shared/src/events.ts`)

### Client → Server

```typescript
type ClientEvent =
  | { type: 'join';         name: string }
  | { type: 'ready' }
  | { type: 'set_game';     gameType: GameType }             // host only
  | { type: 'start_deal' }                                   // host only
  | { type: 'play_cards';   cardIds: string[]; toZoneId: string; claim?: string }
  | { type: 'move_card';    cardId: string; fromZoneId: string; toZoneId: string }
  | { type: 'draw_card';    toZoneId: string }               // draw from draw pile
  | { type: 'flip_card';    cardId: string; zoneId: string } // toggle face-up/down
  | { type: 'call_bluff' }
  | { type: 'pass_turn' }
  | { type: 'next_round' }                                   // host only
  | { type: 'set_trump';    suit: Suit }                     // Euchre, host only
  | { type: 'fold' }                                         // Poker
  | { type: 'peek_card';    cardId: string; zoneId: string } // Cambio initial peek
  | { type: 'update_score'; targetId: string; delta: number; targetType: 'player' | 'team' }
  | { type: 'assign_seat';  playerId: string; seatIndex: number }  // host only
```

### Server → Client

```typescript
type ServerEvent =
  | { type: 'state';        state: ClientGameState }         // full state sync
  | { type: 'delta';        patch: Partial<ClientGameState> }// incremental update
  | { type: 'action';       action: GameAction }             // for triggering animations
  | { type: 'error';        message: string }
  | { type: 'kicked' }                                       // room closed

// ClientGameState — server redacts hidden card values before sending
// draw pile cards are replaced with { id: '??', rank: '??', suit: '??' }
// face-down zone cards in zones the client doesn't own are also redacted
```

### GameAction (for animation hints)

```typescript
interface GameAction {
  type: 'deal' | 'play' | 'draw' | 'flip' | 'bluff_reveal' | 'pass'
  playerId: string
  cardIds?: string[]
  fromZoneId?: string
  toZoneId?: string
  claim?: string
  timestamp: number
}
```

---

## Durable Object: `RoomDO`

Location: `apps/worker/src/RoomDO.ts`

```
RoomDO
  ├── sessions: Map<playerId, WebSocket>
  ├── state: GameState (persisted in DO storage)
  │
  ├── fetch(Request)
  │   ├── WebSocket upgrade → assign playerId, register session
  │   └── HTTP: GET /state (debug only)
  │
  ├── handleMessage(playerId, event: ClientEvent)
  │   ├── Validates sender (host-only actions, etc.)
  │   ├── Mutates gameState
  │   ├── Persists to DO storage
  │   └── Broadcasts updated ClientGameState to all sessions
  │
  └── broadcast(event: ServerEvent, excludePlayerId?)
      └── Sends to all connected sessions (redacts hidden cards per recipient)
```

**State redaction** happens per-connection in `broadcast`: before sending state to player X, replace all card values in zones that X cannot see (face-down zones they don't own, the draw pile) with blank card stubs `{ id:'?', rank:'?', suit:'?' }`. This means card security is enforced server-side — the frontend never receives hidden card data.

**DO storage key:** `gameState` (single JSON blob, overwritten on every mutation).

**Room expiry:** DO alarm set 4 hours after last activity. On alarm, DO clears state and closes connections.

---

## HTTP API (`apps/worker/src/index.ts` via Hono)

```
POST /api/rooms
  Body: { hostName: string }
  Returns: { roomCode: string, playerId: string }

GET  /api/rooms/:code
  Returns: { exists: boolean, playerCount: number, phase: GamePhase }

GET  /api/rooms/:code/ws   [WebSocket upgrade]
  Query: ?playerId=<uuid>  (omit for new player — server assigns one)
  Upgrades to WebSocket, hands off to RoomDO
```

Room codes are 6 uppercase alphanumeric characters. Generated by the worker, stored as the DO key.

---

## Game Configs

### President

- Deck: full 52
- Deal: all cards, as evenly as possible (remainder to first players)
- Zones: `hand` (owner-only, per-player), `play-pile` (face-up, shared, unlimited), `cleared` (face-down, shared)
- Turn order: on

### Blackjack

- Deck: full 52
- Deal: 2 cards to each player hand, 2 to dealer hand
- Zones:
  - `hand` (face-up, per-player) — visible to everyone (Blackjack hands are public)
  - `dealer-hand` (special: first card face-down, rest face-up, shared)
- Turn order: on (clockwise from dealer's left)
- Dealer can hit (draw to dealer-hand) after all players stand
- Dealer flips their face-down card by sending `flip_card`

### Poker (Texas Hold'em)

- Deck: full 52
- Deal: 2 cards per player to `hole-cards` zone (owner-only)
- Community zones (shared, face-up, dealer populates via `play_cards` from draw pile):
  - `flop` (capacity 3)
  - `turn` (capacity 1)
  - `river` (capacity 1)
  - `burn` (face-down, capacity unlimited)
- Players can `fold` (sets `isFolded: true`, hand cards hidden from others)
- No blinds / betting enforced

### Euchre

- Deck: 24 cards (9, 10, J, Q, K, A of all 4 suits)
- Teams: enabled (seats 0,2 vs seats 1,3)
- Deal: 5 cards per player to `hand` (owner-only), 4 to `kitty` (face-down, shared)
- Dealer reveals top kitty card (sends `flip_card`)
- Trump suit: set by host via `set_trump`, shown as a suit indicator to all
- Trick play: players `play_cards` from hand to shared `trick` zone (face-up)
- After each trick: host sends `move_card` to move trick to winning team's `tricks-taken` zone
- `trickCount` on each team tracked manually via `update_score`

### Cambio

- Deck: full 52
- Deal: 4 cards to each player's positional grid (2×2)
- Zones per player: `pos-0-0`, `pos-0-1`, `pos-1-0`, `pos-1-1` — all face-down initially
- Shared zones: `draw-pile` (face-down), `discard-pile` (face-up)
- Initial peek: each player sends `peek_card` for their two bottom cards — server temporarily sends those card values owner-only, flagged with a short TTL (5 seconds), then re-redacts
- All in-game actions (swap, peek opponent's card, etc.) are executed with generic `move_card` / `flip_card` — players enforce when they're allowed

### Bluff

- Deck: full 52 (with option for 2 decks for 5+ players)
- Deal: all cards, as evenly as possible
- Zones: `hand` (owner-only, per-player), `bluff-pile` (face-down, shared), `discard` (face-up, shared)
- `play_cards` to `bluff-pile` accepts an optional `claim` string shown as a label
- `call_bluff` flips the most recently played batch of cards (server tracks batch boundaries by `lastAction`) — visible for 3 seconds via a timed server event, then returns to face-down
- Players self-manage who picks up the pile (just drag cards from `bluff-pile` to `hand`)

---

## Frontend Pages & Components

### Pages

**`/` (Home)**
- "Create Room" button → POST /api/rooms → redirect to `/room/[code]`
- "Join Room" input → room code → GET /api/rooms/:code → redirect to `/room/[code]`
- Clean, minimal mobile UI

**`/room/[code]`**
- Single page, phase-aware rendering:
  - `lobby` → `<Lobby />`
  - `dealing` → brief deal animation
  - `playing` → `<GameTable />`
  - `round-over` → scores overlay
  - `game-over` → final scores

### Components

**`<Card />`**
- CSS-drawn, no images
- Face-up: rank in top-left and bottom-right corners, large suit symbol centred
- Face-down: pattern/back design (CSS gradient or simple pattern)
- Red suits (hearts, diamonds) vs black suits (spades, clubs)
- Sizes: `sm` (card count chips), `md` (hand default), `lg` (table/zoom)
- Selected state: card lifts up (transform: translateY(-12px))
- Animations: deal-in (fly from centre), play-out (slide to table zone)

**`<Hand />`**
- Horizontally scrollable fan of cards on mobile
- Tap to select, tap again to deselect
- Multi-select allowed (President combos, Bluff plays)
- "Play selected" button appears when cards are selected
- For Cambio: renders as 2×2 grid instead of fan

**`<Zone />`**
- Named card area: draw pile, play pile, community cards, trick area, etc.
- Shows top card if face-up, card-back if face-down, count badge
- Claim label badge for Bluff pile
- Tap on draw pile = draw a card
- Accepts card drops (desktop) or tap-to-play (mobile)

**`<GameTable />`**
- Layout depends on game type:
  - Default: player hands at bottom, shared zones in centre, other players' card counts at top
  - Euchre: 2×2 team seating arrangement
  - Poker: player hands on edges, community cards in centre
- Shows turn indicator (highlighted player name / pulsing ring)
- Trump suit badge (Euchre)

**`<PlayerStrip />`**
- Compact row showing each player: avatar (initials), name, card count, trick count
- Current turn player highlighted

**`<ActionBar />`**
- Fixed bottom bar (above hand on mobile)
- Context-sensitive buttons:
  - Pass Turn / Draw / Call Bluff / Fold
  - Claim input (Bluff): text field that appears when cards selected and target zone is bluff-pile
  - Flip card (Blackjack dealer, Cambio peek)

**`<Lobby />`**
- Room code displayed large (easy to share)
- Player list with ready checkmarks
- Host: game selector (card grid of game types with icons)
- Host: "Start Game / Deal" button (enabled when ≥2 players ready)
- Seat assignment for Euchre (drag names to seats)

**`<ScoreBoard />`**
- Slide-up panel, accessible mid-game
- Shows round-by-round scores
- Cumulative totals
- Team scores for Euchre

---

## Animation Plan

All animations via CSS transitions + a small framer-motion or pure CSS approach. Prefer CSS-only for bundle size.

| Trigger | Animation |
|---|---|
| Cards dealt | Cards fan out from centre to each player, staggered |
| Card played | Selected card slides from hand position to table zone |
| Bluff reveal | Card flips (CSS rotateY 0→90→0 with face swap at 90°) |
| Turn change | Outgoing player's highlight fades, incoming pulses in |
| New player joins (lobby) | Name slides in from right |
| Call bluff | Red flash border on the pile, then flip |

---

## State Flow

```
[Home]
  → POST /api/rooms          (host)
  → redirect /room/[code]
  → WS connect + join event
  → server: player added, phase = lobby
  → broadcast state to all

[Lobby]
  → players join via code
  → host selects game
  → host sets seats (Euchre)
  → all players ready
  → host taps "Deal"
  → server: shuffle, deal per config, phase = playing
  → broadcast state (with redaction per player)

[Playing]
  → players take actions (play, draw, pass, etc.)
  → each action: server mutates state, broadcasts delta
  → round ends (host declares) → phase = round-over
  → scores shown
  → host taps "Next Round" → re-deal, phase = playing

[Game Over]
  → host taps "End Game" → phase = game-over
  → final scores shown
  → "Play Again" → resets state to lobby
```

---

## File Creation Order (Implementation Sequence)

### Phase 1 — Scaffold

1. `pnpm-workspace.yaml`, `turbo.json`, root `package.json`
2. `packages/shared/` — types and events (no deps)
3. `apps/worker/` — Hono + wrangler.toml skeleton
4. `apps/web/` — Next.js + Tailwind skeleton

### Phase 2 — Worker Core

5. `RoomDO.ts` — WebSocket sessions, join/leave, state broadcast
6. `game/deck.ts` — card generation, shuffle, deck filters
7. `game/deal.ts` — deal N cards from deck to zones
8. `game/zones.ts` — zone template registry + game configs (all 6 games)
9. HTTP routes (`/api/rooms`)

### Phase 3 — Frontend Core

10. Home page — create/join room
11. `useRoom.ts` hook — WS connect, state management
12. `<Card />` — CSS-drawn card component
13. `<Hand />` — player hand with selection
14. `<Zone />` — named card areas
15. `<Lobby />` — waiting room
16. `<GameTable />` — main game view with `<PlayerStrip />`
17. `<ActionBar />` — contextual actions

### Phase 4 — Game-specific UI

18. Poker layout (community card zones)
19. Euchre layout (team seating, trump indicator)
20. Cambio layout (2×2 grid hand)
21. Bluff claim input + Call Bluff button + reveal animation
22. Blackjack dealer flip

### Phase 5 — Polish

23. Deal animation
24. Card play animation
25. Turn indicator animations
26. Mobile viewport tuning (safe area insets, touch targets ≥44px)
27. Loading / error states
28. Room expiry handling (DO alarm → kicked event → redirect home)

---

## Security & Correctness Notes

- **Card values never sent to wrong client.** All redaction happens in the DO's `broadcast` method before serialisation. The frontend never receives face-down card data it shouldn't see.
- **Host-only actions validated server-side.** `start_deal`, `next_round`, `set_trump`, `assign_seat` check that the sender's playerId matches the room's `hostId`.
- **Room codes are not guessable secrets.** They're convenience codes (6 chars = 36^6 ≈ 2.2B possibilities). Rooms expire after 4 hours. No sensitive data is at stake.
- **No auth needed.** Player identity is a UUID assigned by the server on first join, stored in `localStorage` on the client. Re-joining the same room with the same UUID restores your hand.

---

## Open Questions / Future Extensions

- **Spectator mode** — join without a hand, watch the table
- **Private messaging** — whisper to another player (useful for Poker table talk)
- **Custom deck rules** — e.g. add jokers, wild cards
- **Animated card backs** — per-game theme (e.g. green felt for Poker)
- **Share room via QR code** — generate QR from room code on host screen
- **Reconnection grace period** — if player disconnects briefly, hold their hand for 60s before dropping
