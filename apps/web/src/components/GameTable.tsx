'use client'

import { useState, useEffect, useCallback } from 'react'
import type { GameState, ClientEvent, GameAction, Zone, Suit, BluffReveal, Player } from '@playing-cards/shared'
import { Hand } from './Hand'
import { Zone as ZoneView } from './Zone'
import { PlayerStrip } from './PlayerStrip'
import { ScoreBoard } from './ScoreBoard'
import { Card } from './Card'

interface Props {
  gameState: GameState
  myPlayerId: string
  send: (event: ClientEvent) => void
  lastAction: GameAction | null
  peekResult: { cardId: string; zoneId: string; rank: string; suit: string } | null
  onLeave: () => void
}

const SUIT_SYMBOL: Record<string, string> = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' }
const SUIT_OPTS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs']

export function GameTable({ gameState, myPlayerId, send, lastAction, peekResult, onLeave }: Props) {
  const [showScores, setShowScores] = useState(false)
  const [isBluffRevealing, setIsBluffRevealing] = useState(false)

  const me = gameState.players.find(p => p.id === myPlayerId)
  const isHost = me?.isHost ?? false
  const isMyTurn = gameState.currentTurnPlayerId === myPlayerId
  const gameType = gameState.gameType

  useEffect(() => {
    if (lastAction?.type === 'bluff_reveal') {
      setIsBluffRevealing(true)
      const t = setTimeout(() => setIsBluffRevealing(false), 3000)
      return () => clearTimeout(t)
    }
  }, [lastAction])

  const myHandZones = gameState.zones.filter(z =>
    z.ownerId === myPlayerId &&
    (z.id.startsWith('hand-') || z.id.startsWith('hole-cards-'))
  )
  const sharedZones = gameState.zones.filter(z => z.ownerId === null)
  const myCambioZones = gameType === 'cambio'
    ? gameState.zones.filter(z => z.ownerId === myPlayerId)
    : []

  const playTargets = sharedZones
    .filter(z => !['burn', 'tricks-a', 'tricks-b', 'cleared'].includes(z.id))
    .map(z => ({ id: z.id, name: z.name, isBluffPile: z.isBluffPile }))

  const handlePlayCards = useCallback((cardIds: string[], toZoneId: string) => {
    send({ type: 'play_cards', cardIds, toZoneId })
  }, [send])

  const handleDraw = useCallback((toZoneId?: string) => {
    send({ type: 'draw_card', toZoneId: toZoneId || myHandZones[0]?.id || `hand-${myPlayerId}` })
  }, [send, myHandZones, myPlayerId])

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg)' }}>

      {/* ── Top bar ─────────────────────────────────── */}
      <div className="flex-shrink-0 pt-safe" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex flex-col gap-2">
            {/* Exit: End Game (host) or Leave (non-host) */}
            {isHost ? (
              <button
                onClick={() => send({ type: 'end_game' })}
                className="text-xs font-semibold px-3 py-1.5 rounded-full transition-all active:scale-95 self-start"
                style={{
                  background: 'rgba(229,62,62,0.12)',
                  color: '#fc8181',
                  border: '1px solid rgba(229,62,62,0.25)',
                }}
              >
                End Game
              </button>
            ) : (
              <button
                onClick={onLeave}
                className="text-xs font-semibold px-3 py-1.5 rounded-full transition-all active:scale-95 self-start"
                style={{
                  background: 'var(--surface-mid)',
                  color: 'var(--text-muted)',
                  border: '1px solid var(--border)',
                }}
              >
                Leave
              </button>
            )}

            {/* Me indicator */}
            {me && (
              <div className="flex items-center gap-1.5 pl-1">
                <div
                  className="flex items-center justify-center rounded-full text-[9px] font-black flex-shrink-0"
                  style={{ width: 20, height: 20, background: 'var(--accent)', color: '#000' }}
                >
                  {me.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex flex-col leading-none">
                  <span className="text-[11px] font-bold truncate max-w-[80px]" style={{ color: 'var(--text)' }}>
                    {me.name}
                  </span>
                  {isHost && (
                    <span className="text-[9px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                      host
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {gameState.trumpSuit && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full self-start mt-1"
              style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid rgba(245,158,11,0.3)' }}>
              {SUIT_SYMBOL[gameState.trumpSuit]} Trump
            </span>
          )}

          <div className="flex gap-1.5">
            <span className="text-xs font-semibold self-center mr-1" style={{ color: 'var(--text-muted)' }}>
              R{gameState.roundNumber}
            </span>
            <TopBtn onClick={() => send({ type: 'pass_turn' })}>Pass</TopBtn>
            <TopBtn onClick={() => setShowScores(true)}>Scores</TopBtn>
            {isHost && (
              <TopBtn onClick={() => send({ type: 'next_round' })} accent>
                Next Round
              </TopBtn>
            )}
          </div>
        </div>
        <PlayerStrip gameState={gameState} myPlayerId={myPlayerId} />
      </div>

      {/* ── Table (shared zones + draw pile) ─────────── */}
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-4 py-3 overflow-hidden">

        {/* Turn indicator */}
        {gameState.turnOrder.length > 0 && gameState.currentTurnPlayerId && (
          <TurnBanner gameState={gameState} myPlayerId={myPlayerId} />
        )}

        {/* Shared zones */}
        {sharedZones.length > 0 && (
          <div className="flex flex-wrap gap-5 items-end justify-center">
            {sharedZones.map(zone => (
              <ZoneView
                key={zone.id}
                zone={zone}
                playerId={myPlayerId}
                lastAction={lastAction}
                onDraw={zone.id === 'kitty' ? () => handleDraw(myHandZones[0]?.id) : undefined}
                onFlipCard={(cId, zId) => send({ type: 'flip_card', cardId: cId, zoneId: zId })}
                onCallBluff={zone.isBluffPile ? () => send({ type: 'call_bluff' }) : undefined}
                isBluffRevealing={isBluffRevealing}
              />
            ))}
          </div>
        )}

        {/* Draw pile */}
        {gameState.drawPileCount > 0 && (
          <div className="flex flex-col items-center gap-1" onClick={() => handleDraw()}>
            <div className="relative" style={{ width: 80, height: 116, cursor: 'pointer' }}>
              <div style={{
                position: 'absolute', top: -3, left: -3, width: 80, height: 116,
                borderRadius: 'var(--radius-card)',
                background: 'linear-gradient(145deg,#1a2d54,#1e3560)',
                border: '1px solid rgba(255,255,255,0.06)',
              }} />
              <div style={{
                position: 'absolute', top: -1.5, left: -1.5, width: 80, height: 116,
                borderRadius: 'var(--radius-card)',
                background: 'linear-gradient(145deg,#1e3560,#243f72)',
                border: '1px solid rgba(255,255,255,0.08)',
              }} />
              <div style={{
                position: 'absolute', top: 0, left: 0, width: 80, height: 116,
                borderRadius: 'var(--radius-card)',
                background: 'linear-gradient(145deg,#243f72,#1e3560)',
                border: '1px solid rgba(255,255,255,0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: 700 }}>
                  {gameState.drawPileCount}
                </span>
              </div>
            </div>
            <span className="text-[9px] uppercase tracking-widest" style={{ color: 'var(--text-dim)' }}>
              draw
            </span>
          </div>
        )}

        {/* Cambio 2×2 grid */}
        {gameType === 'cambio' && myCambioZones.length > 0 && (
          <CambioGrid
            zones={myCambioZones}
            playerId={myPlayerId}
            peekResult={peekResult}
            onPeek={(cardId, zoneId) => send({ type: 'peek_card', cardId, zoneId })}
          />
        )}
      </div>

      {/* ── My hand ───────────────────────────────────── */}
      <div className="flex-shrink-0 pb-safe" style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
        {/* Your turn CTA above hand */}
        {isMyTurn && gameState.turnOrder.length > 0 && (
          <div className="px-4 pt-2 fade-in">
            <div className="w-full py-2 rounded-xl text-center"
              style={{ background: 'var(--accent)', boxShadow: '0 0 16px rgba(245,158,11,0.25)' }}>
              <span className="font-black text-sm tracking-widest" style={{ color: '#000' }}>
                YOUR TURN
              </span>
            </div>
          </div>
        )}

        {gameType !== 'cambio' && myHandZones.map(zone => (
          <Hand
            key={zone.id}
            zone={zone}
            onPlayCards={handlePlayCards}
            targetZones={playTargets}
            isMyTurn={isMyTurn}
            gameType={gameType ?? undefined}
          />
        ))}

        {/* Extra actions */}
        <div className="flex gap-2 justify-center px-4 pt-1 pb-2">
          {gameType === 'poker' && !me?.isFolded && (
            <ActionPill onClick={() => send({ type: 'fold' })} danger>Fold</ActionPill>
          )}
          {isHost && gameType === 'euchre' && (
            <TrumpSelector current={gameState.trumpSuit} onSelect={s => send({ type: 'set_trump', suit: s })} />
          )}
        </div>
      </div>

      {showScores && <ScoreBoard gameState={gameState} onClose={() => setShowScores(false)} />}

      {gameState.bluffReveal && (
        <BluffRevealModal
          reveal={gameState.bluffReveal}
          players={gameState.players}
          isHost={isHost}
          hostName={gameState.players.find(p => p.id === gameState.hostId)?.name ?? 'Host'}
          onResolve={bluffSucceeded => send({ type: 'resolve_bluff', bluffSucceeded })}
        />
      )}
    </div>
  )
}

/* ── Turn indicator ──────────────────────────────────── */

function TurnBanner({ gameState, myPlayerId }: { gameState: GameState; myPlayerId: string }) {
  const { currentTurnPlayerId, turnOrder, players } = gameState
  if (!currentTurnPlayerId) return null

  const isMyTurn = currentTurnPlayerId === myPlayerId
  const currentPlayer = players.find(p => p.id === currentTurnPlayerId)
  const currentIdx = turnOrder.indexOf(currentTurnPlayerId)
  const nextIdx = (currentIdx + 1) % turnOrder.length
  const nextPlayerId = turnOrder[nextIdx]
  const nextPlayer = players.find(p => p.id === nextPlayerId)
  const isNextMine = nextPlayerId === myPlayerId

  return (
    <div className="flex flex-col items-center gap-2 w-full">
      {/* Status line */}
      {!isMyTurn && (
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
            {currentPlayer?.name ?? '?'}'s turn
          </span>
          {nextPlayer && nextPlayerId !== currentTurnPlayerId && (
            <>
              <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>·</span>
              <span className="text-xs" style={{ color: isNextMine ? 'var(--accent)' : 'var(--text-muted)' }}>
                next: {isNextMine ? 'You' : nextPlayer.name}
              </span>
            </>
          )}
        </div>
      )}

      {/* Turn order strip */}
      {turnOrder.length > 1 && (
        <div className="flex gap-1 overflow-x-auto no-scrollbar w-full justify-center">
          {turnOrder.map((pid, idx) => {
            const p = players.find(pl => pl.id === pid)
            const isCurrent = idx === currentIdx
            const isNext = idx === nextIdx && turnOrder.length > 1
            const isMe = pid === myPlayerId
            return (
              <div key={pid} className="flex items-center gap-0.5 flex-shrink-0">
                <div
                  className="px-2 py-1 rounded-lg text-xs font-semibold transition-all"
                  style={{
                    background: isCurrent
                      ? (isMe ? 'var(--accent)' : 'var(--surface-hi)')
                      : isNext
                        ? 'var(--surface-mid)'
                        : 'transparent',
                    color: isCurrent
                      ? (isMe ? '#000' : 'var(--accent)')
                      : isNext
                        ? 'var(--text)'
                        : 'var(--text-dim)',
                    border: '1px solid ' + (isCurrent
                      ? 'var(--accent)'
                      : isNext
                        ? 'var(--border-hi)'
                        : 'transparent'),
                  }}
                >
                  {isMe ? 'You' : (p?.name ?? '?')}
                  {isCurrent && ' ▶'}
                </div>
                {idx < turnOrder.length - 1 && (
                  <span style={{ color: 'var(--text-dim)', fontSize: 9, margin: '0 1px' }}>›</span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ── Bluff reveal modal ──────────────────────────────── */

function BluffRevealModal({
  reveal, players, isHost, hostName, onResolve,
}: {
  reveal: BluffReveal
  players: Player[]
  isHost: boolean
  hostName: string
  onResolve: (bluffSucceeded: boolean) => void
}) {
  const submitter = players.find(p => p.id === reveal.submitterId)
  const caller = players.find(p => p.id === reveal.callerId)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.88)' }}>
      <div className="flex flex-col items-center gap-5 px-5 py-7 rounded-3xl w-full max-w-sm"
        style={{ background: 'var(--surface)', border: '1px solid var(--border-hi)' }}>

        <div className="text-center">
          <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>
            Bluff called!
          </p>
          <p className="text-sm" style={{ color: 'var(--text)' }}>
            <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{caller?.name ?? 'Someone'}</span>
            {' called bluff on '}
            <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{submitter?.name ?? 'Unknown'}</span>
          </p>
        </div>

        <div className="flex gap-2 flex-wrap justify-center">
          {reveal.cards.map(card => (
            <Card key={card.id} card={card} size="md" animate="flip" />
          ))}
        </div>

        {isHost ? (
          <div className="flex flex-col gap-2 w-full">
            <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
              Who takes the pile?
            </p>
            <button
              onClick={() => onResolve(true)}
              className="w-full py-3 rounded-2xl font-bold text-sm transition-all active:scale-95"
              style={{ background: 'rgba(229,62,62,0.15)', color: '#fc8181', border: '1px solid rgba(229,62,62,0.3)' }}
            >
              Bluff! → pile to {submitter?.name ?? 'submitter'}
            </button>
            <button
              onClick={() => onResolve(false)}
              className="w-full py-3 rounded-2xl font-bold text-sm transition-all active:scale-95"
              style={{ background: 'var(--surface-mid)', color: 'var(--text)', border: '1px solid var(--border-hi)' }}
            >
              Honest → pile to {caller?.name ?? 'caller'}
            </button>
          </div>
        ) : (
          <p className="text-sm text-center" style={{ color: 'var(--text-muted)' }}>
            Waiting for{' '}
            <span style={{ color: 'var(--text)', fontWeight: 600 }}>{hostName}</span>
            {' '}to decide…
          </p>
        )}
      </div>
    </div>
  )
}

/* ── Small helper components ─────────────────────────────────── */

function TopBtn({ children, onClick, accent }: {
  children: React.ReactNode; onClick: () => void; accent?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className="text-xs font-semibold px-3 py-1.5 rounded-full transition-all active:scale-95"
      style={{
        background: accent ? 'var(--accent-dim)' : 'var(--surface-mid)',
        color: accent ? 'var(--accent)' : 'var(--text-muted)',
        border: '1px solid ' + (accent ? 'rgba(245,158,11,0.3)' : 'var(--border)'),
      }}
    >
      {children}
    </button>
  )
}

function ActionPill({ children, onClick, danger }: {
  children: React.ReactNode; onClick: () => void; danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className="text-xs font-bold px-4 py-2 rounded-full transition-all active:scale-95"
      style={{
        background: danger ? 'rgba(229,62,62,0.14)' : 'var(--surface-mid)',
        color: danger ? '#fc8181' : 'var(--text)',
        border: '1px solid ' + (danger ? 'rgba(229,62,62,0.3)' : 'var(--border)'),
      }}
    >
      {children}
    </button>
  )
}

function TrumpSelector({ current, onSelect }: { current: Suit | null; onSelect: (s: Suit) => void }) {
  return (
    <div className="flex gap-1 items-center">
      <span className="text-[10px] mr-1" style={{ color: 'var(--text-muted)' }}>Trump:</span>
      {SUIT_OPTS.map(suit => (
        <button
          key={suit}
          onClick={() => onSelect(suit)}
          className="w-7 h-7 rounded-full text-sm font-bold transition-all active:scale-95"
          style={{
            background: current === suit ? 'var(--accent)' : 'var(--surface-mid)',
            color: current === suit ? '#000' : 'var(--text-muted)',
            border: '1px solid ' + (current === suit ? 'var(--accent)' : 'var(--border)'),
          }}
        >
          {SUIT_SYMBOL[suit]}
        </button>
      ))}
    </div>
  )
}

function CambioGrid({
  zones, playerId, peekResult, onPeek,
}: {
  zones: Zone[]
  playerId: string
  peekResult: { cardId: string; zoneId: string; rank: string; suit: string } | null
  onPeek: (cardId: string, zoneId: string) => void
}) {
  const sorted = [...zones].sort((a, b) => {
    if (!a.gridPosition || !b.gridPosition) return 0
    return a.gridPosition.row - b.gridPosition.row || a.gridPosition.col - b.gridPosition.col
  })
  const rows = [sorted.slice(0, 2), sorted.slice(2, 4)]

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] uppercase tracking-widest text-center" style={{ color: 'var(--text-dim)' }}>
        Your Cards
      </p>
      {rows.map((row, ri) => (
        <div key={ri} className="flex gap-2 justify-center">
          {row.map(zone => {
            const card = zone.cards[0]
            const isPeeked = card && peekResult?.cardId === card.id && peekResult?.zoneId === zone.id
            const displayCard = isPeeked
              ? { ...card, id: card.id.replace('hidden_', ''), rank: peekResult.rank as any, suit: peekResult.suit as any }
              : card
            return (
              <div key={zone.id}>
                {displayCard ? (
                  <Card
                    card={displayCard}
                    faceDown={!isPeeked}
                    size="md"
                    animate={isPeeked ? 'flip' : undefined}
                    onClick={() => card && !isPeeked && onPeek(card.id, zone.id)}
                  />
                ) : (
                  <div style={{
                    width: 58, height: 86, borderRadius: 'var(--radius-card)',
                    border: '1.5px dashed rgba(255,255,255,0.1)',
                  }} />
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
