import type { GameState } from '@/shared/types'

export function getPokerBlinds(gameState: GameState): { sbId: string | null; bbId: string | null } {
  if (!gameState.pokerDealerPlayerId) return { sbId: null, bbId: null }
  const sorted = [...gameState.players].sort((a, b) => a.seatIndex - b.seatIndex)
  const dealerIdx = sorted.findIndex(p => p.id === gameState.pokerDealerPlayerId)
  if (dealerIdx === -1 || sorted.length < 2) return { sbId: null, bbId: null }
  const n = sorted.length
  if (n === 2) return { sbId: sorted[dealerIdx].id, bbId: sorted[(dealerIdx + 1) % n].id }
  return { sbId: sorted[(dealerIdx + 1) % n].id, bbId: sorted[(dealerIdx + 2) % n].id }
}
