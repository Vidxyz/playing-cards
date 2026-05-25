'use client'

import { useState } from 'react'
import type { GameState, ClientEvent } from '@playing-cards/shared'
import { Card } from './Card'

interface Props {
  gameState: GameState
  myPlayerId: string
  send: (event: ClientEvent) => void
  onLeave: () => void
  isHost: boolean
}

const PHASE_LABEL: Record<string, string> = {
  'pre-flop': 'Pre-Flop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
  showdown: 'Showdown',
}

export function PokerBoard({ gameState, myPlayerId, send, onLeave, isHost }: Props) {
  const [raiseAmount, setRaiseAmount] = useState(0)
  const [showRaise, setShowRaise] = useState(false)

  const me = gameState.players.find(p => p.id === myPlayerId)
  const isMyTurn = gameState.currentTurnPlayerId === myPlayerId
  const myChips = gameState.pokerChips[myPlayerId] ?? 0
  const myBet = gameState.pokerPlayerBets[myPlayerId] ?? 0
  const callAmount = Math.max(0, gameState.pokerCurrentBet - myBet)
  const isAllIn = gameState.pokerAllIn.includes(myPlayerId)
  const isFolded = me?.isFolded ?? false
  const bigBlind = gameState.pokerSmallBlind * 2
  const minRaiseTo = gameState.pokerCurrentBet + bigBlind
  const maxRaiseTo = myBet + myChips

  const canCheck = isMyTurn && !isFolded && !isAllIn && callAmount === 0
  const canCall = isMyTurn && !isFolded && !isAllIn && callAmount > 0
  const canRaise = isMyTurn && !isFolded && !isAllIn && myChips > callAmount

  const opponents = gameState.players.filter(p => p.id !== myPlayerId)
  const myZone = gameState.zones.find(z => z.id === `hole-cards-${myPlayerId}`)
  const communityCards = [
    ...(gameState.zones.find(z => z.id === 'flop')?.cards ?? []),
    ...(gameState.zones.find(z => z.id === 'turn')?.cards ?? []),
    ...(gameState.zones.find(z => z.id === 'river')?.cards ?? []),
  ]

  if (gameState.pokerWinners && gameState.phase === 'round-over') {
    return (
      <PokerResults
        gameState={gameState}
        myPlayerId={myPlayerId}
        isHost={isHost}
        send={send}
        onLeave={onLeave}
      />
    )
  }

  function handleRaise() {
    const amount = raiseAmount >= minRaiseTo ? raiseAmount : minRaiseTo
    send({ type: 'poker_bet', amount })
    setShowRaise(false)
    setRaiseAmount(0)
  }

  const waitingName = gameState.players.find(p => p.id === gameState.currentTurnPlayerId)?.name

  return (
    <div className="flex flex-col w-full h-full overflow-hidden" style={{ background: 'var(--bg)' }}>

      {/* Phase + pot header */}
      <div className="flex items-center justify-between px-4 py-2.5 shrink-0"
        style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--accent)' }}>
          {PHASE_LABEL[gameState.pokerPhase ?? ''] ?? 'Poker'}
        </span>
        <div className="flex items-center gap-4">
          {gameState.pokerPot > 0 && (
            <div className="text-center">
              <div className="text-[10px]" style={{ color: 'var(--text-dim)' }}>Pot</div>
              <div className="font-bold text-sm" style={{ color: 'var(--text)' }}>{gameState.pokerPot}</div>
            </div>
          )}
          {gameState.pokerCurrentBet > 0 && (
            <div className="text-center">
              <div className="text-[10px]" style={{ color: 'var(--text-dim)' }}>Bet</div>
              <div className="font-bold text-sm" style={{ color: 'var(--accent)' }}>{gameState.pokerCurrentBet}</div>
            </div>
          )}
        </div>
      </div>

      {/* Opponents row */}
      <div className="px-3 pt-2 pb-1 flex gap-2 overflow-x-auto shrink-0" style={{ minHeight: 110 }}>
        {opponents.map(player => {
          const chips = gameState.pokerChips[player.id] ?? 0
          const bet = gameState.pokerPlayerBets[player.id] ?? 0
          const isDealer = player.id === gameState.pokerDealerPlayerId
          const isAllInPlayer = gameState.pokerAllIn.includes(player.id)
          const opZone = gameState.zones.find(z => z.id === `hole-cards-${player.id}`)
          const isCurrentTurn = gameState.currentTurnPlayerId === player.id

          return (
            <div key={player.id}
              className="flex flex-col items-center gap-1 px-2 py-2 rounded-xl shrink-0"
              style={{
                background: isCurrentTurn ? 'var(--accent-dim)' : 'var(--surface)',
                border: `1px solid ${isCurrentTurn ? 'var(--accent)' : 'var(--border)'}`,
                opacity: player.isFolded ? 0.45 : 1,
                minWidth: 72,
              }}>
              {/* Card backs */}
              <div className="flex gap-0.5">
                {opZone && opZone.cards.length > 0 ? (
                  opZone.cards.map((card, i) => {
                    const isRevealed = !card.id.startsWith('hidden_')
                    return isRevealed
                      ? <Card key={card.id} card={card} size="xs" />
                      : (
                        <div key={i} className="rounded"
                          style={{ width: 18, height: 26, background: 'linear-gradient(145deg,#1a2d54,#1e3560)', border: '1px solid rgba(255,255,255,0.08)' }} />
                      )
                  })
                ) : (
                  <>
                    <div className="rounded" style={{ width: 18, height: 26, background: 'rgba(255,255,255,0.06)', border: '1px dashed rgba(255,255,255,0.1)' }} />
                    <div className="rounded" style={{ width: 18, height: 26, background: 'rgba(255,255,255,0.06)', border: '1px dashed rgba(255,255,255,0.1)' }} />
                  </>
                )}
              </div>
              <span className="text-[10px] font-medium truncate" style={{ maxWidth: 64, color: player.isFolded ? 'var(--text-dim)' : 'var(--text)' }}>
                {player.name}
              </span>
              <span className="text-[9px]" style={{ color: 'var(--text-dim)' }}>{chips}</span>
              <div className="flex flex-wrap gap-0.5 justify-center">
                {isDealer && <span className="text-[8px] px-1 rounded font-bold" style={{ background: 'var(--accent)', color: '#000' }}>D</span>}
                {isAllInPlayer && !player.isFolded && <span className="text-[8px] px-1 rounded font-bold" style={{ background: 'rgba(239,68,68,0.2)', color: '#f87171' }}>ALL IN</span>}
                {player.isFolded && <span className="text-[8px]" style={{ color: '#f87171' }}>Folded</span>}
                {bet > 0 && !player.isFolded && <span className="text-[8px] px-1 rounded" style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--accent)' }}>{bet}</span>}
              </div>
            </div>
          )
        })}
      </div>

      {/* Community cards */}
      <div className="flex-1 flex flex-col items-center justify-center gap-2 px-4">
        <div className="flex gap-2 flex-wrap justify-center">
          {communityCards.map(card => (
            <Card key={card.id} card={card} size="md" />
          ))}
          {Array.from({ length: Math.max(0, 5 - communityCards.length) }).map((_, i) => (
            <div key={`ph-${i}`} className="rounded-xl"
              style={{ width: 56, height: 80, background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.08)' }} />
          ))}
        </div>
        {communityCards.length === 0 && (
          <p className="text-xs" style={{ color: 'var(--text-dim)' }}>Community cards appear here</p>
        )}
      </div>

      {/* My hand + actions */}
      <div className="shrink-0 px-4 pb-6 pt-1">
        {/* My hole cards */}
        <div className="flex justify-center gap-3 mb-3">
          {myZone?.cards.map(card => (
            <Card key={card.id} card={card} size="lg" />
          ))}
          {(!myZone || myZone.cards.length === 0) && (
            <>
              <div className="rounded-xl" style={{ width: 64, height: 92, background: 'rgba(255,255,255,0.05)', border: '1px dashed rgba(255,255,255,0.1)' }} />
              <div className="rounded-xl" style={{ width: 64, height: 92, background: 'rgba(255,255,255,0.05)', border: '1px dashed rgba(255,255,255,0.1)' }} />
            </>
          )}
        </div>

        {/* My chip / bet info */}
        <div className="flex items-center justify-between mb-2 px-1">
          <div className="flex items-center gap-1.5">
            <span className="text-xs" style={{ color: 'var(--text-dim)' }}>Chips:</span>
            <span className="font-bold text-sm" style={{ color: 'var(--text)' }}>{myChips}</span>
            {me?.id === gameState.pokerDealerPlayerId && (
              <span className="text-[9px] px-1.5 rounded font-bold" style={{ background: 'var(--accent)', color: '#000' }}>D</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {myBet > 0 && <span className="text-xs" style={{ color: 'var(--accent)' }}>Bet: {myBet}</span>}
            {isAllIn && <span className="text-xs font-bold" style={{ color: '#f87171' }}>ALL IN</span>}
            {isFolded && <span className="text-xs" style={{ color: '#f87171' }}>Folded</span>}
          </div>
        </div>

        {/* Action buttons */}
        {isMyTurn && !isFolded && !isAllIn && (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <button
                onClick={() => send({ type: 'fold' })}
                className="flex-1 py-3 rounded-2xl font-bold text-sm transition-all active:scale-95"
                style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}
              >
                Fold
              </button>
              {canCheck && (
                <button
                  onClick={() => send({ type: 'poker_check' })}
                  className="flex-1 py-3 rounded-2xl font-bold text-sm transition-all active:scale-95"
                  style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}
                >
                  Check
                </button>
              )}
              {canCall && (
                <button
                  onClick={() => send({ type: 'poker_call' })}
                  className="flex-1 py-3 rounded-2xl font-bold text-sm transition-all active:scale-95"
                  style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--accent)' }}
                >
                  Call {callAmount}
                </button>
              )}
            </div>
            {canRaise && (
              <div className="flex gap-2">
                <button
                  onClick={() => send({ type: 'poker_all_in' })}
                  className="py-3 px-4 rounded-2xl font-bold text-sm transition-all active:scale-95 shrink-0"
                  style={{ background: 'rgba(239,68,68,0.18)', color: '#f87171', border: '1px solid rgba(239,68,68,0.35)' }}
                >
                  All In
                </button>
                <button
                  onClick={() => { setShowRaise(r => !r); if (!raiseAmount) setRaiseAmount(minRaiseTo) }}
                  className="flex-1 py-3 rounded-2xl font-bold text-sm transition-all active:scale-95"
                  style={{
                    background: showRaise ? 'var(--surface-mid)' : 'var(--surface)',
                    color: 'var(--text)',
                    border: '1px solid var(--border)',
                  }}
                >
                  Raise
                </button>
              </div>
            )}
            {showRaise && canRaise && (
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  min={minRaiseTo}
                  max={maxRaiseTo}
                  value={raiseAmount}
                  onChange={e => setRaiseAmount(Number(e.target.value))}
                  className="flex-1 py-2.5 px-3 rounded-xl text-sm font-bold"
                  style={{
                    background: 'var(--surface-mid)',
                    color: 'var(--text)',
                    border: '1px solid var(--border)',
                    outline: 'none',
                  }}
                />
                <button
                  onClick={handleRaise}
                  className="py-2.5 px-4 rounded-xl font-bold text-sm transition-all active:scale-95 shrink-0"
                  style={{ background: 'var(--accent)', color: '#000' }}
                >
                  Raise to {raiseAmount >= minRaiseTo ? raiseAmount : minRaiseTo}
                </button>
              </div>
            )}
          </div>
        )}

        {!isMyTurn && !isFolded && !isAllIn && waitingName && (
          <div className="text-center py-2">
            <span className="text-sm" style={{ color: 'var(--text-dim)' }}>Waiting for {waitingName}…</span>
          </div>
        )}

        {isAllIn && !isFolded && (
          <div className="text-center py-2">
            <span className="text-sm font-bold" style={{ color: '#f87171' }}>You're all in — watching the hand</span>
          </div>
        )}

        {isFolded && (
          <div className="text-center py-2">
            <span className="text-sm" style={{ color: 'var(--text-dim)' }}>You folded. Watching the hand…</span>
          </div>
        )}
      </div>
    </div>
  )
}

