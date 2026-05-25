import type { Card } from '@playing-cards/shared'

const RANK_VAL: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
  '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
}

export interface HandResult {
  score: number
  name: string
}

function rv(rank: string): number { return RANK_VAL[rank] ?? 0 }

function evaluateFive(cards: Card[]): HandResult {
  const vals = cards.map(c => rv(c.rank)).sort((a, b) => b - a)
  const suits = cards.map(c => c.suit)
  const isFlush = suits.every(s => s === suits[0])
  const isStr8 = new Set(vals).size === 5 && vals[0] - vals[4] === 4
  const isWheel = vals[0] === 14 && vals[1] === 5 && vals[2] === 4 && vals[3] === 3 && vals[4] === 2

  const cnt = new Map<number, number>()
  for (const v of vals) cnt.set(v, (cnt.get(v) ?? 0) + 1)
  const g = [...cnt.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])

  if (isFlush && (isStr8 || isWheel)) {
    const hi = isWheel ? 5 : vals[0]
    return { score: 8_000_000 + hi, name: hi === 14 ? 'Royal Flush' : 'Straight Flush' }
  }
  if (g[0][1] === 4) return { score: 7_000_000 + g[0][0] * 20 + g[1][0], name: 'Four of a Kind' }
  if (g[0][1] === 3 && g[1][1] === 2) return { score: 6_000_000 + g[0][0] * 20 + g[1][0], name: 'Full House' }
  if (isFlush) return {
    score: 5_000_000 + vals[0] * 1e4 + vals[1] * 1e3 + vals[2] * 100 + vals[3] * 10 + vals[4],
    name: 'Flush',
  }
  if (isStr8 || isWheel) return { score: 4_000_000 + (isWheel ? 5 : vals[0]), name: 'Straight' }
  if (g[0][1] === 3) return {
    score: 3_000_000 + g[0][0] * 400 + g[1][0] * 20 + g[2][0],
    name: 'Three of a Kind',
  }
  if (g[0][1] === 2 && g[1][1] === 2) {
    const hi = Math.max(g[0][0], g[1][0]), lo = Math.min(g[0][0], g[1][0])
    return { score: 2_000_000 + hi * 400 + lo * 20 + g[2][0], name: 'Two Pair' }
  }
  if (g[0][1] === 2) return {
    score: 1_000_000 + g[0][0] * 8000 + g[1][0] * 400 + g[2][0] * 20 + g[3][0],
    name: 'One Pair',
  }
  return {
    score: vals[0] * 80000 + vals[1] * 4000 + vals[2] * 200 + vals[3] * 10 + vals[4],
    name: 'High Card',
  }
}

function combos<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]]
  if (arr.length < k) return []
  const [h, ...t] = arr
  return [...combos(t, k - 1).map(c => [h, ...c]), ...combos(t, k)]
}

export function bestHand(cards: Card[]): HandResult {
  let best: HandResult = { score: -1, name: '' }
  for (const combo of combos(cards, 5)) {
    const r = evaluateFive(combo)
    if (r.score > best.score) best = r
  }
  return best
}
