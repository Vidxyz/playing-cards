'use client'

import { useState, useEffect, useRef } from 'react'
import type { GameState, ClientEvent } from '@playing-cards/shared'
import { Card } from './Card'
import { ChipSvg, ChipStack } from './BlackjackBoard'
import { getPokerBlinds } from '@/lib/poker'
import { RoundOverActions } from './RoundOverActions'

// Distinct per-seat colors for player identification
const PLAYER_COLORS = [
  '#f59e0b', // amber
  '#3b82f6', // blue
  '#ec4899', // pink
  '#10b981', // emerald
  '#8b5cf6', // violet
  '#f97316', // orange
  '#06b6d4', // cyan
  '#ef4444', // red
]

function getPlayerColorMap(gameState: GameState): Record<string, string> {
  const sorted = [...gameState.players].sort((a, b) => a.seatIndex - b.seatIndex)
  const map: Record<string, string> = {}
  sorted.forEach((p, i) => { map[p.id] = PLAYER_COLORS[i % PLAYER_COLORS.length] })
  return map
}


function chipColor(count: number): string {
  if (count >= 1000) return '#d97706'
  if (count >= 500) return '#ef4444'
  if (count >= 250) return '#16a34a'
  return '#3b82f6'
}

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
  const [raiseStr, setRaiseStr] = useState('')
  const [showRaise, setShowRaise] = useState(false)
  const [animCardMap, setAnimCardMap] = useState<Map<string, number>>(new Map())
  const prevCardIdsRef = useRef<string[]>([])

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

  const { sbId, bbId } = getPokerBlinds(gameState)
  const playerColorMap = getPlayerColorMap(gameState)
  const myColor = playerColorMap[myPlayerId] ?? 'var(--accent)'

  // Detect newly-dealt community cards and animate them flipping in with stagger
  const communityCardKey = communityCards.map(c => c.id).join(',')
  useEffect(() => {
    const prevIds = new Set(prevCardIdsRef.current)
    const newCards = communityCards.filter(c => !prevIds.has(c.id))
    prevCardIdsRef.current = communityCards.map(c => c.id)

    if (newCards.length === 0) return

    const map = new Map<string, number>()
    newCards.forEach((c, i) => map.set(c.id, i * 180))
    setAnimCardMap(map)
    const clearAt = 400 + (newCards.length - 1) * 180
    const t = setTimeout(() => setAnimCardMap(new Map()), clearAt)
    return () => clearTimeout(t)
  }, [communityCardKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset raise UI when it's no longer our turn
  useEffect(() => {
    if (!isMyTurn) { setShowRaise(false); setRaiseStr('') }
  }, [isMyTurn])

  if (gameState.phase === 'game-over' || (gameState.pokerWinners && gameState.phase === 'round-over')) {
    return (
      <PokerResults
        gameState={gameState}
        myPlayerId={myPlayerId}
        isHost={isHost}
        send={send}
        onLeave={onLeave}
        playerColorMap={playerColorMap}
      />
    )
  }

  function handleRaise() {
    const parsed = parseInt(raiseStr.replace(/\D/g, ''), 10)
    const amount = isNaN(parsed) || parsed < minRaiseTo ? minRaiseTo : Math.min(parsed, maxRaiseTo)
    send({ type: 'poker_bet', amount })
    setShowRaise(false)
    setRaiseStr('')
  }

  // A player with 0 chips during an active hand is a passive observer
  const isBustedObserver = myChips === 0 && gameState.pokerPhase !== null

  const waitingName = gameState.players.find(p => p.id === gameState.currentTurnPlayerId)?.name

  return (
    <div className="flex flex-col w-full h-full overflow-hidden" style={{ background: 'var(--bg)' }}>

      {/* Phase + pot header */}
      <div className="flex items-center justify-between px-4 py-2.5 shrink-0"
        style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--accent)' }}>
          {PHASE_LABEL[gameState.pokerPhase ?? ''] ?? 'Poker'}
        </span>
        <div className="flex items-center gap-3">
          {gameState.pokerPot > 0 && (
            <div className="flex items-center gap-1">
              <ChipSvg size={13} color="#d97706" />
              <div>
                <div className="text-[9px]" style={{ color: 'var(--text-dim)' }}>Pot</div>
                <div className="font-bold text-sm leading-none" style={{ color: 'var(--text)' }}>{gameState.pokerPot}</div>
              </div>
            </div>
          )}
          {gameState.pokerCurrentBet > 0 && (
            <div className="text-center">
              <div className="text-[9px]" style={{ color: 'var(--text-dim)' }}>Bet</div>
              <div className="font-bold text-sm leading-none" style={{ color: 'var(--accent)' }}>{gameState.pokerCurrentBet}</div>
            </div>
          )}
        </div>
      </div>

      {/* Opponents row */}
      <div className="px-3 pt-2 pb-1 flex gap-2 overflow-x-auto shrink-0" style={{ minHeight: 126 }}>
        {opponents.map(player => {
          const chips = gameState.pokerChips[player.id] ?? 0
          const bet = gameState.pokerPlayerBets[player.id] ?? 0
          const isDealer = player.id === gameState.pokerDealerPlayerId
          const isSB = player.id === sbId && !isDealer
          const isBB = player.id === bbId
          const isAllInPlayer = gameState.pokerAllIn.includes(player.id)
          const opZone = gameState.zones.find(z => z.id === `hole-cards-${player.id}`)
          const isCurrentTurn = gameState.currentTurnPlayerId === player.id
          const pColor = playerColorMap[player.id] ?? '#888'
          const isOpBusted = chips === 0 && gameState.pokerPhase !== null

          return (
            <div key={player.id}
              className="flex flex-col items-center gap-1 px-2 py-2 rounded-xl shrink-0"
              style={{
                background: isCurrentTurn ? `${pColor}18` : 'var(--surface)',
                border: `1px solid ${isCurrentTurn ? pColor : 'var(--border)'}`,
                opacity: isOpBusted ? 0.4 : player.isFolded ? 0.45 : 1,
                minWidth: 76,
              }}>
              {/* Player color dot */}
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: pColor }} />
              {/* Card backs or revealed cards — bust players show nothing */}
              <div className="flex gap-0.5">
                {isOpBusted ? (
                  <>
                    <div className="rounded" style={{ width: 18, height: 26, background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.06)' }} />
                    <div className="rounded" style={{ width: 18, height: 26, background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.06)' }} />
                  </>
                ) : opZone && opZone.cards.length > 0 ? (
                  opZone.cards.map((card, i) => (
                    card.id.startsWith('hidden_')
                      ? <div key={i} className="rounded"
                          style={{ width: 18, height: 26, background: 'linear-gradient(145deg,#1a2d54,#1e3560)', border: '1px solid rgba(255,255,255,0.08)' }} />
                      : <Card key={card.id} card={card} size="xs" />
                  ))
                ) : (
                  <>
                    <div className="rounded" style={{ width: 18, height: 26, background: 'rgba(255,255,255,0.06)', border: '1px dashed rgba(255,255,255,0.1)' }} />
                    <div className="rounded" style={{ width: 18, height: 26, background: 'rgba(255,255,255,0.06)', border: '1px dashed rgba(255,255,255,0.1)' }} />
                  </>
                )}
              </div>
              <span className="text-[10px] font-medium truncate" style={{ maxWidth: 68, color: isOpBusted ? 'var(--text-dim)' : player.isFolded ? 'var(--text-dim)' : 'var(--text)' }}>
                {player.name}
              </span>
              {/* Chip count */}
              <div className="flex items-center gap-1">
                <ChipSvg size={10} color={chipColor(chips)} />
                <span className="text-[9px] font-bold" style={{ color: 'var(--text-dim)' }}>{chips}</span>
              </div>
              {/* Role + status badges */}
              <div className="flex flex-wrap gap-0.5 justify-center">
                {isOpBusted && <span className="text-[8px] px-1 rounded font-bold" style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171' }}>Busted</span>}
                {!isOpBusted && isDealer && <span className="text-[8px] px-1 rounded font-bold" style={{ background: 'var(--accent)', color: '#000' }}>D</span>}
                {!isOpBusted && isSB && <span className="text-[8px] px-1 rounded font-bold" style={{ background: 'rgba(59,130,246,0.25)', color: '#60a5fa' }}>SB</span>}
                {!isOpBusted && isBB && <span className="text-[8px] px-1 rounded font-bold" style={{ background: 'rgba(168,85,247,0.25)', color: '#c084fc' }}>BB</span>}
                {!isOpBusted && isAllInPlayer && !player.isFolded && <span className="text-[8px] px-1 rounded font-bold" style={{ background: 'rgba(239,68,68,0.2)', color: '#f87171' }}>ALL IN</span>}
                {!isOpBusted && player.isFolded && <span className="text-[8px]" style={{ color: '#f87171' }}>Folded</span>}
                {!isOpBusted && bet > 0 && !player.isFolded && <span className="text-[8px] px-1 rounded" style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--accent)' }}>{bet}</span>}
              </div>
            </div>
          )
        })}
      </div>

      {/* Community cards — newly dealt cards flip in with stagger */}
      <div className="flex-1 flex flex-col items-center justify-center gap-2 px-4">
        <div className="flex gap-2 flex-wrap justify-center">
          {communityCards.map(card => {
            const delay = animCardMap.get(card.id)
            const isAnim = delay !== undefined
            return (
              <div
                key={card.id}
                className={isAnim ? 'card-flip' : ''}
                style={isAnim ? { animationDelay: `${delay}ms` } : undefined}
              >
                <Card card={card} size="md" />
              </div>
            )
          })}
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

        {/* My chip display */}
        <div className="flex items-center gap-3 mb-3 px-1">
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: myColor, flexShrink: 0 }} />
          <ChipStack count={myChips} chipSize={22} />
          <div className="flex flex-col leading-tight">
            <span className="font-black text-lg" style={{ color: 'var(--text)' }}>{myChips}</span>
            <span className="text-[9px] uppercase tracking-widest" style={{ color: 'var(--text-dim)' }}>chips</span>
          </div>
          <div style={{ flex: 1 }} />
          <div className="flex flex-wrap gap-1 items-center justify-end">
            {me?.id === gameState.pokerDealerPlayerId && (
              <span className="text-[9px] px-1.5 rounded font-bold" style={{ background: 'var(--accent)', color: '#000' }}>D</span>
            )}
            {myPlayerId === sbId && myPlayerId !== gameState.pokerDealerPlayerId && (
              <span className="text-[9px] px-1.5 rounded font-bold" style={{ background: 'rgba(59,130,246,0.25)', color: '#60a5fa' }}>SB</span>
            )}
            {myPlayerId === bbId && (
              <span className="text-[9px] px-1.5 rounded font-bold" style={{ background: 'rgba(168,85,247,0.25)', color: '#c084fc' }}>BB</span>
            )}
            {myBet > 0 && <span className="text-xs font-bold" style={{ color: 'var(--accent)' }}>Bet: {myBet}</span>}
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
                  onClick={() => {
                    const opening = !showRaise
                    setShowRaise(r => !r)
                    if (opening) setRaiseStr(String(minRaiseTo))
                  }}
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
                  type="text"
                  inputMode="numeric"
                  placeholder={String(minRaiseTo)}
                  value={raiseStr}
                  onChange={e => setRaiseStr(e.target.value.replace(/\D/g, ''))}
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
                  {(() => {
                    const p = parseInt(raiseStr, 10)
                    return `Raise to ${isNaN(p) || p < minRaiseTo ? minRaiseTo : Math.min(p, maxRaiseTo)}`
                  })()}
                </button>
              </div>
            )}
          </div>
        )}

        {isBustedObserver && (
          <div className="text-center py-2">
            <span className="text-sm" style={{ color: 'var(--text-dim)' }}>You're out of chips — observing this hand</span>
          </div>
        )}

        {!isBustedObserver && !isMyTurn && !isFolded && !isAllIn && waitingName && (
          <div className="text-center py-2">
            <span className="text-sm" style={{ color: 'var(--text-dim)' }}>Waiting for {waitingName}…</span>
          </div>
        )}

        {!isBustedObserver && isAllIn && !isFolded && (
          <div className="text-center py-2">
            <span className="text-sm font-bold" style={{ color: '#f87171' }}>You're all in — watching the hand</span>
          </div>
        )}

        {!isBustedObserver && isFolded && (
          <div className="text-center py-2">
            <span className="text-sm" style={{ color: 'var(--text-dim)' }}>You folded. Watching the hand…</span>
          </div>
        )}
      </div>
    </div>
  )
}

