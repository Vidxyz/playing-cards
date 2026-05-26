'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import type { Zone, Card as CardType, Rank } from '@playing-cards/shared'
import { Card } from './Card'

const RANK_ORDER: Record<string, number> = Object.fromEntries(
  ['2','3','4','5','6','7','8','9','10','J','Q','K','A'].map((r, i) => [r, i])
)
// President: 3 is lowest, 2 is highest power card
const PRESIDENT_RANK_ORDER: Record<string, number> = Object.fromEntries(
  ['3','4','5','6','7','8','9','10','J','Q','K','A','2'].map((r, i) => [r, i])
)
const RANK_NAMES: Record<string, [string, string]> = {
  'A': ['Ace', 'Aces'], 'J': ['Jack', 'Jacks'],
  'Q': ['Queen', 'Queens'], 'K': ['King', 'Kings'], 'JKR': ['Joker', 'Jokers'],
}
function rankLabel(rank: string, count: number): string {
  const pair = RANK_NAMES[rank]
  if (pair) return count !== 1 ? pair[1] : pair[0]
  return count !== 1 ? `${rank}s` : rank
}

function sortByRank(cards: CardType[], order = RANK_ORDER): string[] {
  return [...cards].sort((a, b) => (order[a.rank] ?? 99) - (order[b.rank] ?? 99)).map(c => c.id)
}

function sortedForGame(cards: CardType[], gameType?: string): string[] {
  if (gameType === 'president') return sortByRank(cards, PRESIDENT_RANK_ORDER)
  if (gameType === 'bluff') return sortByRank(cards)
  return cards.map(c => c.id)
}

const AUTO_SORT_GAMES = new Set(['bluff', 'president'])

// A=0 … K=12 (no JKR — jokers are wildcards, not ranked in run/set math)
const RUMMY_RANK_IDX: Record<string, number> = Object.fromEntries(
  ['A','2','3','4','5','6','7','8','9','10','J','Q','K'].map((r, i) => [r, i])
)
const SUIT_ORDER: Record<string, number> = { spades: 0, clubs: 1, hearts: 2, diamonds: 3 }

// Games where auto-arrange is not useful
const NO_AUTO_ARRANGE_GAMES = new Set(['cambio'])

// ── Rummy meld validation (mirrors server) ─────────────────────
function isRummyMeld(cards: CardType[]): boolean {
  if (cards.length < 3) return false
  const nj = cards.filter(c => c.rank !== 'JKR')
  if (nj.length === 0) return false
  // Set: all same rank, max 4
  if (nj.every(c => c.rank === nj[0].rank)) return cards.length <= 4
  // Run: same suit, no duplicate indices, span ≤ total cards
  if (!nj.every(c => c.suit === nj[0].suit)) return false
  const idxs = nj.map(c => RUMMY_RANK_IDX[c.rank])
  if (idxs.some(i => i === undefined)) return false
  const sorted = [...idxs].sort((a, b) => a - b)
  for (let i = 1; i < sorted.length; i++) if (sorted[i] === sorted[i - 1]) return false
  return sorted[sorted.length - 1] - sorted[0] + 1 <= cards.length
}

// ── Backtracking: find meld partition that maximises melded cards ──
function findBestRummyGroups(cards: CardType[]): { melds: CardType[][], deadwood: CardType[] } {
  let bestCount = -1
  let best = { melds: [] as CardType[][], deadwood: [...cards] }

  function bt(rem: CardType[], melds: CardType[][], dead: CardType[]): void {
    if (rem.length < 3) {
      const count = melds.reduce((s, m) => s + m.length, 0)
      if (count > bestCount) {
        bestCount = count
        best = { melds: melds.map(m => [...m]), deadwood: [...dead, ...rem] }
      }
      return
    }
    const anchor = rem[0]
    const others = rem.slice(1)
    const n = others.length
    // Try every subset of `others` that forms a valid meld with `anchor`
    for (let mask = 0; mask < (1 << n); mask++) {
      const sub: CardType[] = []
      for (let i = 0; i < n; i++) if (mask & (1 << i)) sub.push(others[i])
      const meld = [anchor, ...sub]
      if (meld.length < 3 || !isRummyMeld(meld)) continue
      bt(others.filter((_, i) => !(mask & (1 << i))), [...melds, meld], dead)
    }
    // Also try sending anchor to deadwood and searching the rest
    bt(others, melds, [...dead, anchor])
  }

  bt(cards, [], [])
  return best
}

