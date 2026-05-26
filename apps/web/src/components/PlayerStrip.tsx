'use client'

import type { GameState } from '@playing-cards/shared'
import { DisconnectTimer } from './DisconnectTimer'

interface Props {
  gameState: GameState
  myPlayerId: string
  centerLabel?: string
}

export function PlayerStrip({ gameState, myPlayerId, centerLabel }: Props) {
  const others = gameState.players.filter(p => p.id !== myPlayerId)
  if (others.length === 0 && !centerLabel) return null

  const { turnOrder, currentTurnPlayerId } = gameState
  const currentIdx = turnOrder.indexOf(currentTurnPlayerId ?? '')
  const nextPlayerId = turnOrder.length > 1
    ? turnOrder[(currentIdx + 1) % turnOrder.length]
    : null

  const renderPlayer = (player: typeof others[0]) => {
    const isCurrentTurn = currentTurnPlayerId === player.id
    const isNextTurn = nextPlayerId === player.id && !isCurrentTurn
    const hasPassed = gameState.bluffPassedPlayerIds.includes(player.id)
    const cardCount = gameState.zones
      .filter(z => z.ownerId === player.id)
      .reduce((s, z) => s + z.cards.length, 0)

    return (
      <div
        key={player.id}
        className="flex items-center gap-2 flex-shrink-0 rounded-2xl px-3 py-2 transition-all"
        style={{
          background: isCurrentTurn ? 'var(--surface-hi)' : 'var(--surface)',
          border: '1px solid ' + (isCurrentTurn ? 'var(--accent)' : isNextTurn ? 'var(--border-hi)' : !player.isConnected ? 'rgba(239,68,68,0.3)' : 'var(--border)'),
          opacity: player.isFolded || hasPassed ? 0.4 : !player.isConnected ? 0.65 : 1,
        }}
      >
        <div
          className="flex items-center justify-center rounded-full text-xs font-bold flex-shrink-0"
          style={{
            width: 28, height: 28,
            background: isCurrentTurn ? 'var(--accent-dim)' : 'var(--surface-mid)',
            color: isCurrentTurn ? 'var(--accent)' : 'var(--text-muted)',
            border: '1px solid ' + (isCurrentTurn ? 'rgba(245,158,11,0.3)' : 'var(--border)'),
          }}
        >
          {player.name.slice(0, 2).toUpperCase()}
        </div>

        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold truncate max-w-[72px]" style={{ color: 'var(--text)' }}>
              {player.name}
            </span>
            {player.isHost && (
              <span className="text-[9px] font-bold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>
                HOST
              </span>
            )}
          </div>
          {gameState.gameType === 'bluff' && !player.isFolded && cardCount > 0 ? (
            <div className="flex items-center gap-0.5 mt-0.5">
              {Array.from({ length: Math.min(cardCount, 12) }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    width: 5, height: 8,
                    borderRadius: 1,
                    background: isCurrentTurn ? 'rgba(245,158,11,0.5)' : 'rgba(255,255,255,0.2)',
                    border: '1px solid ' + (isCurrentTurn ? 'rgba(245,158,11,0.3)' : 'rgba(255,255,255,0.12)'),
                    flexShrink: 0,
                  }}
                />
              ))}
              {cardCount > 12 && (
                <span style={{ fontSize: 8, color: 'var(--text-dim)', marginLeft: 2 }}>+{cardCount - 12}</span>
              )}
            </div>
          ) : (
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              {player.isFolded ? 'folded' : `${cardCount} card${cardCount !== 1 ? 's' : ''}`}
              {gameState.gameType === 'euchre' && player.trickCount > 0 && ` · ${player.trickCount}T`}
            </span>
          )}
        </div>

        {!player.isConnected && player.disconnectedAt ? (
          <DisconnectTimer disconnectedAt={player.disconnectedAt} />
        ) : (
          <>
            {isCurrentTurn && !hasPassed && (
              <span className="text-xs" style={{ color: 'var(--accent)' }}>▶</span>
            )}
            {isNextTurn && !hasPassed && (
              <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full"
                style={{ background: 'var(--surface-mid)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                next
              </span>
            )}
            {hasPassed && (
              <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full"
                style={{ background: 'rgba(239,68,68,0.1)', color: '#fc8181', border: '1px solid rgba(239,68,68,0.25)' }}>
                passed
              </span>
            )}
          </>
        )}
      </div>
    )
  }

  return (
    <div className="relative">
      <div className="flex gap-2 overflow-x-auto no-scrollbar px-3 py-1.5">
        {others.map(renderPlayer)}
      </div>
      {centerLabel && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div
            className="flex flex-col items-center px-2"
            style={{ background: 'var(--bg)' }}
          >
            <span className="font-bold text-[15px] leading-tight" style={{ color: 'var(--text-muted)' }}>
              {centerLabel}
            </span>
            <span className="text-[10px] leading-tight" style={{ color: 'var(--text-dim)' }}>
              Round {gameState.roundNumber}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
