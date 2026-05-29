'use client'

import { useState } from 'react'
import type { GameState, ClientEvent, Suit } from '@playing-cards/shared'
import { Card } from './Card'
import { PlayerStrip } from './PlayerStrip'
import { RoundOverActions } from './RoundOverActions'

const SUIT_SYMBOL: Record<string, string> = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' }
const SUIT_COLOR: Record<string, string> = {
  spades: 'var(--text)',
  clubs: 'var(--text)',
  hearts: '#f87171',
  diamonds: '#f87171',
}

interface Props {
  gameState: GameState
  myPlayerId: string
  send: (event: ClientEvent) => void
  isHost: boolean
  onLeave: () => void
}

export function CrazyEightsBoard({ gameState, myPlayerId, send, isHost, onLeave }: Props) {
  const { phase, players, zones, currentTurnPlayerId, turnOrder, roundNumber } = gameState
  const me = players.find(p => p.id === myPlayerId)
  const isMyTurn = currentTurnPlayerId === myPlayerId

  const discardZone = zones.find(z => z.id === 'discard')
  const topCard = discardZone?.cards[discardZone.cards.length - 1] ?? null
  const declared = gameState.crazy8sDeclaredSuit

  // Round-over screen
  if (phase === 'round-over') {
    return <CrazyEightsRoundOver gameState={gameState} myPlayerId={myPlayerId} isHost={isHost} send={send} onLeave={onLeave} />
  }

  // Game-over screen
  if (phase === 'game-over') {
    const active = players.filter(p => !gameState.crazy8sBustedPlayerIds.includes(p.id))
    const winner = active[0] ?? players.sort((a, b) => a.totalScore - b.totalScore)[0]
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-5 px-4 py-6">
        <div className="text-4xl">🏆</div>
        <h2 className="font-black text-xl" style={{ color: 'var(--accent)' }}>
          {winner?.id === myPlayerId ? 'You win!' : `${winner?.name ?? 'Someone'} wins!`}
        </h2>
        <div className="w-full max-w-xs flex flex-col gap-2">
          {[...players].sort((a, b) => a.totalScore - b.totalScore).map((p, i) => {
            const busted = gameState.crazy8sBustedPlayerIds.includes(p.id)
            return (
              <div key={p.id}
                className="flex items-center justify-between px-4 py-3 rounded-2xl"
                style={{
                  background: i === 0 && !busted ? 'var(--accent-dim)' : 'var(--surface)',
                  border: `1px solid ${i === 0 && !busted ? 'var(--accent)' : 'var(--border)'}`,
                  opacity: busted ? 0.5 : 1,
                }}>
                <span className="font-bold text-sm" style={{ color: 'var(--text)' }}>
                  {p.name}{p.id === myPlayerId ? ' (you)' : ''}{busted ? ' 💀' : ''}
                </span>
                <span className="font-black text-sm" style={{ color: 'var(--text-muted)' }}>
                  {p.totalScore} pts
                </span>
              </div>
            )
          })}
        </div>
        {isHost && (
          <button
            onClick={() => send({ type: 'end_game' })}
            className="px-8 py-3 rounded-2xl font-bold text-sm transition-all active:scale-95"
            style={{ background: 'var(--surface-hi)', color: 'var(--text)', border: '1px solid var(--border-hi)' }}
          >
            Back to Lobby
          </button>
        )}
      </div>
    )
  }

  const currentPlayer = players.find(p => p.id === currentTurnPlayerId)

  return (
    <div className="flex-1 flex flex-col items-center gap-4 w-full px-4 py-3">

      {/* Turn indicator */}
      <div className="w-full max-w-sm">
        {isMyTurn ? (
          <div className="py-2.5 rounded-2xl text-center fade-in"
            style={{ background: 'var(--accent)', boxShadow: '0 0 16px rgba(245,158,11,0.25)' }}>
            <span className="font-black text-sm tracking-widest" style={{ color: '#000' }}>YOUR TURN</span>
          </div>
        ) : currentPlayer ? (
          <div className="py-2 rounded-xl text-center"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <span className="text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>
              {currentPlayer.name}&apos;s turn
            </span>
          </div>
        ) : null}
      </div>

      {/* Opponents strip */}
      {players.filter(p => p.id !== myPlayerId).length > 0 && (
        <div className="flex flex-wrap gap-2 justify-center w-full max-w-sm">
          {players.filter(p => p.id !== myPlayerId).map(p => {
            const handZone = zones.find(z => z.id === `hand-${p.id}`)
            const cardCount = handZone?.cards.length ?? 0
            const isTurn = p.id === currentTurnPlayerId
            const busted = gameState.crazy8sBustedPlayerIds.includes(p.id)
            return (
              <div key={p.id}
                className="flex items-center gap-2 px-3 py-2 rounded-xl"
                style={{
                  background: isTurn ? 'var(--accent-dim)' : 'var(--surface)',
                  border: `1px solid ${isTurn ? 'var(--accent)' : 'var(--border)'}`,
                  opacity: busted ? 0.4 : 1,
                }}>
                <span className="text-xs font-bold" style={{ color: isTurn ? 'var(--accent)' : 'var(--text)' }}>
                  {p.name}
                </span>
                <span className="text-[11px] px-1.5 py-0.5 rounded-full font-bold"
                  style={{ background: 'var(--surface-mid)', color: 'var(--text-muted)' }}>
                  {busted ? '💀' : `${cardCount} card${cardCount !== 1 ? 's' : ''}`}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Discard + draw piles */}
      <div className="flex items-end gap-6 justify-center">

        {/* Draw pile */}
        <div className="flex flex-col items-center gap-1">
          <div
            className="transition-all active:scale-95"
            style={{ width: 72, height: 104, cursor: isMyTurn ? 'pointer' : 'default', position: 'relative' }}
            onClick={() => isMyTurn && send({ type: 'crazy8s_draw' })}
          >
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
            <div style={{
              position: 'absolute', top: 0, left: 0, width: 72, height: 104,
              borderRadius: 'var(--radius-card)',
              background: 'linear-gradient(145deg,#243f72,#1e3560)',
              border: `1px solid ${isMyTurn ? 'rgba(245,158,11,0.6)' : 'rgba(255,255,255,0.12)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: isMyTurn ? '0 0 12px rgba(245,158,11,0.3)' : 'none',
            }}>
              <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: 700 }}>
                {gameState.drawPileCount}
              </span>
            </div>
          </div>
          <span className="text-[9px] uppercase tracking-widest" style={{ color: 'var(--text-dim)' }}>draw</span>
        </div>

        {/* Discard pile */}
        <div className="flex flex-col items-center gap-1">
          {topCard ? (
            <div className="relative">
              <Card card={topCard} size="lg" />
              {/* Declared suit overlay when 8 is on top */}
              {declared && topCard.rank === '8' && (
                <div className="absolute inset-0 flex items-center justify-center rounded-[var(--radius-card)]"
                  style={{ background: 'rgba(0,0,0,0.55)' }}>
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-2xl font-black" style={{ color: SUIT_COLOR[declared] }}>
                      {SUIT_SYMBOL[declared]}
                    </span>
                    <span className="text-[9px] uppercase tracking-widest font-bold" style={{ color: 'rgba(255,255,255,0.7)' }}>
                      declared
                    </span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{
              width: 80, height: 116,
              borderRadius: 'var(--radius-card)',
              background: 'var(--surface)',
              border: '2px dashed var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>empty</span>
            </div>
          )}
          <span className="text-[9px] uppercase tracking-widest" style={{ color: 'var(--text-dim)' }}>discard</span>
        </div>
      </div>

      {/* Active suit indicator when 8 played */}
      {declared && (
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Active suit:</span>
          <span className="text-base font-black" style={{ color: SUIT_COLOR[declared] }}>
            {SUIT_SYMBOL[declared]}
          </span>
          <span className="text-xs font-bold" style={{ color: SUIT_COLOR[declared] }}>
            {declared.charAt(0).toUpperCase() + declared.slice(1)}
          </span>
        </div>
      )}

      {/* Draw instruction when it's your turn */}
      {isMyTurn && (
        <p className="text-[11px] text-center" style={{ color: 'var(--text-dim)' }}>
          Play a matching card or tap the deck to draw
        </p>
      )}
    </div>
  )
}

// ── Round-over screen ────────────────────────────────────────────

function CrazyEightsRoundOver({ gameState, myPlayerId, isHost, send, onLeave }: {
  gameState: GameState
  myPlayerId: string
  isHost: boolean
  send: (event: ClientEvent) => void
  onLeave: () => void
}) {
  const [scoresExpanded, setScoresExpanded] = useState(true)
  const { players, zones, roundNumber } = gameState
  const sorted = [...players].sort((a, b) => a.roundScore - b.roundScore)
  const winner = sorted[0]

  return (
    <div className="flex-1 flex flex-col items-center gap-4 px-4 py-6 overflow-y-auto">
      <div className="text-4xl">🎉</div>
      <h2 className="font-black text-xl" style={{ color: 'var(--text)' }}>Round {roundNumber} Over</h2>

      {/* Revealed hands for all players */}
      <div className="w-full max-w-sm flex flex-col gap-3">
        {sorted.map(p => {
          const handZone = zones.find(z => z.id === `hand-${p.id}`)
          const handCards = handZone?.cards ?? []
          const isMe = p.id === myPlayerId
          const isWinner = p.id === winner?.id
          return (
            <div key={p.id} className="flex flex-col gap-1.5 px-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold" style={{ color: isMe ? 'var(--accent)' : 'var(--text)' }}>
                  {p.name}{isMe ? ' (you)' : ''}
                </span>
                {isWinner && <span className="text-[9px] font-black uppercase tracking-wide" style={{ color: 'var(--accent)' }}>went out</span>}
                {!isWinner && p.roundScore > 0 && (
                  <span className="text-[9px] font-semibold" style={{ color: '#fc8181' }}>+{p.roundScore} pts</span>
                )}
              </div>
              {handCards.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {handCards.map(card => <Card key={card.id} card={card} size="sm" />)}
                </div>
              ) : (
                <span className="text-xs italic" style={{ color: 'var(--text-dim)' }}>went out</span>
              )}
            </div>
          )
        })}
      </div>

      {/* Collapsible scores */}
      <div className="w-full max-w-sm rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border-hi)' }}>
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
            {sorted.map((p, i) => {
              const isMe = p.id === myPlayerId
              const isWin = i === 0
              return (
                <div key={p.id}
                  className="flex items-center justify-between px-3 py-2 rounded-xl"
                  style={{
                    background: isWin ? 'var(--accent-dim)' : 'var(--surface-mid)',
                    border: `1px solid ${isWin ? 'rgba(245,158,11,0.3)' : 'var(--border)'}`,
                  }}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold" style={{ color: isWin ? 'var(--accent)' : 'var(--text-dim)' }}>
                      #{i + 1}
                    </span>
                    <span className="text-sm font-bold" style={{ color: isMe ? 'var(--accent)' : 'var(--text)' }}>
                      {p.name}{isMe ? ' (you)' : ''}
                    </span>
                  </div>
                  <div className="flex flex-col items-end leading-tight">
                    <span className="font-black text-sm" style={{ color: isWin ? 'var(--accent)' : 'var(--text)' }}>
                      {isWin ? 'went out' : `+${p.roundScore}`}
                    </span>
                    <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>
                      Total: {p.totalScore + p.roundScore}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
        {winner?.name} went out — others score their hand values
      </p>
      {gameState.crazy8sBustedPlayerIds.length > 0 && (
        <p className="text-[11px] text-center" style={{ color: 'var(--text-dim)' }}>
          Bust threshold: {gameState.crazy8sMaxScore} pts
        </p>
      )}
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
