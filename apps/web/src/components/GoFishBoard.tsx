'use client'

import { useState, useEffect, useRef } from 'react'
import type { GameState, ClientEvent, Rank, Card as CardType } from '@playing-cards/shared'
import { Card } from './Card'

interface Props {
  gameState: GameState
  myPlayerId: string
  send: (event: ClientEvent) => void
  isHost: boolean
}

const RANK_ORDER: Rank[] = ['2','3','4','5','6','7','8','9','10','J','Q','K','A']
const RANK_LABEL: Record<string, string> = {
  '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7',
  '8': '8', '9': '9', '10': '10', 'J': 'J', 'Q': 'Q', 'K': 'K', 'A': 'A',
}

export function GoFishBoard({ gameState, myPlayerId, send, isHost }: Props) {
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null)
  const [selectedRank, setSelectedRank] = useState<string | null>(null)
  const [newBookFlash, setNewBookFlash] = useState(false)

  const isMyTurn = gameState.currentTurnPlayerId === myPlayerId

  const myHand = gameState.zones.find(z => z.id === `hand-${myPlayerId}`)
  const myCards = myHand?.cards ?? []
  const sortedCards = [...myCards].sort(
    (a, b) => RANK_ORDER.indexOf(a.rank as Rank) - RANK_ORDER.indexOf(b.rank as Rank)
  )
  const myHandRanks = [...new Set(myCards.map(c => c.rank as Rank))]
    .sort((a, b) => RANK_ORDER.indexOf(a) - RANK_ORDER.indexOf(b))

  const otherPlayers = gameState.players.filter(p => p.id !== myPlayerId)
  const currentTurnPlayer = gameState.players.find(p => p.id === gameState.currentTurnPlayerId)

  const canAsk = isMyTurn
    && selectedTarget !== null
    && selectedRank !== null
    && myHandRanks.includes(selectedRank as Rank)

  // Flash my books section whenever I complete a new book
  const myBookCount = gameState.goFishBooks[myPlayerId]?.length ?? 0
  const prevMyBookCount = useRef(myBookCount)
  useEffect(() => {
    if (myBookCount > prevMyBookCount.current) {
      setNewBookFlash(true)
      const t = setTimeout(() => setNewBookFlash(false), 700)
      prevMyBookCount.current = myBookCount
      return () => clearTimeout(t)
    }
    prevMyBookCount.current = myBookCount
  }, [myBookCount])

  // Clear selected rank if we no longer hold it (e.g. after a successful ask takes all copies)
  useEffect(() => {
    if (selectedRank && !myHandRanks.includes(selectedRank as Rank)) {
      setSelectedRank(null)
    }
  }, [myHandRanks, selectedRank])

  const handleAsk = () => {
    if (!canAsk || !selectedTarget || !selectedRank) return
    send({ type: 'gofish_ask', targetPlayerId: selectedTarget, rank: selectedRank })
    setSelectedTarget(null)
    setSelectedRank(null)
  }

  const lastAsk = gameState.goFishLastAsk

  const getHandCount = (pid: string) => {
    const zone = gameState.zones.find(z => z.id === `hand-${pid}`)
    return zone?.cards.filter(c => !c.id.startsWith('hidden_')).length ?? zone?.cards.length ?? 0
  }
  const getBookCount = (pid: string) => gameState.goFishBooks[pid]?.length ?? 0
  const getBookRanks = (pid: string): string[] => gameState.goFishBooks[pid] ?? []

  return (
    <div className="w-full flex flex-col gap-3 pb-3">

      {/* ── Turn indicator ── */}
      {gameState.phase === 'playing' && gameState.currentTurnPlayerId && (
        <div
          className={`mx-auto px-4 py-2 rounded-full text-sm font-bold ${isMyTurn ? 'turn-pulse' : ''}`}
          style={isMyTurn
            ? { background: 'var(--accent)', color: '#000' }
            : { background: 'var(--surface-hi)', color: 'var(--text-muted)', border: '1px solid var(--border-hi)' }
          }
        >
          {isMyTurn ? '🎣 Your turn!' : `${currentTurnPlayer?.name ?? '?'}'s turn`}
        </div>
      )}

      {/* ── Last ask result ── */}
      {lastAsk && (
        <LastAskBanner
          key={`${lastAsk.askerId}-${lastAsk.targetId}-${lastAsk.rank}-${String(lastAsk.success)}-${String(lastAsk.luckyFish)}`}
          lastAsk={lastAsk}
          players={gameState.players}
          myPlayerId={myPlayerId}
          drawPileCount={gameState.drawPileCount}
        />
      )}

      {/* ── Other players row (scrollable) ── */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar px-1 pb-1">
        {otherPlayers.map(p => {
          const handCount = getHandCount(p.id)
          const bookCount = getBookCount(p.id)
          const bookRanks = getBookRanks(p.id)
          const isSelected = selectedTarget === p.id
          const isCurrent = gameState.currentTurnPlayerId === p.id

          return (
            <button
              key={p.id}
              onClick={() => isMyTurn && setSelectedTarget(isSelected ? null : p.id)}
              className="flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-2xl transition-all active:scale-95 flex-shrink-0"
              style={{
                background: isSelected ? 'var(--accent-dim)' : 'var(--surface-hi)',
                border: isSelected
                  ? '2px solid var(--accent)'
                  : isCurrent
                    ? '2px solid rgba(255,255,255,0.2)'
                    : '1px solid var(--border-hi)',
                opacity: p.isConnected ? 1 : 0.5,
                cursor: isMyTurn ? 'pointer' : 'default',
                minWidth: 88,
              }}
            >
              <div className="flex items-center gap-1.5">
                <div
                  className="flex items-center justify-center rounded-full text-[10px] font-black flex-shrink-0"
                  style={{
                    width: 22, height: 22,
                    background: isCurrent ? 'var(--accent)' : 'var(--surface-mid)',
                    color: isCurrent ? '#000' : 'var(--text-muted)',
                  }}
                >
                  {p.name.slice(0, 2).toUpperCase()}
                </div>
                <span className="text-xs font-bold truncate max-w-[72px]" style={{ color: 'var(--text)' }}>
                  {p.name}
                </span>
                {!p.isConnected && <span style={{ color: 'var(--text-dim)', fontSize: 8 }}>●</span>}
              </div>

              <div className="flex items-center gap-2">
                <div className="flex flex-col items-center">
                  <span className="text-sm font-black" style={{ color: 'var(--text)' }}>{handCount}</span>
                  <span className="text-[8px] uppercase tracking-wide" style={{ color: 'var(--text-dim)' }}>cards</span>
                </div>
                <div className="w-px h-5" style={{ background: 'var(--border)' }} />
                <div className="flex flex-col items-center">
                  <span className="text-sm font-black" style={{ color: bookCount > 0 ? 'var(--accent)' : 'var(--text-muted)' }}>
                    {bookCount}
                  </span>
                  <span className="text-[8px] uppercase tracking-wide" style={{ color: 'var(--text-dim)' }}>books</span>
                </div>
              </div>

              {bookRanks.length > 0 && (
                <div className="flex flex-wrap gap-0.5 justify-center">
                  {bookRanks.map(r => (
                    <span key={r} className="text-[8px] font-bold px-1 py-0.5 rounded"
                      style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid rgba(245,158,11,0.25)' }}>
                      {RANK_LABEL[r] ?? r}
                    </span>
                  ))}
                </div>
              )}

              {isSelected && (
                <span className="text-[9px] font-bold fade-in" style={{ color: 'var(--accent)' }}>Selected ✓</span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Draw pile ── */}
      {(() => {
        const pileEmpty = gameState.drawPileCount === 0
        return (
          <div className="flex items-center justify-center gap-3">
            <div className="flex flex-col items-center gap-1">
              <div className="relative" style={{ width: 52, height: 74 }}>
                {!pileEmpty && (
                  <div style={{
                    position: 'absolute', top: -2, left: -2, width: 52, height: 74,
                    borderRadius: 'var(--radius-card)',
                    background: 'linear-gradient(145deg,#1a2d54,#1e3560)',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }} />
                )}
                <div style={{
                  position: 'absolute', top: 0, left: 0, width: 52, height: 74,
                  borderRadius: 'var(--radius-card)',
                  background: pileEmpty
                    ? 'rgba(255,255,255,0.04)'
                    : 'linear-gradient(145deg,#243f72,#1e3560)',
                  border: pileEmpty
                    ? '1.5px dashed rgba(255,255,255,0.12)'
                    : '1px solid rgba(255,255,255,0.12)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  opacity: pileEmpty ? 0.5 : 1,
                }}>
                  <span style={{ color: pileEmpty ? 'var(--text-dim)' : 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: 700 }}>
                    {pileEmpty ? '—' : gameState.drawPileCount}
                  </span>
                </div>
              </div>
              <span className="text-[9px] uppercase tracking-widest" style={{ color: pileEmpty ? 'var(--text-dim)' : 'var(--text-dim)' }}>
                {pileEmpty ? 'pile empty' : 'draw pile'}
              </span>
            </div>
            {!isMyTurn && gameState.phase === 'playing' && currentTurnPlayer && (
              <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
                Waiting for {currentTurnPlayer.name}…
              </span>
            )}
          </div>
        )
      })()}

      {/* ── My hand ── */}
      <div style={{ borderTop: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between px-4 pt-2 pb-1">
          <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--text-dim)' }}>
            Your hand ({myCards.length})
          </span>
          {selectedRank && (
            <button
              onClick={() => setSelectedRank(null)}
              className="text-[10px] px-2 py-0.5 rounded-full"
              style={{ color: 'var(--text-dim)', background: 'var(--surface-mid)', border: '1px solid var(--border)' }}
            >
              Clear ✕
            </button>
          )}
        </div>

        <GoFishHand
          cards={sortedCards}
          selectedRank={selectedRank}
          onSelectRank={rank => {
            if (!isMyTurn) return
            setSelectedRank(prev => prev === rank ? null : rank)
          }}
          isMyTurn={isMyTurn}
        />

        {/* Ask controls */}
        {isMyTurn && gameState.phase === 'playing' && (
          <div className="px-4 pb-2 flex flex-col gap-2">
            <p className="text-center text-xs fade-in" style={{ color: selectedRank && selectedTarget ? 'var(--accent)' : 'var(--text-dim)' }}>
              {!selectedRank && !selectedTarget && 'Tap a card to pick a rank, then tap a player'}
              {selectedRank && !selectedTarget && `Asking for ${RANK_LABEL[selectedRank]}s — tap a player above`}
              {!selectedRank && selectedTarget && `Asking ${otherPlayers.find(p => p.id === selectedTarget)?.name} — tap a card to pick rank`}
              {selectedRank && selectedTarget && `Ready! Ask for ${RANK_LABEL[selectedRank]}s`}
            </p>
            <button
              onClick={handleAsk}
              disabled={!canAsk}
              className="w-full py-3 rounded-2xl font-black text-sm tracking-widest uppercase transition-all active:scale-95"
              style={canAsk
                ? { background: 'var(--accent)', color: '#000', boxShadow: '0 0 16px rgba(245,158,11,0.3)' }
                : { background: 'var(--surface-mid)', color: 'var(--text-dim)', border: '1px solid var(--border)', cursor: 'not-allowed' }
              }
            >
              {canAsk
                ? `Ask ${gameState.players.find(p => p.id === selectedTarget)?.name} for ${RANK_LABEL[selectedRank!] ?? selectedRank}s`
                : 'Ask!'
              }
            </button>
          </div>
        )}
      </div>

      {/* ── My books ── */}
      {getBookRanks(myPlayerId).length > 0 && (
        <div className={`flex flex-col gap-1 px-4 ${newBookFlash ? 'book-pop' : ''}`}>
          <div className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--text-dim)' }}>
            My books ({getBookCount(myPlayerId)}) 📚
          </div>
          <div className="flex flex-wrap gap-1">
            {getBookRanks(myPlayerId).map(r => (
              <span key={r} className="text-xs font-bold px-2.5 py-1 rounded-lg"
                style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid rgba(245,158,11,0.3)' }}>
                {RANK_LABEL[r] ?? r}s
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Round over leaderboard ── */}
      {gameState.phase === 'round-over' && (
        <div className="flex flex-col gap-2 px-4 pb-2">
          <div className="text-center text-sm font-black tracking-widest uppercase fade-in" style={{ color: 'var(--accent)' }}>
            🎉 Game Over!
          </div>
          <div className="flex flex-col gap-1">
            {[...gameState.players]
              .sort((a, b) => getBookCount(b.id) - getBookCount(a.id))
              .map((p, i) => (
                <div key={p.id}
                  className={`flex items-center justify-between px-3 py-2 rounded-xl ${i === 0 ? 'book-pop' : ''}`}
                  style={{
                    background: i === 0 ? 'var(--accent-dim)' : 'var(--surface-hi)',
                    border: `1px solid ${i === 0 ? 'rgba(245,158,11,0.3)' : 'var(--border-hi)'}`,
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold" style={{ color: i === 0 ? 'var(--accent)' : 'var(--text-dim)' }}>
                      {i === 0 ? '🏆' : `#${i + 1}`}
                    </span>
                    <span className="text-sm font-bold" style={{ color: p.id === myPlayerId ? 'var(--accent)' : 'var(--text)' }}>
                      {p.name}{p.id === myPlayerId ? ' (you)' : ''}
                    </span>
                  </div>
                  <span className="text-sm font-black" style={{ color: i === 0 ? 'var(--accent)' : 'var(--text)' }}>
                    {getBookCount(p.id)} book{getBookCount(p.id) !== 1 ? 's' : ''}
                  </span>
                </div>
              ))
            }
          </div>
          {isHost && (
            <button
              onClick={() => send({ type: 'next_round' })}
              className="w-full py-3 rounded-2xl font-black text-sm tracking-widest uppercase transition-all active:scale-95"
              style={{ background: 'var(--accent)', color: '#000' }}
            >
              Play Again
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Hand card display with rank-based selection ──────────────────

function GoFishHand({
  cards,
  selectedRank,
  onSelectRank,
  isMyTurn,
}: {
  cards: CardType[]
  selectedRank: string | null
  onSelectRank: (rank: string) => void
  isMyTurn: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(320)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => setContainerWidth(entries[0].contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  if (cards.length === 0) {
    return (
      <div className="flex items-center justify-center px-4 py-4">
        <div style={{
          width: 58, height: 86, borderRadius: 'var(--radius-card)',
          border: '1.5px dashed rgba(255,255,255,0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ color: 'var(--text-dim)', fontSize: 10 }}>empty</span>
        </div>
      </div>
    )
  }

  const count = cards.length
  const CARD_W = 58
  const rawOverlap = count > 1
    ? CARD_W - (containerWidth - CARD_W * 0.5) / (count - 1)
    : 0
  const overlap = Math.max(-24, rawOverlap)
  const fanWidth = CARD_W + (count > 1 ? (count - 1) * (CARD_W - overlap) : 0)

  return (
    <div ref={containerRef} className="relative px-4 pb-3" style={{ minHeight: 110 }}>
      <div className="flex items-end" style={{ width: fanWidth }}>
        {cards.map((card, i) => {
          const isSelected = card.rank === selectedRank
          return (
            <div
              key={card.id}
              className="flex-shrink-0"
              style={{
                marginLeft: i === 0 ? 0 : -(overlap),
                zIndex: isSelected ? 50 : i,
                position: 'relative',
                transform: isSelected ? 'translateY(-14px)' : 'translateY(0)',
                transition: 'transform 0.15s ease',
                cursor: isMyTurn ? 'pointer' : 'default',
              }}
              onClick={() => onSelectRank(card.rank)}
            >
              <Card
                card={card}
                size="md"
                animate="deal"
                style={isSelected ? { outline: '2.5px solid var(--accent)', outlineOffset: '2px' } : undefined}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Last ask result banner ───────────────────────────────────────

function LastAskBanner({
  lastAsk,
  players,
  myPlayerId,
  drawPileCount,
}: {
  lastAsk: NonNullable<GameState['goFishLastAsk']>
  players: GameState['players']
  myPlayerId: string
  drawPileCount: number
}) {
  const asker = players.find(p => p.id === lastAsk.askerId)
  const target = players.find(p => p.id === lastAsk.targetId)
  const iMadeAsk = lastAsk.askerId === myPlayerId
  const iWasAsked = lastAsk.targetId === myPlayerId

  // drewCard=false + !success + pile>0 means the draw is in progress (server-side delay)
  const drawPending = !lastAsk.success && !lastAsk.luckyFish && !lastAsk.drewCard && drawPileCount > 0

  let icon: string
  let lines: string[]
  let color: string
  let bg: string
  let borderColor: string
  let iconClass = ''
  let wrapperClass = 'mx-2 flex items-center gap-2 px-3 py-2.5 rounded-xl fade-in'

  if (lastAsk.luckyFish) {
    icon = '🐟✨'
    lines = iMadeAsk
      ? [`Lucky fish! Drew a ${lastAsk.rank} from the pile!`, 'Your turn again — keep asking!']
      : [`${asker?.name} drew a ${lastAsk.rank} — lucky fish! They go again.`]
    color = 'var(--accent)'
    bg = 'var(--accent-dim)'
    borderColor = 'rgba(245,158,11,0.35)'
    iconClass = 'fish-wiggle'
  } else if (lastAsk.success) {
    icon = '✅'
    lines = iMadeAsk
      ? [`${target?.name} had ${lastAsk.rank}s — you got them!`]
      : iWasAsked
        ? [`${asker?.name} took your ${lastAsk.rank}s`]
        : [`${asker?.name} got ${lastAsk.rank}s from ${target?.name}`]
    color = '#4ade80'
    bg = 'rgba(74,222,128,0.08)'
    borderColor = 'rgba(74,222,128,0.3)'
    wrapperClass += ' success-flash'
  } else if (drawPending) {
    // Draw is about to happen — server is pausing before adding the card
    icon = '🐟'
    lines = iMadeAsk
      ? [`Go fish! ${target?.name} had no ${lastAsk.rank}s`, 'Proceeding to draw a card from the pile…']
      : iWasAsked
        ? [`${asker?.name} asked for ${lastAsk.rank}s — go fish!`, 'Proceeding to draw a card from the pile…']
        : [`${asker?.name} asked for ${lastAsk.rank}s — go fish!`, 'Proceeding to draw a card from the pile…']
    color = 'var(--text-muted)'
    bg = 'var(--surface-hi)'
    borderColor = 'var(--border-hi)'
    iconClass = 'fish-wiggle'
  } else if (lastAsk.drewCard) {
    // Draw completed
    icon = '🐟'
    lines = iMadeAsk
      ? [`Go fish! ${target?.name} had no ${lastAsk.rank}s`, 'Drew a card — turn passes.']
      : iWasAsked
        ? [`${asker?.name} took no cards — go fish!`, 'They drew from the pile.']
        : [`${asker?.name} asked for ${lastAsk.rank}s — go fish!`, 'Drew a card from the pile.']
    color = 'var(--text-muted)'
    bg = 'var(--surface-hi)'
    borderColor = 'var(--border-hi)'
    iconClass = 'fish-wiggle'
  } else {
    // Pile was empty — no card drawn
    icon = '🐟'
    lines = iMadeAsk
      ? [`Go fish! ${target?.name} had no ${lastAsk.rank}s`, 'Pile is empty — turn passes.']
      : [`${asker?.name} asked for ${lastAsk.rank}s — go fish! Pile empty.`]
    color = 'var(--text-muted)'
    bg = 'var(--surface-hi)'
    borderColor = 'var(--border-hi)'
    iconClass = 'fish-wiggle'
  }

  return (
    <div className={wrapperClass} style={{ background: bg, border: `1px solid ${borderColor}` }}>
      <span className={`flex-shrink-0 ${iconClass}`} style={{ fontSize: 20, display: 'inline-block' }}>
        {icon}
      </span>
      <div className="flex flex-col gap-0.5">
        {lines.map((line, i) => (
          <span key={i} className={i === 0 ? 'text-xs font-semibold' : 'text-[10px]'}
            style={{ color: i === 0 ? color : 'var(--text-dim)' }}>
            {line}
          </span>
        ))}
      </div>
    </div>
  )
}