function PokerResults({
  gameState, myPlayerId, isHost, send, onLeave, playerColorMap,
}: {
  gameState: GameState
  myPlayerId: string
  isHost: boolean
  send: (event: ClientEvent) => void
  onLeave: () => void
  playerColorMap: Record<string, string>
}) {
  const [standingsExpanded, setStandingsExpanded] = useState(true)
  const isGameOver = gameState.phase === 'game-over'
  const winners = gameState.pokerWinners ?? []
  const sortedByChips = [...gameState.players].sort(
    (a, b) => (gameState.pokerChips[b.id] ?? 0) - (gameState.pokerChips[a.id] ?? 0)
  )

  const communityCards = [
    ...(gameState.zones.find(z => z.id === 'flop')?.cards ?? []),
    ...(gameState.zones.find(z => z.id === 'turn')?.cards ?? []),
    ...(gameState.zones.find(z => z.id === 'river')?.cards ?? []),
  ]

  // Show non-folded players first, then folded — preserving chip order within each group
  const nonFolded = sortedByChips.filter(p => !p.isFolded)
  const folded = sortedByChips.filter(p => p.isFolded)
  const handsOrder = [...nonFolded, ...folded]

  // At game-over, the tournament winner is whoever has chips
  const tournamentWinner = isGameOver ? sortedByChips.find(p => (gameState.pokerChips[p.id] ?? 0) > 0) : null

  return (
    <div className="flex flex-col w-full h-full overflow-y-auto px-4 py-5 gap-5"
      style={{ background: 'var(--bg)' }}>

      {/* Header */}
      {isGameOver ? (
        <div className="text-center shrink-0">
          <div className="text-3xl mb-1">🏆</div>
          <h2 className="font-bold text-xl mb-1" style={{ color: 'var(--text)' }}>Game Over</h2>
          {tournamentWinner && (
            <p className="text-sm font-semibold" style={{ color: playerColorMap[tournamentWinner.id] ?? '#4ade80' }}>
              {tournamentWinner.name} wins the tournament!
            </p>
          )}
        </div>
      ) : (
        <div className="text-center shrink-0">
          <div className="text-3xl mb-1">♠</div>
          <h2 className="font-bold text-xl mb-1" style={{ color: 'var(--text)' }}>Hand Over</h2>
          {winners.map(w => {
            const name = gameState.players.find(p => p.id === w.playerId)?.name
            const pColor = playerColorMap[w.playerId] ?? '#4ade80'
            return (
              <p key={w.playerId} className="text-sm font-semibold" style={{ color: pColor }}>
                {name} wins {w.amount} chips{w.handName ? ` — ${w.handName}` : ''}
              </p>
            )
          })}
        </div>
      )}

      {/* Board — only for round-over, not game-over */}
      {!isGameOver && communityCards.length > 0 && (
        <div className="shrink-0">
          <p className="text-[10px] uppercase tracking-widest font-semibold mb-2 text-center"
            style={{ color: 'var(--text-dim)' }}>Board</p>
          <div className="flex gap-2 justify-center flex-wrap">
            {communityCards.map(card => (
              <Card key={card.id} card={card} size="md" />
            ))}
          </div>
        </div>
      )}

      {/* Player hands — only for round-over */}
      {!isGameOver && <div className="flex flex-col gap-2">
        <p className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--text-dim)' }}>Hands</p>
        {handsOrder.map(p => {
          const win = winners.find(w => w.playerId === p.id)
          const pColor = playerColorMap[p.id] ?? '#888'
          const zone = gameState.zones.find(z => z.id === `hole-cards-${p.id}`)
          const holeCards = zone?.cards ?? []
          const chips = gameState.pokerChips[p.id] ?? 0

          return (
            <div key={p.id}
              className="rounded-xl px-3 py-2.5"
              style={{
                background: win ? `${pColor}18` : 'var(--surface)',
                border: `1px solid ${win ? pColor : 'var(--border)'}`,
                opacity: p.isFolded ? 0.55 : 1,
              }}>
              <div className="flex items-center gap-2 mb-2">
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: pColor, flexShrink: 0 }} />
                <span className="text-sm font-bold" style={{ color: win ? pColor : 'var(--text)' }}>{p.name}</span>
                {p.id === myPlayerId && (
                  <span className="text-[9px] px-1 rounded" style={{ background: 'var(--surface-mid)', color: 'var(--text-dim)' }}>You</span>
                )}
                {p.isFolded && <span className="text-[9px]" style={{ color: '#f87171' }}>Folded</span>}
                {win?.handName && (
                  <span className="text-[10px] font-bold" style={{ color: pColor }}>— {win.handName}</span>
                )}
                <div className="ml-auto flex items-center gap-1.5">
                  <ChipSvg size={11} color={chipColor(chips)} />
                  <span className="text-xs font-bold" style={{ color: win ? pColor : 'var(--text)' }}>{chips}</span>
                  {win && <span className="text-[10px] font-bold" style={{ color: pColor }}>+{win.amount}</span>}
                </div>
              </div>
              <div className="flex gap-1.5">
                {holeCards.length > 0 ? holeCards.map((card, i) => (
                  card.id.startsWith('hidden_')
                    ? <div key={i} className="rounded"
                        style={{ width: 32, height: 46, background: 'linear-gradient(145deg,#1a2d54,#1e3560)', border: '1px solid rgba(255,255,255,0.08)' }} />
                    : <Card key={card.id} card={card} size="sm" />
                )) : (
                  <>
                    <div className="rounded" style={{ width: 32, height: 46, background: 'rgba(255,255,255,0.05)', border: '1px dashed rgba(255,255,255,0.1)' }} />
                    <div className="rounded" style={{ width: 32, height: 46, background: 'rgba(255,255,255,0.05)', border: '1px dashed rgba(255,255,255,0.1)' }} />
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>}

      {/* Chip standings — collapsible */}
      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        <button
          onClick={() => setStandingsExpanded(v => !v)}
          className="w-full flex items-center justify-between px-3 py-2.5 transition-colors active:opacity-70"
          style={{ background: 'var(--surface)' }}
        >
          <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--text-dim)' }}>Chip Standings</span>
          <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>{standingsExpanded ? '▲ hide' : '▼ show'}</span>
        </button>
        {standingsExpanded && (
          <div className="flex flex-col gap-1 px-2 pb-2">
            {sortedByChips.map((p, i) => {
              const chips = gameState.pokerChips[p.id] ?? 0
              const win = winners.find(w => w.playerId === p.id)
              const pColor = playerColorMap[p.id] ?? '#888'
              return (
                <div key={p.id}
                  className="flex items-center justify-between rounded-xl px-3 py-2"
                  style={{
                    background: win ? `${pColor}12` : 'var(--surface-mid)',
                    border: `1px solid ${win ? `${pColor}50` : 'var(--border)'}`,
                  }}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs w-4 text-right" style={{ color: 'var(--text-dim)' }}>{i + 1}.</span>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: pColor, flexShrink: 0 }} />
                    <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{p.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <ChipSvg size={12} color={chipColor(chips)} />
                    <span className="font-bold text-sm" style={{ color: win ? pColor : 'var(--text)' }}>{chips}</span>
                    {win && <span className="text-[10px] font-bold" style={{ color: pColor }}>+{win.amount}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="pb-2 shrink-0">
        <RoundOverActions
          isHost={isHost}
          onPlayAgain={!isGameOver ? () => send({ type: 'next_round' }) : undefined}
          onHome={() => send({ type: 'end_game' })}
          onEnd={() => send({ type: 'close_room' })}
          onLeave={onLeave}
        />
      </div>
    </div>
  )
}
