'use client'

import { useState, useEffect, useRef } from 'react'
import type { GameState, ClientEvent, Card as CardType } from '@playing-cards/shared'
import { Card } from './Card'

interface Props {
  gameState: GameState
  myPlayerId: string
  send: (event: ClientEvent) => void
  isHost: boolean
}

const RANK_ORDER = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'JKR']

function cardSortKey(card: CardType): number {
  const suitOrder = { spades: 0, clubs: 1, hearts: 2, diamonds: 3 }
  return RANK_ORDER.indexOf(card.rank) * 10 + (suitOrder[card.suit] ?? 0)
}

export function RummyBoard({ gameState, myPlayerId, send, isHost }: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const prevPhase = useRef(gameState.phase)
  const prevRound = useRef(gameState.roundNumber)

  const isMyTurn = gameState.currentTurnPlayerId === myPlayerId
  const hasDrawn = gameState.rummyHasDrawn
  const myHand = gameState.zones.find(z => z.id === `hand-${myPlayerId}`)
  const myCards = [...(myHand?.cards ?? [])].sort((a, b) => cardSortKey(a) - cardSortKey(b))
  const discardZone = gameState.zones.find(z => z.id === 'discard')
  const topDiscard = discardZone?.cards.at(-1) ?? null
  const myMelds = gameState.rummyMelds[myPlayerId] ?? []
  const otherPlayers = gameState.players.filter(p => p.id !== myPlayerId)
  const currentTurnPlayer = gameState.players.find(p => p.id === gameState.currentTurnPlayerId)
  const isBusted = gameState.rummyBustedPlayerIds.includes(myPlayerId)

  // Clear selection on round/turn change
  useEffect(() => {
    if (gameState.phase !== prevPhase.current || gameState.roundNumber !== prevRound.current) {
      setSelectedIds(new Set())
      prevPhase.current = gameState.phase
      prevRound.current = gameState.roundNumber
    }
  }, [gameState.phase, gameState.roundNumber])

  useEffect(() => {
    if (!isMyTurn) setSelectedIds(new Set())
  }, [isMyTurn])

  const toggleCard = (id: string) => {
    if (!isMyTurn || !hasDrawn) return
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const selected = myCards.filter(c => selectedIds.has(c.id))

  const handleDrawDeck = () => {
    if (!isMyTurn || hasDrawn) return
    send({ type: 'rummy_draw', fromDiscard: false })
  }

  const handleDrawDiscard = () => {
    if (!isMyTurn || hasDrawn || !topDiscard) return
    send({ type: 'rummy_draw', fromDiscard: true })
  }

  const handleLayMeld = () => {
    if (!isMyTurn || !hasDrawn || selected.length < 3) return
    send({ type: 'rummy_lay_meld', cardIds: selected.map(c => c.id) })
    setSelectedIds(new Set())
  }

  const handleExtendMeld = (meldIndex: number) => {
    if (!isMyTurn || !hasDrawn || selected.length !== 1) return
    send({ type: 'rummy_extend_meld', cardId: selected[0].id, meldIndex })
    setSelectedIds(new Set())
  }

  const handleDiscard = () => {
    if (!isMyTurn || !hasDrawn || selected.length !== 1) return
    send({ type: 'rummy_discard', cardId: selected[0].id })
    setSelectedIds(new Set())
  }

  const getCardCount = (pid: string) => {
    const zone = gameState.zones.find(z => z.id === `hand-${pid}`)
    return zone?.cards.length ?? 0
  }

  const getMeldCount = (pid: string) => (gameState.rummyMelds[pid] ?? []).length

  const hasMeldsAnywhere = Object.values(gameState.rummyMelds).some(m => m.length > 0)

  if (gameState.phase === 'game-over') {
    return <RummyGameOver gameState={gameState} myPlayerId={myPlayerId} isHost={isHost} send={send} />
  }

  return (
    <div className="w-full flex flex-col gap-3 pb-3">

      {/* ── Turn indicator ── */}
      {gameState.phase === 'playing' && (
        <div
          className={`mx-auto px-4 py-2 rounded-full text-sm font-bold ${isMyTurn ? 'turn-pulse' : ''}`}
          style={isMyTurn
            ? { background: 'var(--accent)', color: '#000' }
            : { background: 'var(--surface-hi)', color: 'var(--text-muted)', border: '1px solid var(--border-hi)' }
          }
        >
          {isMyTurn
            ? (hasDrawn ? 'Meld or Discard' : 'Draw a card')
            : `${currentTurnPlayer?.name ?? '?'}'s turn`
          }
        </div>
      )}

      {/* ── Opponent strips ── */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar px-1 pb-1">
        {otherPlayers.map(p => {
          const isCurrent = gameState.currentTurnPlayerId === p.id
          const isBustedOpp = gameState.rummyBustedPlayerIds.includes(p.id)
          return (
            <div
              key={p.id}
              className="flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-2xl flex-shrink-0"
              style={{
                background: 'var(--surface-hi)',
                border: isCurrent ? '2px solid rgba(255,255,255,0.2)' : '1px solid var(--border-hi)',
                opacity: p.isConnected && !isBustedOpp ? 1 : 0.5,
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
              </div>
              {isBustedOpp ? (
                <span className="text-[9px] font-bold uppercase" style={{ color: '#fc8181' }}>Bust</span>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="flex flex-col items-center">
                    <span className="text-sm font-black" style={{ color: 'var(--text)' }}>{getCardCount(p.id)}</span>
                    <span className="text-[8px] uppercase tracking-wide" style={{ color: 'var(--text-dim)' }}>cards</span>
                  </div>
                  {getMeldCount(p.id) > 0 && (
                    <>
                      <div className="w-px h-5" style={{ background: 'var(--border)' }} />
                      <div className="flex flex-col items-center">
                        <span className="text-sm font-black" style={{ color: 'var(--accent)' }}>{getMeldCount(p.id)}</span>
                        <span className="text-[8px] uppercase tracking-wide" style={{ color: 'var(--text-dim)' }}>melds</span>
                      </div>
                    </>
                  )}
                  <div className="flex flex-col items-center">
                    <span className="text-sm font-black" style={{ color: 'var(--text-muted)' }}>{p.totalScore}</span>
                    <span className="text-[8px] uppercase tracking-wide" style={{ color: 'var(--text-dim)' }}>pts</span>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Draw pile + Discard pile ── */}
      <div className="flex items-center justify-center gap-6">
        {/* Draw pile */}
        <div className="flex flex-col items-center gap-1">
          <button
            onClick={handleDrawDeck}
            disabled={!isMyTurn || hasDrawn}
            style={{ cursor: isMyTurn && !hasDrawn ? 'pointer' : 'default' }}
          >
            <div className="relative" style={{ width: 52, height: 74 }}>
              {gameState.drawPileCount > 0 && (
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
                background: gameState.drawPileCount === 0
                  ? 'rgba(255,255,255,0.04)'
                  : 'linear-gradient(145deg,#243f72,#1e3560)',
                border: gameState.drawPileCount === 0
                  ? '1.5px dashed rgba(255,255,255,0.12)'
                  : isMyTurn && !hasDrawn ? '2px solid var(--accent)' : '1px solid rgba(255,255,255,0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: gameState.drawPileCount === 0 ? 0.5 : 1,
                boxShadow: isMyTurn && !hasDrawn && gameState.drawPileCount > 0 ? '0 0 12px rgba(245,158,11,0.3)' : 'none',
              }}>
                <span style={{ color: gameState.drawPileCount === 0 ? 'var(--text-dim)' : 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: 700 }}>
                  {gameState.drawPileCount === 0 ? '—' : gameState.drawPileCount}
                </span>
              </div>
            </div>
          </button>
          <span className="text-[9px] uppercase tracking-widest" style={{ color: 'var(--text-dim)' }}>deck</span>
        </div>

        {/* Discard pile */}
        <div className="flex flex-col items-center gap-1">
          <button
            onClick={handleDrawDiscard}
            disabled={!isMyTurn || hasDrawn || !topDiscard}
            style={{ cursor: isMyTurn && !hasDrawn && topDiscard ? 'pointer' : 'default' }}
          >
            {topDiscard ? (
              <div style={{
                outline: isMyTurn && !hasDrawn ? '2px solid var(--accent)' : 'none',
                outlineOffset: 2,
                borderRadius: 'var(--radius-card)',
                boxShadow: isMyTurn && !hasDrawn ? '0 0 12px rgba(245,158,11,0.3)' : 'none',
              }}>
                <Card card={topDiscard} size="sm" />
              </div>
            ) : (
              <div style={{
                width: 40, height: 58, borderRadius: 'var(--radius-card)',
                border: '1.5px dashed rgba(255,255,255,0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ color: 'var(--text-dim)', fontSize: 9 }}>empty</span>
              </div>
            )}
          </button>
          <span className="text-[9px] uppercase tracking-widest" style={{ color: 'var(--text-dim)' }}>discard</span>
        </div>
      </div>

      {/* ── Melds in play ── */}
      {hasMeldsAnywhere && (
        <div className="px-3 flex flex-col gap-2">
          <span className="text-[9px] uppercase tracking-widest font-semibold" style={{ color: 'var(--text-dim)' }}>
            Melds in Play
          </span>
          {gameState.players.map(p => {
            const melds = gameState.rummyMelds[p.id] ?? []
            if (melds.length === 0) return null
            const isMe = p.id === myPlayerId
            return (
              <div key={p.id} className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold" style={{ color: isMe ? 'var(--accent)' : 'var(--text-muted)' }}>
                  {isMe ? 'You' : p.name}
                </span>
                <div className="flex flex-col gap-1.5">
                  {melds.map((meld, mi) => (
                    <div key={mi} className="flex items-center gap-1 flex-wrap">
                      {meld.map(card => (
                        <Card key={card.id} card={card} size="xs" />
                      ))}
                      {/* Add-to-meld button: only for own melds when 1 card selected */}
                      {isMe && isMyTurn && hasDrawn && selected.length === 1 && (
                        <button
                          onClick={() => handleExtendMeld(mi)}
                          className="text-[9px] font-bold px-2 py-1 rounded-lg transition-all active:scale-95 ml-1"
                          style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid rgba(245,158,11,0.3)' }}
                        >
                          + Add
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── My hand ── */}
      {!isBusted && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between px-4 pt-2 pb-1">
            <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--text-dim)' }}>
              Your hand ({myCards.length}) · {myPlayerId === gameState.currentTurnPlayerId ? (hasDrawn ? 'pick to meld/discard' : 'draw first') : 'waiting'}
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                Total: {myPlayerId ? gameState.players.find(p => p.id === myPlayerId)?.totalScore ?? 0 : 0} pts
              </span>
              {selectedIds.size > 0 && (
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="text-[10px] px-2 py-0.5 rounded-full"
                  style={{ color: 'var(--text-dim)', background: 'var(--surface-mid)', border: '1px solid var(--border)' }}
                >
                  Clear ✕
                </button>
              )}
            </div>
          </div>

          <RummyHand
            cards={myCards}
            selectedIds={selectedIds}
            onToggle={toggleCard}
            interactive={isMyTurn && hasDrawn}
          />

          {/* ── Action buttons ── */}
          {isMyTurn && gameState.phase === 'playing' && (
            <div className="px-4 pb-3 flex flex-col gap-2">
              {!hasDrawn ? (
                /* Draw phase */
                <p className="text-center text-xs" style={{ color: 'var(--text-dim)' }}>
                  Tap the deck or discard pile above to draw
                </p>
              ) : (
                /* Meld / discard phase */
                <>
                  {selected.length >= 3 && (
                    <button
                      onClick={handleLayMeld}
                      className="w-full py-3 rounded-2xl font-black text-sm tracking-widest uppercase transition-all active:scale-95"
                      style={{ background: 'var(--accent)', color: '#000', boxShadow: '0 0 16px rgba(245,158,11,0.3)' }}
                    >
                      Lay Meld ({selected.length} cards)
                    </button>
                  )}
                  {selected.length === 1 && (
                    <button
                      onClick={handleDiscard}
                      className="w-full py-3 rounded-2xl font-black text-sm tracking-widest uppercase transition-all active:scale-95"
                      style={{ background: 'var(--surface-hi)', color: 'var(--text)', border: '1px solid var(--border-hi)' }}
                    >
                      Discard {selected[0].rank}
                    </button>
                  )}
                  {selected.length === 0 && (
                    <p className="text-center text-xs" style={{ color: 'var(--text-dim)' }}>
                      Tap cards to select · 3+ to lay a meld · 1 to discard
                    </p>
                  )}
                  {selected.length === 2 && (
                    <p className="text-center text-xs" style={{ color: 'var(--text-dim)' }}>
                      Select 1 more card to lay a 3-card meld
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {isBusted && (
        <div className="mx-4 py-4 rounded-2xl text-center" style={{ background: 'rgba(229,62,62,0.08)', border: '1px solid rgba(229,62,62,0.2)' }}>
          <span className="text-sm font-bold" style={{ color: '#fc8181' }}>You&apos;ve been eliminated</span>
          <p className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>Watch as the remaining players battle it out</p>
        </div>
      )}

      {/* ── Round-over ── */}
      {gameState.phase === 'round-over' && (
        <RummyRoundOver gameState={gameState} myPlayerId={myPlayerId} isHost={isHost} send={send} />
      )}
    </div>
  )
}

// ── Fan-style hand ─────────────────────────────────────────────

function RummyHand({
  cards,
  selectedIds,
  onToggle,
  interactive,
}: {
  cards: CardType[]
  selectedIds: Set<string>
  onToggle: (id: string) => void
  interactive: boolean
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
          const isSelected = selectedIds.has(card.id)
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
                cursor: interactive ? 'pointer' : 'default',
              }}
              onClick={() => onToggle(card.id)}
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

// ── Round-over screen ──────────────────────────────────────────

function RummyRoundOver({ gameState, myPlayerId, isHost, send }: {
  gameState: GameState
  myPlayerId: string
  isHost: boolean
  send: (event: ClientEvent) => void
}) {
  const sorted = [...gameState.players].sort((a, b) => a.totalScore - b.totalScore)
  const activePlayers = sorted.filter(p => !gameState.rummyBustedPlayerIds.includes(p.id))
  const bustedPlayers = sorted.filter(p => gameState.rummyBustedPlayerIds.includes(p.id))

  return (
    <div className="flex flex-col gap-2 px-4 pb-2 fade-in">
      <div className="text-center text-sm font-black tracking-widest uppercase" style={{ color: 'var(--accent)' }}>
        Round Over
      </div>
      <div className="text-center text-[10px]" style={{ color: 'var(--text-dim)' }}>
        Bust at {gameState.rummyMaxScore} pts · Lowest total wins
      </div>

      <div className="flex flex-col gap-1 mt-1">
        {activePlayers.map((p, i) => {
          const isMe = p.id === myPlayerId
          const justBusted = p.totalScore >= gameState.rummyMaxScore
          return (
            <div
              key={p.id}
              className="flex items-center justify-between px-3 py-2.5 rounded-xl"
              style={{
                background: justBusted ? 'rgba(229,62,62,0.08)' : i === 0 ? 'rgba(74,222,128,0.08)' : 'var(--surface-hi)',
                border: `1px solid ${justBusted ? 'rgba(229,62,62,0.2)' : i === 0 ? 'rgba(74,222,128,0.2)' : 'var(--border-hi)'}`,
              }}
            >
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: justBusted ? '#fc8181' : i === 0 ? '#4ade80' : 'var(--text-dim)' }}>
                  {justBusted ? '💥' : i === 0 ? '🥇' : `#${i + 1}`}
                </span>
                <span className="text-sm font-bold" style={{ color: isMe ? 'var(--accent)' : 'var(--text)' }}>
                  {p.name}{isMe ? ' (you)' : ''}
                </span>
              </div>
              <div className="flex items-center gap-3">
                {p.roundScore > 0 && (
                  <span className="text-xs font-semibold" style={{ color: '#fc8181' }}>
                    +{p.roundScore}
                  </span>
                )}
                {p.roundScore === 0 && (
                  <span className="text-xs font-semibold" style={{ color: '#4ade80' }}>
                    Out!
                  </span>
                )}
                <span className="text-sm font-black" style={{ color: justBusted ? '#fc8181' : 'var(--text)' }}>
                  {p.totalScore} pts
                </span>
              </div>
            </div>
          )
        })}
        {bustedPlayers.map(p => {
          const isMe = p.id === myPlayerId
          return (
            <div
              key={p.id}
              className="flex items-center justify-between px-3 py-2 rounded-xl opacity-50"
              style={{ background: 'var(--surface-hi)', border: '1px solid var(--border-hi)' }}
            >
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: '#fc8181' }}>💀</span>
                <span className="text-sm font-bold" style={{ color: isMe ? 'var(--accent)' : 'var(--text)' }}>
                  {p.name}{isMe ? ' (you)' : ''}
                </span>
              </div>
              <span className="text-xs font-bold uppercase" style={{ color: '#fc8181' }}>Bust · {p.totalScore} pts</span>
            </div>
          )
        })}
      </div>

      {isHost && (
        <button
          onClick={() => send({ type: 'next_round' })}
          className="w-full mt-2 py-3 rounded-2xl font-black text-sm tracking-widest uppercase transition-all active:scale-95"
          style={{ background: 'var(--accent)', color: '#000' }}
        >
          Next Round
        </button>
      )}
    </div>
  )
}

// ── Game-over screen ────────────────────────────────────────────

function RummyGameOver({ gameState, myPlayerId, isHost, send }: {
  gameState: GameState
  myPlayerId: string
  isHost: boolean
  send: (event: ClientEvent) => void
}) {
  const active = gameState.players.filter(p => !gameState.rummyBustedPlayerIds.includes(p.id))
  const winner = active.length === 1 ? active[0] : active.sort((a, b) => a.totalScore - b.totalScore)[0]
  const sorted = [...gameState.players].sort((a, b) => a.totalScore - b.totalScore)

  return (
    <div className="flex flex-col gap-3 px-4 py-6 fade-in">
      <div className="text-center">
        <div className="text-2xl mb-1">🏆</div>
        <div className="text-base font-black tracking-widest uppercase" style={{ color: 'var(--accent)' }}>
          {winner?.id === myPlayerId ? 'You Win!' : `${winner?.name ?? '?'} Wins!`}
        </div>
        <div className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>Last player standing</div>
      </div>

      <div className="flex flex-col gap-1">
        {sorted.map((p, i) => {
          const isMe = p.id === myPlayerId
          const isBusted = gameState.rummyBustedPlayerIds.includes(p.id)
          const isWinner = p.id === winner?.id
          return (
            <div
              key={p.id}
              className="flex items-center justify-between px-3 py-2.5 rounded-xl"
              style={{
                background: isWinner ? 'var(--accent-dim)' : 'var(--surface-hi)',
                border: `1px solid ${isWinner ? 'rgba(245,158,11,0.3)' : 'var(--border-hi)'}`,
                opacity: isBusted && !isWinner ? 0.6 : 1,
              }}
            >
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: isWinner ? 'var(--accent)' : 'var(--text-dim)' }}>
                  {isWinner ? '🏆' : isBusted ? '💀' : `#${i + 1}`}
                </span>
                <span className="text-sm font-bold" style={{ color: isMe ? 'var(--accent)' : 'var(--text)' }}>
                  {p.name}{isMe ? ' (you)' : ''}
                </span>
              </div>
              <span className="text-sm font-black" style={{ color: isWinner ? 'var(--accent)' : 'var(--text)' }}>
                {p.totalScore} pts
              </span>
            </div>
          )
        })}
      </div>

      {isHost && (
        <button
          onClick={() => send({ type: 'end_game' })}
          className="w-full py-3 rounded-2xl font-black text-sm tracking-widest uppercase transition-all active:scale-95"
          style={{ background: 'var(--accent)', color: '#000' }}
        >
          Back to Lobby
        </button>
      )}
    </div>
  )
}
