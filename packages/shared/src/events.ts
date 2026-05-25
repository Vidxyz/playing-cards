import type { GameType, GameState, GameAction, Suit } from './types'

// Client → Server
export type ClientEvent =
  | { type: 'join'; name: string }
  | { type: 'ready' }
  | { type: 'set_game'; gameType: GameType }
  | { type: 'start_deal' }
  | { type: 'play_cards'; cardIds: string[]; toZoneId: string; bluffClaim?: { rank: string } }
  | { type: 'move_card'; cardId: string; fromZoneId: string; toZoneId: string }
  | { type: 'draw_card'; toZoneId: string }
  | { type: 'flip_card'; cardId: string; zoneId: string }
  | { type: 'call_bluff' }
  | { type: 'resolve_bluff' }
  | { type: 'pass_turn' }
  | { type: 'next_round' }
  | { type: 'end_game' }
  | { type: 'set_trump'; suit: Suit }
  | { type: 'fold' }
  | { type: 'peek_card'; cardId: string; zoneId: string }
  | { type: 'update_score'; targetId: string; delta: number; targetType: 'player' | 'team' }
  | { type: 'assign_seat'; playerId: string; seatIndex: number }
  | { type: 'set_dealer'; playerId: string }
  // Cambio-specific
  | { type: 'cambio_call' }
  | { type: 'cambio_swap'; targetZoneId: string }
  | { type: 'cambio_discard_drawn'; usePower?: boolean }
  | { type: 'cambio_power_peek'; cardId: string; zoneId: string }
  | { type: 'cambio_power_swap'; zoneId1: string; zoneId2?: string }
  | { type: 'cambio_power_skip' }
  | { type: 'cambio_stick'; zoneId: string }
  | { type: 'set_cambio_jokers'; count: number }
  | { type: 'set_bluff_jokers'; count: number }
  // President-specific
  | { type: 'president_run_discard'; cardIds: string[] }
  | { type: 'president_exchange_return'; cardIds: string[] }
  // Euchre-specific
  | { type: 'euchre_order_up'; goAlone?: boolean }
  | { type: 'euchre_pass' }
  | { type: 'euchre_call_suit'; suit: Suit; goAlone?: boolean }
  | { type: 'euchre_discard'; cardId: string }

// Server → Client
export type ServerEvent =
  | { type: 'state'; state: GameState }
  | { type: 'action'; action: GameAction }
  | { type: 'error'; message: string }
  | { type: 'kicked'; reason: string }
  | { type: 'peek_result'; cardId: string; zoneId: string; rank: string; suit: string; duration?: number; fromInitialDeal?: boolean }