function autoArrangeForGame(cards: CardType[], gameType?: string): string[] {
  if (gameType && NO_AUTO_ARRANGE_GAMES.has(gameType)) return cards.map(c => c.id)
  if (AUTO_SORT_GAMES.has(gameType ?? '')) return sortedForGame(cards, gameType)
  if (gameType === 'rummy') {
    const { melds, deadwood } = findBestRummyGroups(cards)
    const result: CardType[] = []
    // Runs first, then sets — each meld sorted internally
    const isRun = (m: CardType[]) => {
      const nj = m.filter(c => c.rank !== 'JKR')
      return nj.length > 1 && !nj.every(c => c.rank === nj[0].rank)
    }
    const ordered = [...melds].sort((a, b) => (isRun(b) ? 1 : 0) - (isRun(a) ? 1 : 0))
    for (const meld of ordered) {
      const nj = [...meld.filter(c => c.rank !== 'JKR')]
      const jkr = meld.filter(c => c.rank === 'JKR')
      if (isRun(meld)) nj.sort((a, b) => (RUMMY_RANK_IDX[a.rank] ?? 0) - (RUMMY_RANK_IDX[b.rank] ?? 0))
      else nj.sort((a, b) => (SUIT_ORDER[a.suit] ?? 0) - (SUIT_ORDER[b.suit] ?? 0))
      result.push(...nj, ...jkr)
    }
    // Deadwood: suit then rank, jokers last
    const dw = [...deadwood].sort((a, b) => {
      if ((a.rank === 'JKR') !== (b.rank === 'JKR')) return a.rank === 'JKR' ? 1 : -1
      const sd = (SUIT_ORDER[a.suit] ?? 0) - (SUIT_ORDER[b.suit] ?? 0)
      if (sd !== 0) return sd
      return (RUMMY_RANK_IDX[a.rank] ?? 13) - (RUMMY_RANK_IDX[b.rank] ?? 13)
    })
    result.push(...dw)
    return result.map(c => c.id)
  }
  // Default: sort by rank (covers blackjack, go-fish, euchre, generic)
  return sortByRank(cards)
}

// Rank picker rows shown as actual card visuals
const PICKER_RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
const PICKER_ROW1: Rank[] = ['A', '2', '3', '4', '5', '6', '7']
const PICKER_ROW2: Rank[] = ['8', '9', '10', 'J', 'Q', 'K']

// President wild (3) rank picker — 4 through Ace only (3, 2, and joker excluded)
const WILD_ROW1: Rank[] = ['4', '5', '6', '7', '8', '9', '10']
const WILD_ROW2: Rank[] = ['J', 'Q', 'K', 'A']

interface Props {
  zone: Zone
  onPlayCards?: (cardIds: string[], toZoneId: string, claim?: { rank: string }) => void
  targetZones: { id: string; name: string; isBluffPile: boolean }[]
  isMyTurn?: boolean
  gameType?: string
  bluffActiveRank?: string | null
  playLabel?: string
  highlightCardIds?: string[]
}

