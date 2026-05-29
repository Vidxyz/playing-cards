'use client'

import { useState } from 'react'
import type { GameState, ClientEvent } from '@playing-cards/shared'
import { Card } from './Card'
import { RoundOverActions } from './RoundOverActions'

interface Props {
  gameState: GameState
  myPlayerId: string
  send: (event: ClientEvent) => void
  isHost: boolean
  onLeave: () => void
}

export function RummyBoard({ gameState, myPlayerId, send, isHost, onLeave }: Props) {
  const isMyTurn = gameState.currentTurnPlayerId === myPlayerId
  const hasDrawn = gameState.rummyHasDrawn
  const discardZone = gameState.zones.find(z => z.id === 'discard')
  const topDiscard = discardZone?.cards.at(-1) ?? null
  const otherPlayers = gameState.players.filter(p => p.id !== myPlayerId)
  const currentTurnPlayer = gameState.players.find(p => p.id === gameState.currentTurnPlayerId)
  const isBusted = gameState.rummyBustedPlayerIds.includes(myPlayerId)

  const handleDrawDeck = () => {
    if (!isMyTurn || hasDrawn) return
    send({ type: 'rummy_draw', fromDiscard: false })
  }

  const handleDrawDiscard = () => {
    if (!isMyTurn || hasDrawn || !topDiscard) return
    send({ type: 'rummy_draw', fromDiscard: true })
  }

  const getCardCount = (pid: string) => {
    const zone = gameState.zones.find(z => z.id === `hand-${pid}`)
    return zone?.cards.length ?? 0
  }

  if (gameState.phase === 'game-over') {
    return <RummyGameOver gameState={gameState} myPlayerId={myPlayerId} isHost={isHost} send={send} onLeave={onLeave} />
  }

  return (
    <div className="w-full flex flex-col gap-3 pb-2">

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
            ? (hasDrawn ? 'Select a card to discard or go out' : 'Draw a card')
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
                  <div className="w-px h-5" style={{ background: 'var(--border)' }} />
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
      <div className="flex items-center justify-center gap-8">
        {/* Draw pile */}
        <div className="flex flex-col items-center gap-1.5">
          <button
            onClick={handleDrawDeck}
            disabled={!isMyTurn || hasDrawn}
            style={{ cursor: isMyTurn && !hasDrawn ? 'pointer' : 'default' }}
          >
            <div className="relative" style={{ width: 72, height: 104 }}>
              {gameState.drawPileCount > 0 && (
                <>
                  <div style={{
                    position: 'absolute', top: -3, left: -3, width: 72, height: 104,
                    borderRadius: 'var(--radius-card)',
                    background: 'linear-gradient(145deg,#1a2d54,#1e3560)',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }} />
                  <div style={{
                    position: 'absolute', top: -1.5, left: -1.5, width: 72, height: 104,
                    borderRadius: 'var(--radius-card)',
                    background: 'linear-gradient(145deg,#1e3560,#243f72)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }} />
                </>
              )}
              <div style={{
                position: 'absolute', top: 0, left: 0, width: 72, height: 104,
                borderRadius: 'var(--radius-card)',
                background: gameState.drawPileCount === 0 ? 'rgba(255,255,255,0.04)' : 'linear-gradient(145deg,#243f72,#1e3560)',
                border: gameState.drawPileCount === 0
                  ? '1.5px dashed rgba(255,255,255,0.12)'
                  : isMyTurn && !hasDrawn ? '2px solid var(--accent)' : '1px solid rgba(255,255,255,0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: gameState.drawPileCount === 0 ? 0.5 : 1,
                boxShadow: isMyTurn && !hasDrawn && gameState.drawPileCount > 0 ? '0 0 16px rgba(245,158,11,0.35)' : 'none',
              }}>
                <span style={{ color: gameState.drawPileCount === 0 ? 'var(--text-dim)' : 'rgba(255,255,255,0.75)', fontSize: 14, fontWeight: 700 }}>
                  {gameState.drawPileCount === 0 ? '—' : gameState.drawPileCount}
                </span>
              </div>
            </div>
          </button>
          <span className="text-[9px] uppercase tracking-widest" style={{ color: 'var(--text-dim)' }}>deck</span>
        </div>

        {/* Discard pile */}
        <div className="flex flex-col items-center gap-1.5">
          <button
            onClick={handleDrawDiscard}
            disabled={!isMyTurn || hasDrawn || !topDiscard}
            style={{ cursor: isMyTurn && !hasDrawn && topDiscard ? 'pointer' : 'default' }}
          >
            {topDiscard ? (
              <div style={{
                outline: isMyTurn && !hasDrawn ? '2px solid var(--accent)' : 'none',
                outlineOffset: 3,
                borderRadius: 'var(--radius-card)',
                boxShadow: isMyTurn && !hasDrawn ? '0 0 16px rgba(245,158,11,0.35)' : 'none',
              }}>
                <Card card={topDiscard} size="md" />
              </div>
            ) : (
              <div style={{
                width: 58, height: 86, borderRadius: 'var(--radius-card)',
                border: '1.5px dashed rgba(255,255,255,0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ color: 'var(--text-dim)', fontSize: 10 }}>empty</span>
              </div>
            )}
          </button>
          <span className="text-[9px] uppercase tracking-widest" style={{ color: 'var(--text-dim)' }}>discard</span>
        </div>
      </div>

      {isBusted && (
        <div className="mx-4 py-4 rounded-2xl text-center" style={{ background: 'rgba(229,62,62,0.08)', border: '1px solid rgba(229,62,62,0.2)' }}>
          <span className="text-sm font-bold" style={{ color: '#fc8181' }}>You&apos;ve been eliminated</span>
          <p className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>Watch as the remaining players battle it out</p>
        </div>
      )}

      {/* ── Round-over ── */}
      {gameState.phase === 'round-over' && (
        <RummyRoundOver gameState={gameState} myPlayerId={myPlayerId} isHost={isHost} send={send} onLeave={onLeave} />
      )}
    </div>
  )
}

// ── Round-over screen ──────────────────────────────────────────

function RummyRoundOver({ gameState, myPlayerId, isHost, send, onLeave }: {
  gameState: GameState
  myPlayerId: string
  isHost: boolean
  send: (event: ClientEvent) => void
  onLeave: () => void
}) {
  const [scoresExpanded, setScoresExpanded] = useState(true)

  const sorted = [...gameState.players].sort((a, b) => a.totalScore - b.totalScore)
  const activePlayers = sorted.filter(p => !gameState.rummyBustedPlayerIds.includes(p.id))
  const bustedPlayers = sorted.filter(p => gameState.rummyBustedPlayerIds.includes(p.id))

  return (
    <div className="flex flex-col gap-3 px-4 pb-2 fade-in">
      <div className="text-center text-sm font-black tracking-widest uppercase" style={{ color: 'var(--accent)' }}>
        Round Over
      </div>
      <div className="text-center text-[10px]" style={{ color: 'var(--text-dim)' }}>
        Bust at {gameState.rummyMaxScore} pts · Lowest total wins
      </div>

      {/* Revealed hands for all players */}
      <div className="flex flex-col gap-3">
        {gameState.players.map(p => {
          const handZone = gameState.zones.find(z => z.id === `hand-${p.id}`)
          const cards = handZone?.cards ?? []
          const isMe = p.id === myPlayerId
          const isBustedP = gameState.rummyBustedPlayerIds.includes(p.id)
          return (
            <div key={p.id} className="flex flex-col gap-1.5 px-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold" style={{ color: isMe ? 'var(--accent)' : 'var(--text)' }}>
                  {p.name}{isMe ? ' (you)' : ''}
                </span>
                {isBustedP && (
                  <span className="text-[9px] font-black uppercase tracking-wide" style={{ color: '#fc8181' }}>bust</span>
                )}
                {p.roundScore === 0 && !isBustedP && (
                  <span className="text-[9px] font-black uppercase tracking-wide" style={{ color: '#4ade80' }}>went out</span>
                )}
                {p.roundScore > 0 && (
                  <span className="text-[9px] font-semibold" style={{ color: '#fc8181' }}>+{p.roundScore} pts</span>
                )}
              </div>
              {cards.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {cards.map(card => (
                    <Card key={card.id} card={card} size="sm" />
                  ))}
                </div>
              ) : (
                <span className="text-xs italic" style={{ color: 'var(--text-dim)' }}>No cards</span>
              )}
            </div>
          )
        })}
      </div>

      {/* Collapsible scores panel */}
      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border-hi)' }}>
        <button
          onClick={() => setScoresExpanded(v => !v)}
          className="w-full flex items-center justify-between px-3 py-2.5 transition-colors active:opacity-70"
          style={{ background: 'var(--surface-hi)' }}
        >
          <span className="text-xs font-black uppercase tracking-widest" style={{ color: 'var(--text)' }}>Scores</span>
          <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>{scoresExpanded ? '▲ hide' : '▼ show'}</span>
        </button>

        {scoresExpanded && (
          <div className="flex flex-col gap-1 px-2 pb-2 pt-1">
            {activePlayers.map((p, i) => {
              const isMe = p.id === myPlayerId
              const justBusted = p.totalScore >= gameState.rummyMaxScore
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between px-3 py-2.5 rounded-xl"
                  style={{
                    background: justBusted ? 'rgba(229,62,62,0.08)' : i === 0 ? 'rgba(74,222,128,0.08)' : 'var(--surface-mid)',
                    border: `1px solid ${justBusted ? 'rgba(229,62,62,0.2)' : i === 0 ? 'rgba(74,222,128,0.2)' : 'var(--border)'}`,
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
                      <span className="text-xs font-semibold" style={{ color: '#fc8181' }}>+{p.roundScore}</span>
                    )}
                    {p.roundScore === 0 && (
                      <span className="text-xs font-semibold" style={{ color: '#4ade80' }}>Went out!</span>
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
                  style={{ background: 'var(--surface-mid)', border: '1px solid var(--border)' }}
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
        )}
      </div>

      <RoundOverActions
        isHost={isHost}
        onPlayAgain={() => send({ type: 'next_round' })}
        onHome={() => send({ type: 'end_game' })}
        onEnd={() => send({ type: 'close_room' })}
        onLeave={onLeave}
      />
    </div>
  )
}

// ── Game-over screen ────────────────────────────────────────────

function RummyGameOver({ gameState, myPlayerId, isHost, send, onLeave }: {
  gameState: GameState
  myPlayerId: string
  isHost: boolean
  send: (event: ClientEvent) => void
  onLeave: () => void
}) {
  const active = gameState.players.filter(p => !gameState.rummyBustedPlayerIds.includes(p.id))
  const winner = [...active].sort((a, b) => a.totalScore - b.totalScore)[0]
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
          const isBustedP = gameState.rummyBustedPlayerIds.includes(p.id)
          const isWinner = p.id === winner?.id
          return (
            <div
              key={p.id}
              className="flex items-center justify-between px-3 py-2.5 rounded-xl"
              style={{
                background: isWinner ? 'var(--accent-dim)' : 'var(--surface-hi)',
                border: `1px solid ${isWinner ? 'rgba(245,158,11,0.3)' : 'var(--border-hi)'}`,
                opacity: isBustedP && !isWinner ? 0.6 : 1,
              }}
            >
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: isWinner ? 'var(--accent)' : 'var(--text-dim)' }}>
                  {isWinner ? '🏆' : isBustedP ? '💀' : `#${i + 1}`}
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

      <RoundOverActions
        isHost={isHost}
        onHome={() => send({ type: 'end_game' })}
        onEnd={() => send({ type: 'close_room' })}
        onLeave={onLeave}
      />
    </div>
  )
}
