import type { Card, Suit, Rank, DeckFilter } from '@playing-cards/shared'

const SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs']
const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']

const SUIT_ABBR: Record<Suit, string> = {
  spades: 'S', hearts: 'H', diamonds: 'D', clubs: 'C'
}

function makeCard(rank: Rank, suit: Suit, copy = 0): Card {
  const suffix = copy > 0 ? `_${copy}` : ''
  return { id: `${rank}${SUIT_ABBR[suit]}${suffix}`, rank, suit }
}

export function buildDeck(filter: DeckFilter = {}): Card[] {
  const ranks = filter.ranks ?? RANKS
  const suits = filter.suits ?? SUITS
  const copies = filter.copies ?? 1

  const cards: Card[] = []
  for (let c = 0; c < copies; c++) {
    for (const suit of suits) {
      for (const rank of ranks) {
        cards.push(makeCard(rank, suit, c))
      }
    }
  }
  return cards
}

export function shuffle(cards: Card[]): Card[] {
  const arr = [...cards]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

// Euchre uses 9,10,J,Q,K,A only
export const EUCHRE_RANKS: Rank[] = ['9', '10', 'J', 'Q', 'K', 'A']
