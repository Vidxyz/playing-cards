import type { Card } from './types'

const RANK_NAMES: Record<string, [string, string]> = {
  A:   ['Ace',   'Aces'],
  J:   ['Jack',  'Jacks'],
  Q:   ['Queen', 'Queens'],
  K:   ['King',  'Kings'],
  JKR: ['Joker', 'Jokers'],
}

export function rankName(rank: string, count: number): string {
  const pair = RANK_NAMES[rank]
  if (pair) return count !== 1 ? pair[1] : pair[0]
  return count !== 1 ? `${rank}s` : rank
}

const RUMMY_RANK_ORDER = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']

export function isValidRummyMeld(cards: Card[]): boolean {
  if (cards.length < 3) return false
  const nonJokers = cards.filter(c => c.rank !== 'JKR')
  if (nonJokers.length === 0) return false
  if (nonJokers.every(c => c.rank === nonJokers[0].rank)) return cards.length <= 4
  if (!nonJokers.every(c => c.suit === nonJokers[0].suit)) return false
  const rankIndices = nonJokers.map(c => RUMMY_RANK_ORDER.indexOf(c.rank))
  if (rankIndices.some(i => i === -1)) return false
  rankIndices.sort((a, b) => a - b)
  for (let i = 1; i < rankIndices.length; i++) {
    if (rankIndices[i] === rankIndices[i - 1]) return false
  }
  const span = rankIndices.at(-1)! - rankIndices[0] + 1
  return span <= cards.length
}

export function isRummyPureRun(cards: Card[]): boolean {
  if (cards.some(c => c.rank === 'JKR')) return false
  if (cards.every(c => c.rank === cards[0].rank)) return false
  return isValidRummyMeld(cards)
}

export function checkRummyGoOut(cards: Card[]): 'ok' | 'cant-meld' | 'no-pure-run' {
  let foundOk = false
  let foundComplete = false
  function bt(rem: Card[], hasPureRun: boolean): void {
    if (foundOk) return
    if (rem.length === 0) { foundComplete = true; if (hasPureRun) foundOk = true; return }
    if (rem.length < 3) return
    const [anchor, ...others] = rem
    const n = others.length
    for (let mask = 0; mask < (1 << n); mask++) {
      if (foundOk) return
      const sub: Card[] = []
      for (let i = 0; i < n; i++) if (mask & (1 << i)) sub.push(others[i])
      const meld = [anchor, ...sub]
      if (meld.length < 3 || !isValidRummyMeld(meld)) continue
      bt(others.filter((_, i) => !(mask & (1 << i))), hasPureRun || isRummyPureRun(meld))
    }
  }
  bt(cards, false)
  if (foundOk) return 'ok'
  if (foundComplete) return 'no-pure-run'
  return 'cant-meld'
}
