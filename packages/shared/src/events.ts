import type { GameType, GameState, GameAction, Suit } from './types'

// Client → Server
export type ClientEvent =
  | { type: 'join'; name: string }
  | { type: 'ready' }
  | { type: 'set_game'; gameType: GameType }
  | { type: 'start_deal' }
  | { type: 'play_cards'; cardIds: string[]; toZoneId: string; claim?: string }
  | { type: 'move_card'; cardId: string; fromZoneId: string; toZoneId: string }
  | { type: 'draw_card'; toZoneId: string }
  | { type: 'flip_card'; cardId: string; zoneId: string }
  | { type: 'call_bluff' }
  | { type: 'resolve_bluff'; bluffSucceeded: boolean }
  | { type: 'pass_turn' }
  | { type: 'next_round' }
  | { type: 'end_game' }
  | { type: 'set_trump'; suit: Suit }
  | { type: 'fold' }
  | { type: 'peek_card'; cardId: string; zoneId: string }
  | { type: 'update_score'; targetId: string; delta: number; targetType: 'player' | 'team' }
  | { type: 'assign_seat'; playerId: string; seatIndex: number }

// Server → Client
export type ServerEvent =
  | { type: 'state'; state: GameState }
  | { type: 'action'; action: GameAction }
  | { type: 'error'; message: string }
  | { type: 'kicked'; reason: string }
  | { type: 'peek_result'; cardId: string; zoneId: string; rank: string; suit: string }
