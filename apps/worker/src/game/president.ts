import type { Card, Suit } from '@playing-cards/shared'

export const SUIT_VALUE: Record<Suit, number> = { diamonds: 1, clubs: 2, hearts: 3, spades: 4 }

// 3 is wildcard (lowest, never a normal value); 2 is the power card (highest normal)
export const PRESIDENT_RANK_VALUE: Record<string, number> = {
  '3': 0, '4': 1, '5': 2, '6': 3, '7': 4, '8': 5, '9': 6,
  '10': 7, 'J': 8, 'Q': 9, 'K': 10, 'A': 11, '2': 12, 'JKR': 99,
}

export function isJoker(card: Card): boolean { return card.rank === 'JKR' }
export function isTwo(card: Card): boolean   { return card.rank === '2' }
export function isWild(card: Card): boolean  { return card.rank === '3' }

/** The rank shared by all non-wild, non-special cards in a combo. */
function nonWildRank(cards: Card[]): string | null {
  for (const c of cards) {
    if (!isWild(c) && !isJoker(c) && !isTwo(c)) return c.rank
  }
  return null
}

/** Highest suit entry in a combo (wildcards use their own suit). */
function topSuit(cards: Card[]): { suit: Suit; fromWild: boolean } | null {
  let best: { suit: Suit; fromWild: boolean } | null = null
  for (const c of cards) {
    if (isJoker(c)) continue
    const entry = { suit: c.suit, fromWild: isWild(c) }
    if (!best) { best = entry; continue }
    const sv = SUIT_VALUE[entry.suit], bv = SUIT_VALUE[best.suit]
    if (sv > bv || (sv === bv && !entry.fromWild && best.fromWild)) best = entry
  }
  return best
}

export interface PresidentCombo {
  rank: string           // effective rank ('2' for 2-play, 'JKR' for joker)
  maxSuit: Suit          // highest suit in the combo
  count: number          // parity (number of cards)
  maxSuitIsWild: boolean // is the max-suit card a wildcard?
}

/**
 * Parse a set of cards into a PresidentCombo for comparison.
 * Returns null if the combo is structurally invalid.
 */
export function parseCombo(cards: Card[]): PresidentCombo | null {
  if (cards.length === 0) return null

  // Joker must be alone
  if (cards.some(isJoker)) {
    if (cards.length !== 1) return null
    return { rank: 'JKR', maxSuit: cards[0].suit, count: 1, maxSuitIsWild: false }
  }

  // All 2s
  if (cards.every(isTwo)) {
    const ts = topSuit(cards)
    if (!ts) return null
    return { rank: '2', maxSuit: ts.suit, count: cards.length, maxSuitIsWild: ts.fromWild }
  }

  // No mixing 2s with normal/wild cards
  if (cards.some(isTwo)) return null

  // Normal / wildcard combo — derive rank from non-wild cards
  const rank = nonWildRank(cards)
  if (!rank) return null  // all wildcards — undefined rank

  // All non-wild cards must share the same rank
  if (!cards.filter(c => !isWild(c)).every(c => c.rank === rank)) return null

  const ts = topSuit(cards)
  if (!ts) return null

  return { rank, maxSuit: ts.suit, count: cards.length, maxSuitIsWild: ts.fromWild }
}

/**
 * Returns true if combo `a` legally beats combo `b`.
 * b === null means the table is empty — anything is valid.
 */
export function comboBeats(a: PresidentCombo, b: PresidentCombo | null): boolean {
  if (!b) return true          // empty table
  if (a.rank === 'JKR') return true  // joker beats everything

  // 2s bypass rank; need exactly max(1, b.count-1) of them
  if (a.rank === '2') {
    return a.count === Math.max(1, b.count - 1)
  }

  // Normal/wild: parity must match
  if (a.count !== b.count) return false

  const rv_a = PRESIDENT_RANK_VALUE[a.rank] ?? -1
  const rv_b = PRESIDENT_RANK_VALUE[b.rank] ?? -1
  if (rv_a > rv_b) return true
  if (rv_a < rv_b) return false

  // Same rank: compare max suit
  const sv_a = SUIT_VALUE[a.maxSuit]
  const sv_b = SUIT_VALUE[b.maxSuit]
  if (sv_a > sv_b) return true
  if (sv_a < sv_b) return false

  // Same suit: real card beats wildcard
  return !a.maxSuitIsWild && b.maxSuitIsWild
}

/**
 * Returns true if playing `a` over `b` constitutes a suit burn.
 * A suit burn only happens when the same rank is beaten by a higher suit
 * (or a real card beats a wildcard of the same suit).
 * Joker always burns regardless of rank.
 */
export function isBurn(a: PresidentCombo, b: PresidentCombo | null): boolean {
  // Joker always burns — even on an empty table — so the player goes again
  if (a.rank === 'JKR') return true
  if (!b) return false
  // Suit burns only trigger on the same rank
  if (a.rank !== b.rank) return false

  const sv_a = SUIT_VALUE[a.maxSuit]
  const sv_b = SUIT_VALUE[b.maxSuit]
  if (sv_a > sv_b) return true
  if (sv_a < sv_b) return false
  // Equal suit: burn if a's is real and b's was wild
  return !a.maxSuitIsWild && b.maxSuitIsWild
}

export type PresidentRole = 'president' | 'vp' | 'neutral' | 'vb' | 'bum'

/** Assign roles based on finish order (index 0 = first to finish = President). */
export function assignRoles(finishOrder: string[], totalPlayers: number): Record<string, string> {
  const n = finishOrder.length
  const roles: Record<string, string> = {}
  for (let i = 0; i < n; i++) {
    const pid = finishOrder[i]
    if (i === 0)              roles[pid] = 'president'
    else if (i === 1 && totalPlayers >= 4) roles[pid] = 'vp'
    else if (i === n - 1)     roles[pid] = 'bum'
    else if (i === n - 2 && totalPlayers >= 4) roles[pid] = 'vb'
    else                      roles[pid] = 'neutral'
  }
  return roles
}

/** Sort cards highest value first (for card exchange: best → worst). */
export function sortBest(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => {
    const dr = (PRESIDENT_RANK_VALUE[b.rank] ?? -1) - (PRESIDENT_RANK_VALUE[a.rank] ?? -1)
    if (dr !== 0) return dr
    return SUIT_VALUE[b.suit] - SUIT_VALUE[a.suit]
  })
}
