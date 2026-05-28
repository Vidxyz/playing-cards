import type { GameType, GameState, GameAction, Suit } from './types'

// Client → Server
export type ClientEvent =
  | { type: 'join'; name: string }
  | { type: 'ready' }
  | { type: 'set_game'; gameType: GameType }
  | { type: 'start_deal' }
  | { type: 'play_cards'; cardIds: string[]; toZoneId: string; bluffClaim?: { rank: string }; wildRank?: string }
  | { type: 'move_card'; cardId: string; fromZoneId: string; toZoneId: string }
  | { type: 'draw_card'; toZoneId: string }
  | { type: 'flip_card'; cardId: string; zoneId: string }
  | { type: 'call_bluff' }
  | { type: 'resolve_bluff' }
  | { type: 'pass_turn' }
  | { type: 'next_round' }
  | { type: 'restart_round' }
  | { type: 'end_game' }
  | { type: 'kick_player'; playerId: string }
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
  // Blackjack-specific
  | { type: 'set_blackjack_config'; startingChips: number; betAmount: number }
  | { type: 'blackjack_split' }
  // Poker-specific
  | { type: 'set_poker_config'; startingChips: number; smallBlind: number }
  | { type: 'poker_check' }
  | { type: 'poker_call' }
  | { type: 'poker_bet'; amount: number }
  | { type: 'poker_all_in' }
  // Go Fish-specific
  | { type: 'gofish_ask'; targetPlayerId: string; rank: string }
  // Rummy-specific
  | { type: 'rummy_draw'; fromDiscard: boolean }
  | { type: 'rummy_discard'; cardId: string; faceDown?: boolean }
  | { type: 'set_rummy_config'; maxScore: number }
  // Euchre-specific
  | { type: 'euchre_order_up'; goAlone?: boolean }
  | { type: 'euchre_pass' }
  | { type: 'euchre_call_suit'; suit: Suit; goAlone?: boolean }
  | { type: 'euchre_discard'; cardId: string }
  // Crazy Eights-specific
  | { type: 'crazy8s_play'; cardId: string; declaredSuit?: Suit }
  | { type: 'crazy8s_draw' }
  | { type: 'set_crazy8s_config'; maxScore: number }
  | { type: 'set_spectator_preference'; staySpectator: boolean }

// Server → Client
export type ServerEvent =
  | { type: 'state'; state: GameState }
  | { type: 'action'; action: GameAction }
  | { type: 'error'; message: string }
  | { type: 'kicked'; reason: string }
  | { type: 'peek_result'; cardId: string; zoneId: string; rank: string; suit: string; duration?: number; fromInitialDeal?: boolean }
  | { type: 'round_restarted'; hostName: string }