export function Hand({ zone, onPlayCards, targetZones, isMyTurn, gameType, bluffActiveRank, playLabel, highlightCardIds }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [targetZoneId, setTargetZoneId] = useState<string>(targetZones[0]?.id || '')
  const [arrangeMode, setArrangeMode] = useState(false)
  const [arrangeSubMode, setArrangeSubMode] = useState<'swap' | 'slot'>('slot')
  const [movingId, setMovingId] = useState<string | null>(null)
  const [customOrder, setCustomOrder] = useState<string[]>(() =>
    sortedForGame(zone.cards, gameType)
  )
  // Bluff declaration
  const [declaring, setDeclaring] = useState(false)
  const [claimRank, setClaimRank] = useState<string>('')
  // President wild (3) rank declaration
  const [declaringWild, setDeclaringWild] = useState(false)
  const [wildRank, setWildRank] = useState<string>('')

  const fanContainerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(320)
  useEffect(() => {
    const el = fanContainerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => setContainerWidth(entries[0].contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (AUTO_SORT_GAMES.has(gameType ?? '')) {
      setCustomOrder(sortedForGame(zone.cards, gameType))
    } else {
      const serverIds = zone.cards.map(c => c.id)
      setCustomOrder(prev => {
        const kept = prev.filter(id => serverIds.includes(id))
        const added = serverIds.filter(id => !prev.includes(id))
        return [...kept, ...added]
      })
    }
  }, [zone.cards, gameType])

  // Reset declaration panels when selection changes
  useEffect(() => {
    setDeclaring(false)
    setClaimRank('')
    setDeclaringWild(false)
    setWildRank('')
  }, [selected.size])

  const isBluffTarget = targetZones.find(z => z.id === targetZoneId)?.isBluffPile ?? false
  const showAutoArrange = !NO_AUTO_ARRANGE_GAMES.has(gameType ?? '')

  const handleAutoArrange = useCallback(() => {
    setCustomOrder(autoArrangeForGame(zone.cards, gameType))
    setMovingId(null)
  }, [zone.cards, gameType])

  const handleCardTap = useCallback((cardId: string) => {
    if (arrangeMode) {
      if (movingId === null) {
        setMovingId(cardId)
      } else if (movingId === cardId) {
        setMovingId(null)
      } else {
        setCustomOrder(prev => {
          const next = [...prev]
          const fromIdx = next.indexOf(movingId)
          const toIdx = next.indexOf(cardId)
          if (fromIdx === -1 || toIdx === -1) return prev
          if (arrangeSubMode === 'swap') {
            ;[next[fromIdx], next[toIdx]] = [next[toIdx], next[fromIdx]]
          } else {
            // Slot: remove movingId, insert it immediately after cardId
            next.splice(fromIdx, 1)
            const newToIdx = next.indexOf(cardId)
            next.splice(newToIdx + 1, 0, movingId)
          }
          return next
        })
        setMovingId(null)
      }
    } else {
      setSelected(prev => {
        const next = new Set(prev)
        if (next.has(cardId)) next.delete(cardId)
        else next.add(cardId)
        return next
      })
    }
  }, [arrangeMode, arrangeSubMode, movingId])

  const handlePlay = useCallback(() => {
    if (selected.size === 0 || !targetZoneId) return
    if (isBluffTarget && !bluffActiveRank) {
      // First play of cycle — need rank declaration
      setDeclaring(true)
      return
    }
    // President wilds: all selected are 3s — prompt the player to choose a rank
    if (gameType === 'president') {
      const allWild = [...selected].every(id => zone.cards.find(c => c.id === id)?.rank === '3')
      if (allWild) {
        setDeclaringWild(true)
        return
      }
    }
    // Active rank set, or non-bluff zone — play immediately
    const claim = isBluffTarget ? { rank: bluffActiveRank! } : undefined
    onPlayCards?.([...selected], targetZoneId, claim)
    setSelected(new Set())
  }, [selected, targetZoneId, isBluffTarget, bluffActiveRank, gameType, zone.cards, onPlayCards])

  const handleDeclareAndPlay = useCallback(() => {
    if (!claimRank || selected.size === 0) return
    onPlayCards?.([...selected], targetZoneId, { rank: claimRank })
    setSelected(new Set())
    setDeclaring(false)
    setClaimRank('')
  }, [claimRank, selected, targetZoneId, onPlayCards])

  const handleWildPlay = useCallback(() => {
    if (!wildRank || selected.size === 0) return
    onPlayCards?.([...selected], targetZoneId, { rank: wildRank })
    setSelected(new Set())
    setDeclaringWild(false)
    setWildRank('')
  }, [wildRank, selected, targetZoneId, onPlayCards])

  const orderedCards = customOrder
    .map(id => zone.cards.find(c => c.id === id))
    .filter((c): c is CardType => c !== undefined)

  const count = orderedCards.length
  const CARD_W = 80
  // Negative overlap = gaps between cards (spread out); positive = cards overlap (compressed)
  // Clamp negative side so cards never spread more than 36px apart
  const rawOverlap = count > 1
    ? CARD_W - (containerWidth - CARD_W) / (count - 1)
    : 0
  const overlap = Math.max(-36, rawOverlap)
  const fanWidth = count > 0 ? CARD_W + (count > 1 ? (count - 1) * (CARD_W - overlap) : 0) : CARD_W

  return (
    <div className="flex flex-col">
      {/* Fan of cards */}
      <div ref={fanContainerRef} className="relative px-4 py-2" style={{ minHeight: 136 }}>
        <div className="flex items-end" style={{ width: fanWidth }}>
          {orderedCards.map((card, i) => {
            const isSelected = arrangeMode ? movingId === card.id : selected.has(card.id)
            const isHighlighted = highlightCardIds?.includes(card.id) ?? false
            return (
              <div
                key={card.id}
                className="flex-shrink-0"
                style={{
                  marginLeft: i === 0 ? 0 : -(overlap),
                  zIndex: i,
                  position: 'relative',
                }}
              >
                {isHighlighted && (
                  <div style={{
                    position: 'absolute', bottom: -6, left: '50%', transform: 'translateX(-50%)',
                    background: 'var(--accent)', color: '#000',
                    fontSize: 9, fontWeight: 900, letterSpacing: '0.06em',
                    borderRadius: 4, padding: '2px 5px',
                    zIndex: 10, whiteSpace: 'nowrap',
                    boxShadow: '0 0 6px color-mix(in srgb, var(--accent) 70%, transparent)',
                  }}>
                    NEW
                  </div>
                )}
                <Card
                  card={card}
                  selected={isSelected}
                  animate="deal"
                  size="lg"
                  onClick={() => handleCardTap(card.id)}
                />
              </div>
            )
          })}
          {count === 0 && (
            <div style={{
              width: 80, height: 116, borderRadius: 'var(--radius-card)',
              border: '1.5px dashed rgba(255,255,255,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>empty</span>
            </div>
          )}
        </div>
      </div>

      {/* Arrange toggle */}
      <div className="flex flex-col gap-1 px-4 pb-1">
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setArrangeMode(a => !a); setMovingId(null); setSelected(new Set()); setArrangeSubMode('slot') }}
            className="text-xs px-2.5 py-1 rounded-full transition-all active:scale-95 flex-shrink-0"
            style={{
              background: arrangeMode ? 'var(--accent-dim)' : 'var(--surface-mid)',
              color: arrangeMode ? 'var(--accent)' : 'var(--text-muted)',
              border: '1px solid ' + (arrangeMode ? 'rgba(245,158,11,0.3)' : 'var(--border)'),
            }}
          >
            {arrangeMode ? 'Done' : 'Arrange'}
          </button>
          {arrangeMode && (
            <>
              <button
                onClick={() => { setArrangeSubMode('swap'); setMovingId(null) }}
                className="text-xs px-2.5 py-1 rounded-full transition-all active:scale-95 flex-shrink-0"
                style={{
                  background: arrangeSubMode === 'swap' ? 'var(--surface-hi)' : 'var(--surface-mid)',
                  color: arrangeSubMode === 'swap' ? 'var(--text)' : 'var(--text-dim)',
                  border: '1px solid ' + (arrangeSubMode === 'swap' ? 'var(--border-hi)' : 'var(--border)'),
                  fontWeight: arrangeSubMode === 'swap' ? 700 : 400,
                }}
              >
                Swap
              </button>
              <button
                onClick={() => { setArrangeSubMode('slot'); setMovingId(null) }}
                className="text-xs px-2.5 py-1 rounded-full transition-all active:scale-95 flex-shrink-0"
                style={{
                  background: arrangeSubMode === 'slot' ? 'var(--surface-hi)' : 'var(--surface-mid)',
                  color: arrangeSubMode === 'slot' ? 'var(--text)' : 'var(--text-dim)',
                  border: '1px solid ' + (arrangeSubMode === 'slot' ? 'var(--border-hi)' : 'var(--border)'),
                  fontWeight: arrangeSubMode === 'slot' ? 700 : 400,
                }}
              >
                Slot
              </button>
              {showAutoArrange && (
                <button
                  onClick={handleAutoArrange}
                  className="text-xs px-2.5 py-1 rounded-full transition-all active:scale-95 flex-shrink-0"
                  style={{
                    background: 'var(--surface-mid)',
                    color: 'var(--text-muted)',
                    border: '1px solid var(--border)',
                  }}
                >
                  Auto
                </button>
              )}
              <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
                {movingId
                  ? arrangeSubMode === 'swap'
                    ? 'Tap another card to swap'
                    : 'Tap a card to slot after'
                  : 'Tap a card to pick up'
                }
              </span>
            </>
          )}
        </div>
      </div>

      {/* Action panel */}
      {!arrangeMode && selected.size > 0 && !declaring && !declaringWild && isMyTurn !== false && (
        <div className="px-4 pb-2 flex flex-col gap-2 card-slide">
          {targetZones.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
              {targetZones.map(z => (
                <button
                  key={z.id}
                  onClick={() => setTargetZoneId(z.id)}
                  className="px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all active:scale-95"
                  style={{
                    background: targetZoneId === z.id ? 'var(--accent)' : 'var(--surface-mid)',
                    color: targetZoneId === z.id ? '#000' : 'var(--text-muted)',
                    border: '1px solid ' + (targetZoneId === z.id ? 'var(--accent)' : 'var(--border-hi)'),
                  }}
                >
                  → {z.name}
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handlePlay}
              className="flex-1 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95"
              style={{ background: 'var(--accent)', color: '#000' }}
            >
              {playLabel
                ? `${playLabel} ${selected.size} card${selected.size !== 1 ? 's' : ''}`
                : isBluffTarget
                  ? bluffActiveRank
                    ? `Play ${selected.size} ${rankLabel(bluffActiveRank, selected.size)}`
                    : `Declare & Play ${selected.size}`
                  : (() => {
                      if (gameType === 'president') {
                        const allWild = [...selected].every(id => zone.cards.find(c => c.id === id)?.rank === '3')
                        if (allWild) return `Declare ${selected.size} Wild${selected.size !== 1 ? 's' : ''}`
                      }
                      return `Play ${selected.size} card${selected.size !== 1 ? 's' : ''}`
                    })()}
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="px-4 py-2.5 rounded-xl text-sm transition-all active:scale-95"
              style={{ background: 'var(--surface-mid)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Rank declaration panel — only needed on first play of a cycle */}
      {!arrangeMode && declaring && (
        <div className="px-4 pb-3 flex flex-col gap-3 card-slide">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
              Playing {selected.size} — what rank are you claiming?
            </p>
            <button
              onClick={() => setDeclaring(false)}
              className="text-xs px-2 py-0.5 rounded-full"
              style={{ color: 'var(--text-dim)', background: 'var(--surface-mid)', border: '1px solid var(--border)' }}
            >
              ✕
            </button>
          </div>

          {/* Card visual rank picker — 2 rows */}
          <div className="flex flex-col gap-1.5">
            {[PICKER_ROW1, PICKER_ROW2].map((row, ri) => (
              <div key={ri} className="flex gap-1.5">
                {row.map(r => {
                  const isActive = claimRank === r
                  return (
                    <div
                      key={r}
                      onClick={() => setClaimRank(r)}
                      style={{
                        cursor: 'pointer',
                        outline: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                        outlineOffset: 2,
                        borderRadius: 'var(--radius-card)',
                        transition: 'outline 0.12s ease',
                        flex: 1, height: 48,
                        background: 'white',
                        border: '1px solid rgba(0,0,0,0.12)',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#111',
                        fontSize: 13, fontWeight: 700,
                        userSelect: 'none',
                      }}
                    >
                      {r}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>

          <button
            disabled={!claimRank}
            onClick={handleDeclareAndPlay}
            className="w-full py-3 rounded-2xl font-bold text-sm transition-all active:scale-95"
            style={{
              background: claimRank ? 'var(--accent)' : 'var(--surface-mid)',
              color: claimRank ? '#000' : 'var(--text-dim)',
              cursor: claimRank ? 'pointer' : 'not-allowed',
            }}
          >
            {claimRank
              ? `Claim "${selected.size} ${rankLabel(claimRank, selected.size)}" & Play`
              : 'Pick a rank above'}
          </button>
        </div>
      )}

      {/* President wild (3) rank declaration panel */}
      {!arrangeMode && declaringWild && (
        <div className="px-4 pb-3 flex flex-col gap-3 card-slide">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
              {selected.size === 1 ? 'Wild 3 — play it as what rank?' : `${selected.size} Wild 3s — play them as what rank?`}
            </p>
            <button
              onClick={() => setDeclaringWild(false)}
              className="text-xs px-2 py-0.5 rounded-full"
              style={{ color: 'var(--text-dim)', background: 'var(--surface-mid)', border: '1px solid var(--border)' }}
            >
              ✕
            </button>
          </div>

          {/* Rank picker — 2 rows, excluding 3 and joker */}
          <div className="flex flex-col gap-1.5">
            {[WILD_ROW1, WILD_ROW2].map((row, ri) => (
              <div key={ri} className="flex gap-1.5">
                {row.map(r => {
                  const isActive = wildRank === r
                  return (
                    <div
                      key={r}
                      onClick={() => setWildRank(r)}
                      style={{
                        cursor: 'pointer',
                        outline: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                        outlineOffset: 2,
                        borderRadius: 'var(--radius-card)',
                        transition: 'outline 0.12s ease',
                        flex: 1, height: 48,
                        background: 'white',
                        border: '1px solid rgba(0,0,0,0.12)',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#111',
                        fontSize: 13, fontWeight: 700,
                        userSelect: 'none',
                      }}
                    >
                      {r}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>

          <button
            disabled={!wildRank}
            onClick={handleWildPlay}
            className="w-full py-3 rounded-2xl font-bold text-sm transition-all active:scale-95"
            style={{
              background: wildRank ? 'var(--accent)' : 'var(--surface-mid)',
              color: wildRank ? '#000' : 'var(--text-dim)',
              cursor: wildRank ? 'pointer' : 'not-allowed',
            }}
          >
            {wildRank
              ? `Play as ${selected.size === 1 ? rankLabel(wildRank, 1) : `${selected.size} ${rankLabel(wildRank, selected.size)}`}`
              : 'Pick a rank above'}
          </button>
        </div>
      )}
    </div>
  )
}
