import type { GameConfig, ZoneTemplate } from '@playing-cards/shared'
import { EUCHRE_RANKS } from './deck'

export const GAME_CONFIGS: Record<string, GameConfig> = {
  president: {
    gameType: 'president',
    label: 'President',
    description: 'Get rid of all your cards first. Play higher combos to beat the pile.',
    minPlayers: 2,
    maxPlayers: 8,
    deckFilter: {},
    cardsPerPlayer: 'all',
    hasTeams: false,
    hasTurnOrder: true,
    zoneTemplates: [
      { id: 'hand', name: 'Hand', visibility: 'owner-only', perPlayer: true, capacity: null },
      { id: 'play-pile', name: 'Play Pile', visibility: 'face-up', perPlayer: false, capacity: null },
      { id: 'cleared', name: 'Cleared', visibility: 'face-down', perPlayer: false, capacity: null },
    ],
  },

  blackjack: {
    gameType: 'blackjack',
    label: 'Blackjack',
    description: 'Get as close to 21 as possible without going over. Beat the dealer.',
    minPlayers: 2,
    maxPlayers: 7,
    deckFilter: {},
    cardsPerPlayer: 2,
    hasTeams: false,
    hasTurnOrder: true,
    dealerZoneId: 'dealer-hand',
    zoneTemplates: [
      { id: 'hand', name: 'Hand', visibility: 'face-up', perPlayer: true, capacity: null },
      { id: 'dealer-hand', name: 'Dealer', visibility: 'face-up', perPlayer: false, capacity: null },
    ],
  },

  poker: {
    gameType: 'poker',
    label: 'Poker',
    description: 'Texas Hold\'em. Best 5-card hand wins.',
    minPlayers: 2,
    maxPlayers: 9,
    deckFilter: {},
    cardsPerPlayer: 2,
    hasTeams: false,
    hasTurnOrder: true,
    zoneTemplates: [
      { id: 'hole-cards', name: 'Hole Cards', visibility: 'owner-only', perPlayer: true, capacity: 2 },
      { id: 'flop', name: 'Flop', visibility: 'face-up', perPlayer: false, capacity: 3 },
      { id: 'turn', name: 'Turn', visibility: 'face-up', perPlayer: false, capacity: 1 },
      { id: 'river', name: 'River', visibility: 'face-up', perPlayer: false, capacity: 1 },
      { id: 'burn', name: 'Burn', visibility: 'face-down', perPlayer: false, capacity: null },
    ],
  },

  euchre: {
    gameType: 'euchre',
    label: 'Euchre',
    description: '2v2 trick-taking game. First team to 10 points wins.',
    minPlayers: 4,
    maxPlayers: 4,
    deckFilter: { ranks: EUCHRE_RANKS },
    cardsPerPlayer: 5,
    hasTeams: true,
    hasTurnOrder: true,
    zoneTemplates: [
      { id: 'hand', name: 'Hand', visibility: 'owner-only', perPlayer: true, capacity: null },
      { id: 'kitty', name: 'Kitty', visibility: 'face-down', perPlayer: false, capacity: 5 },
      { id: 'trick', name: 'Trick', visibility: 'face-up', perPlayer: true, capacity: 1 },
      { id: 'tricks-a', name: 'Team A Tricks', visibility: 'face-down', perPlayer: false, capacity: null },
      { id: 'tricks-b', name: 'Team B Tricks', visibility: 'face-down', perPlayer: false, capacity: null },
    ],
  },

  cambio: {
    gameType: 'cambio',
    label: 'Cambio',
    description: 'Lowest total wins. Swap and peek — call Cambio when ready.',
    minPlayers: 2,
    maxPlayers: 6,
    deckFilter: {},
    cardsPerPlayer: 4,
    hasTeams: false,
    hasTurnOrder: true,
    zoneTemplates: [
      // 4 positional slots per player (2x2 grid), generated dynamically in deal.ts
      { id: 'pos', name: 'Cards', visibility: 'face-down', perPlayer: true, capacity: 1, gridRows: 2, gridCols: 2 },
      { id: 'discard', name: 'Discard', visibility: 'face-up', perPlayer: false, capacity: null },
    ],
  },

  'go-fish': {
    gameType: 'go-fish',
    label: 'Go Fish',
    description: 'Collect sets of 4 to make books. Ask players for ranks you hold.',
    minPlayers: 2,
    maxPlayers: 6,
    deckFilter: {},
    cardsPerPlayer: 5,
    hasTeams: false,
    hasTurnOrder: true,
    zoneTemplates: [
      { id: 'hand', name: 'Hand', visibility: 'owner-only', perPlayer: true, capacity: null },
      { id: 'books', name: 'Books', visibility: 'face-up', perPlayer: true, capacity: null },
    ],
  },

  rummy: {
    gameType: 'rummy',
    label: 'Rummy',
    description: 'Form melds of sets and runs. Go out by emptying your hand.',
    minPlayers: 2,
    maxPlayers: 6,
    deckFilter: { jokerCount: 2 },
    cardsPerPlayer: 7,
    hasTeams: false,
    hasTurnOrder: true,
    zoneTemplates: [
      { id: 'hand', name: 'Hand', visibility: 'owner-only', perPlayer: true, capacity: null },
      { id: 'discard', name: 'Discard', visibility: 'face-up', perPlayer: false, capacity: null },
    ],
  },

  bluff: {
    gameType: 'bluff',
    label: 'Bluff',
    description: 'Play face-down and claim anything. Get caught lying and take the pile.',
    minPlayers: 3,
    maxPlayers: 8,
    deckFilter: {},
    cardsPerPlayer: 'all',
    hasTeams: false,
    hasTurnOrder: true,
    zoneTemplates: [
      { id: 'hand', name: 'Hand', visibility: 'owner-only', perPlayer: true, capacity: null },
      { id: 'bluff-pile', name: 'Bluff Pile', visibility: 'face-down', perPlayer: false, capacity: null, isBluffPile: true },
    ],
  },
}

export function getConfig(gameType: string): GameConfig | null {
  return GAME_CONFIGS[gameType] ?? null
}
