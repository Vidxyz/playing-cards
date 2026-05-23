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
  cards: Card[]         // actual card values — visible to all during resolution
  submitterId: string   // player who played the last batch
  callerId: string      // player who called bluff
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
  lastBluffBatch: { cardIds: string[]; submitterId: string } | null
  bluffPassCount: number
  // Blackjack-specific
  blackjackDealerId: string | null
  // Cambio-specific
  cambioDrawn: { card: Card; fromDiscard: boolean } | null
  cambioPower: 'peek-own' | 'peek-opponent' | 'blind-swap' | 'peek-swap' | 'peek-swap-ready' | null
  cambioCaller: string | null
  cambioFinalRound: boolean
  cambioPeekSwapTarget: { cardId: string; zoneId: string } | null
  cambioJokers: number
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
