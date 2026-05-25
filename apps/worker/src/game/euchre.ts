import type { Card, Suit, Player } from '@playing-cards/shared'

/** The same-colour suit that contributes the left bower */
export function leftBowerSuit(trump: Suit): Suit {
  if (trump === 'spades')   return 'clubs'
  if (trump === 'clubs')    return 'spades'
  if (trump === 'hearts')   return 'diamonds'
  return 'hearts'
}

export function isRightBower(card: Card, trump: Suit): boolean {
  return card.rank === 'J' && card.suit === trump
}

export function isLeftBower(card: Card, trump: Suit): boolean {
  return card.rank === 'J' && card.suit === leftBowerSuit(trump)
}

export function isTrump(card: Card, trump: Suit): boolean {
  return card.suit === trump || isLeftBower(card, trump)
}

/** Effective suit for follow-suit purposes (left bower = trump) */
export function effectiveSuit(card: Card, trump: Suit): Suit {
  return isLeftBower(card, trump) ? trump : card.suit
}

const TRUMP_RANK: Record<string, number> = { '9': 1, '10': 2, 'Q': 4, 'K': 5, 'A': 6 }
const PLAIN_RANK:  Record<string, number> = { '9': 1, '10': 2, 'J': 3, 'Q': 4, 'K': 5, 'A': 6 }

/** Higher = stronger card. -1 means the card cannot win (off-suit, no trump played). */
function cardStrength(card: Card, trump: Suit, ledSuit: Suit): number {
  if (isRightBower(card, trump))          return 1000
  if (isLeftBower(card, trump))           return 900
  if (isTrump(card, trump))               return 100 + (TRUMP_RANK[card.rank] ?? 0)
  if (effectiveSuit(card, trump) === ledSuit) return PLAIN_RANK[card.rank] ?? 0
  return -1
}

export function determineTrickWinner(
  plays: Array<{ playerId: string; card: Card }>,
  trump: Suit,
  ledSuit: Suit,
): string {
  let best = plays[0]
  let bestStr = cardStrength(plays[0].card, trump, ledSuit)
  for (const play of plays.slice(1)) {
    const s = cardStrength(play.card, trump, ledSuit)
    if (s > bestStr) { best = play; bestStr = s }
  }
  return best.playerId
}

/** Returns [leftOfDealer, ..., dealer] */
export function biddingOrder(players: Player[], dealerPlayerId: string): string[] {
  const sorted = [...players].sort((a, b) => a.seatIndex - b.seatIndex)
  const dealerSeat = players.find(p => p.id === dealerPlayerId)!.seatIndex
  const startSeat  = (dealerSeat + 1) % 4
  const startIdx   = sorted.findIndex(p => p.seatIndex === startSeat)
  return [...sorted.slice(startIdx), ...sorted.slice(0, startIdx)].map(p => p.id)
}

export function findPartner(players: Player[], playerId: string): Player | undefined {
  const me = players.find(p => p.id === playerId)
  if (!me) return undefined
  return players.find(p => p.teamId === me.teamId && p.id !== playerId)
}