function PokerResults({
  gameState, myPlayerId, isHost, send, onLeave,
}: {
  gameState: GameState
  myPlayerId: string
  isHost: boolean
  send: (event: ClientEvent) => void
  onLeave: () => void
}) {
  const winners = gameState.pokerWinners ?? []
  const sorted = [...gameState.players].sort(
    (a, b) => (gameState.pokerChips[b.id] ?? 0) - (gameState.pokerChips[a.id] ?? 0)
  )

  return (
    <div className="flex flex-col w-full h-full overflow-y-auto px-5 py-6 gap-5"
      style={{ background: 'var(--bg)' }}>
      <div className="text-center">
        <div className="text-3xl mb-1">♠</div>
        <h2 className="font-bold text-xl mb-1" style={{ color: 'var(--text)' }}>Hand Over</h2>
        {winners.map(w => {
          const name = gameState.players.find(p => p.id === w.playerId)?.name
          return (
            <p key={w.playerId} className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {name} wins {w.amount} chips{w.handName ? ` — ${w.handName}` : ''}
            </p>
          )
        })}
      </div>

      <div className="flex flex-col gap-2">
        {sorted.map((p, i) => {
          const chips = gameState.pokerChips[p.id] ?? 0
          const win = winners.find(w => w.playerId === p.id)
          return (
            <div key={p.id}
              className="flex items-center justify-between rounded-xl px-4 py-3"
              style={{
                background: win ? 'rgba(74,222,128,0.08)' : 'var(--surface)',
                border: `1px solid ${win ? 'rgba(74,222,128,0.25)' : 'var(--border)'}`,
              }}>
              <div className="flex items-center gap-2.5">
                <span className="text-xs w-4" style={{ color: 'var(--text-dim)' }}>{i + 1}.</span>
                <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{p.name}</span>
                {win?.handName && (
                  <span className="text-[10px] font-bold" style={{ color: '#4ade80' }}>{win.handName}</span>
                )}
              </div>
              <div className="text-right">
                <div className="font-bold text-sm" style={{ color: win ? '#4ade80' : 'var(--text)' }}>
                  {chips}
                </div>
                {win && <div className="text-[10px]" style={{ color: '#4ade80' }}>+{win.amount}</div>}
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex gap-3 pb-2">
        {isHost && (
          <button
            onClick={() => send({ type: 'next_round' })}
            className="flex-1 font-bold py-3 rounded-2xl transition-all active:scale-95"
            style={{ background: 'var(--accent)', color: '#000' }}
          >
            Next Hand
          </button>
        )}
        <button
          onClick={onLeave}
          className="flex-1 font-bold py-3 rounded-2xl transition-all active:scale-95"
          style={{ background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
        >
          Leave
        </button>
      </div>
    </div>
  )
}
