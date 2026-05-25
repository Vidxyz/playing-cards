export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs'
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A' | 'JKR'

export interface Card {
  id: string   // e.g. "AS", "10H", "JD", "2C"
  rank: Rank
  suit: Suit
}

// Placeholder card — sent to clients in place of hidden cards
export const HIDDEN_CARD: Card = { id: '??', rank: '2', suit: 'spades' }

export type ZoneVisibility = 'face-up' | 'face-down' | 'owner-only'

export interface Zone {
  id: string
  name: string
  visibility: ZoneVisibility
  ownerId: string | null          // null = shared zone
  cards: Card[]
  capacity: number | null         // null = unlimited
  gridPosition: { row: number; col: number } | null  // Cambio 2x2 slots
  claimLabel: string | null       // Bluff: claim text on played batch
  isBluffPile: boolean            // enables claim + call-bluff mechanic
}

export interface Player {
  id: string
  name: string
  seatIndex: number
  teamId: string | null
  isHost: boolean
  isConnected: boolean
  isReady: boolean
  isFolded: boolean
  trickCount: number
  roundScore: number
  totalScore: number
}

export interface Team {
  id: string
  name: string
  seatIndices: number[]
  roundScore: number
  totalScore: number
}

export type GamePhase = 'lobby' | 'dealing' | 'playing' | 'round-over' | 'game-over'

export type GameType = 'president' | 'blackjack' | 'poker' | 'euchre' | 'cambio' | 'bluff'

export interface BluffReveal {
  cards: Card[]           // actual card values — visible to all during resolution
  submitterId: string     // player who played the last batch
  callerId: string        // player who called bluff
  claimRank: string       // what was declared
  claimCount: number      // how many were declared
  bluffSucceeded: boolean // true = submitter lied → submitter picks up pile
  recipientId: string     // player who picks up the pile
}

export interface GameState {
  roomCode: string
  hostId: string
  gameType: GameType | null
  phase: GamePhase
  players: Player[]
  teams: Team[]
  zones: Zone[]
  drawPileCount: number
  currentTurnPlayerId: string | null
  turnOrder: string[]
  roundNumber: number
  trumpSuit: Suit | null
  lastAction: GameAction | null
  // Bluff-specific: set while awaiting host resolution, null otherwise
  bluffReveal: BluffReveal | null
  lastBluffBatch: { cardIds: string[]; submitterId: string; claimRank: string; claimCount: number } | null
  bluffActiveRank: string | null
  bluffHistory: Array<{ submitterId: string; claimRank: string; claimCount: number }>
  bluffPassCount: number
  bluffPassedPlayerIds: string[]
  // Euchre-specific
  euchrePhase: 'bidding1' | 'bidding2' | 'discard' | 'playing' | null
  euchreTopCard: Card | null
  euchreDealerPlayerId: string | null
  euchreMakerPlayerId: string | null
  euchreGoingAlone: boolean
  euchreBidPassCount: number
  euchreCurrentTrickLedSuit: Suit | null
  // Blackjack-specific
  blackjackDealerId: string | null
  // Cambio-specific
  cambioDrawn: { card: Card; fromDiscard: boolean } | null
  cambioPower: 'peek-own' | 'peek-opponent' | 'blind-swap' | 'peek-swap' | 'peek-swap-ready' | null
  cambioCaller: string | null
  cambioFinalRound: boolean
  cambioPeekSwapTarget: { cardId: string; zoneId: string } | null
  cambioJokers: number
  bluffJokers: number
  presidentDoubleDeck: boolean
  // President-specific
  presidentCombo: { rank: string; suit: Suit; count: number; maxSuitIsWild: boolean } | null
  presidentFinishOrder: string[]
  presidentPassedIds: string[]
  presidentRoles: Record<string, string>
  presidentRunPlays: { playerId: string; rank: string; count: number }[]
  presidentDiscardPhase: { playerId: string; cardsNeeded: number; done: boolean }[] | null
  // Between-round card exchange: president ← bum, vp ← vb
  presidentExchangePhase: {
    playerId: string       // president/vp — must return cards
    recipientId: string    // bum/vb — receives returned cards
    cardsOwed: number      // how many to return
    done: boolean
    receivedCardIds: string[]  // cards they received (for animation)
    giverRole: string      // 'bum' | 'vb' — label for display
  }[] | null
}

export interface GameAction {
  type: 'deal' | 'play' | 'draw' | 'flip' | 'bluff_reveal' | 'bluff_peek' | 'pass' | 'fold' | 'move' | 'stick_success' | 'stick_fail'
  playerId: string
  cardIds?: string[]
  fromZoneId?: string
  toZoneId?: string
  claim?: string
  timestamp: number
}

export interface ZoneTemplate {
  id: string
  name: string
  visibility: ZoneVisibility
  perPlayer: boolean
  capacity: number | null
  isBluffPile?: boolean
  gridRows?: number
  gridCols?: number
}

export interface DeckFilter {
  ranks?: Rank[]
  suits?: Suit[]
  copies?: number
  jokerCount?: number
}

export interface GameConfig {
  gameType: GameType
  label: string
  description: string
  minPlayers: number
  maxPlayers: number
  deckFilter: DeckFilter
  cardsPerPlayer: number | 'all'
  zoneTemplates: ZoneTemplate[]
  hasTeams: boolean
  hasTurnOrder: boolean
  dealerZoneId?: string           // zone that gets staggered face-down/up (Blackjack)
}
