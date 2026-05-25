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
