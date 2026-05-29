'use client'

import { useState, useEffect, useRef } from 'react'
import type { GameState, ClientEvent, Card as CardType } from '@playing-cards/shared'
import { Card } from './Card'
import { RoundOverActions } from './RoundOverActions'

export function bjHandValue(cards: CardType[]): number {
  const visible = cards.filter(c => !c.id.endsWith('__facedown') && !c.id.startsWith('hidden_'))
  let sum = 0, aces = 0
  for (const c of visible) {
    if (c.rank === 'A') { aces++; sum += 11 }
    else if (['J', 'Q', 'K'].includes(c.rank)) sum += 10
    else sum += Number(c.rank)
  }
  while (sum > 21 && aces > 0) { sum -= 10; aces-- }
  return sum
}

export const BJ_RESULT_LABEL: Record<string, string> = {
  win: 'Win',
  blackjack: 'Blackjack!',
  push: 'Push',
  lose: 'Bust',
}

export const BJ_RESULT_COLOR: Record<string, string> = {
  win: '#4ade80',
  blackjack: 'var(--accent)',
  push: 'var(--text-muted)',
  lose: '#fc8181',
}

function chipColorFor(count: number): string {
  if (count >= 1000) return '#334155'
  if (count >= 500)  return '#dc2626'
  if (count >= 200)  return '#16a34a'
  return '#1d4ed8'
}

// r=11, circumference ≈ 69.1; 8 notches: dash=2.5, gap=6.14
export function ChipSvg({ size = 20, color = '#16a34a' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="11" style={{ fill: color }} />
      <circle cx="12" cy="12" r="11" fill="none" stroke="rgba(255,255,255,0.42)" strokeWidth="3" strokeDasharray="2.5 6.14" />
      <circle cx="12" cy="12" r="7.5" fill="rgba(0,0,0,0.18)" />
      <circle cx="12" cy="12" r="7.5" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="0.75" />
      <circle cx="12" cy="12" r="4.5" style={{ fill: color }} />
      <circle cx="12" cy="12" r="2" fill="rgba(255,255,255,0.28)" />
    </svg>
  )
}

export function ChipStack({ count, chipSize = 22 }: { count: number; chipSize?: number }) {
  const numChips = count >= 500 ? 3 : count >= 200 ? 2 : 1
  const color = chipColorFor(count)
  const offset = 3
  return (
    <div className="relative flex-shrink-0" style={{ width: chipSize, height: chipSize + (numChips - 1) * offset }}>
      {Array.from({ length: numChips }, (_, i) => (
        <div key={i} style={{ position: 'absolute', bottom: i * offset }}>
          <ChipSvg size={chipSize} color={color} />
        </div>
      ))}
    </div>
  )
}

export function BlackjackBoard({
  gameState, myPlayerId, isHost, drawPileCount, send, onLeave,
}: {
  gameState: GameState
  myPlayerId: string
  isHost: boolean
  drawPileCount: number
  send: (e: ClientEvent) => void
  onLeave: () => void
}) {
  const { currentTurnPlayerId, players, blackjackResults, blackjackChips, blackjackBets, phase } = gameState
  const dealerZone = gameState.zones.find(z => z.id === 'dealer-hand')
  const hiddenDealerCard = dealerZone?.cards.find(c => c.id.endsWith('__facedown'))
  const dealerValue = bjHandValue(dealerZone?.cards ?? [])
  const dealerBust = dealerValue > 21
  const otherPlayers = players.filter(p => p.id !== myPlayerId)

  const [showResults, setShowResults] = useState(false)
  const [resultsExpanded, setResultsExpanded] = useState(true)
  const [dealerBustAnim, setDealerBustAnim] = useState(false)
  const prevPhaseRef = useRef<string | null>(null)

  useEffect(() => {
    const prevPhase = prevPhaseRef.current
    prevPhaseRef.current = phase

    if (phase === 'round-over' && prevPhase !== 'round-over') {
      if (prevPhase === null) {
        // Reconnect / page load — skip animation, show immediately
        setShowResults(true)
      } else if (dealerBust) {
        setDealerBustAnim(true)
        const t1 = setTimeout(() => setDealerBustAnim(false), 2000)
        const t2 = setTimeout(() => setShowResults(true), 2200)
        return () => { clearTimeout(t1); clearTimeout(t2) }
      } else {
        setShowResults(true)
      }
    } else if (phase !== 'round-over') {
      setShowResults(false)
      setDealerBustAnim(false)
    }
  }, [phase, dealerBust])

  return (
    <div className="flex flex-col gap-5 items-center w-full">

      {/* Dealer hand */}
      <div
        className={`flex flex-col items-center gap-2 px-4 py-3 rounded-2xl transition-all ${dealerBustAnim ? 'red-pulse' : ''}`}
        style={{
          border: dealerBustAnim ? '1px solid rgba(239,68,68,0.45)' : '1px solid transparent',
          background: dealerBustAnim ? 'rgba(239,68,68,0.07)' : 'transparent',
        }}
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--text-dim)' }}>
            Dealer
          </span>
          {dealerZone && dealerZone.cards.length > 0 && (
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full`}
              style={{
                background: 'var(--surface-hi)',
                color: dealerBust ? '#fc8181' : dealerValue === 21 ? 'var(--accent)' : 'var(--text)',
                border: `1px solid ${dealerBust && (dealerBustAnim || showResults) ? 'rgba(239,68,68,0.5)' : 'var(--border-hi)'}`,
              }}>
              {hiddenDealerCard ? '?' : dealerValue}
            </span>
          )}
        </div>

        {/* Bust badge — appears as soon as dealer goes over */}
        {dealerBustAnim && (
          <div
            className="bust-pop flex items-center gap-1.5 px-3 py-1.5 rounded-xl"
            style={{ background: 'rgba(239,68,68,0.18)', border: '1px solid rgba(239,68,68,0.55)' }}
          >
            <span className="font-black text-sm tracking-widest" style={{ color: '#f87171' }}>DEALER BUSTS!</span>
          </div>
        )}

        <div className="flex gap-2 justify-center flex-wrap">
          {dealerZone?.cards.map(card => (
            <Card key={card.id} card={card} size="md" />
          ))}
        </div>
      </div>

      {/* Round results — shown after bust animation completes (or immediately if no bust) */}
      {showResults && blackjackResults && (
        <div className="w-full max-w-xs fade-in rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border-hi)' }}>
          <button
            onClick={() => setResultsExpanded(v => !v)}
            className="w-full flex items-center justify-between px-3 py-2.5 transition-colors active:opacity-70"
            style={{ background: 'var(--surface-hi)' }}
          >
            <span className="text-xs font-black uppercase tracking-widest" style={{ color: 'var(--text)' }}>Results</span>
            <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>{resultsExpanded ? '▲ hide' : '▼ show'}</span>
          </button>
          {resultsExpanded && (
            <div className="flex flex-col gap-3 px-2 pb-2 pt-1">
              {dealerBust && (
                <div className="w-full px-3 py-2 rounded-xl text-center"
                  style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
                  <span className="text-xs font-bold" style={{ color: '#f87171' }}>
                    Dealer busted with {dealerValue} — all surviving hands win
                  </span>
                </div>
              )}
              <div className="flex flex-col gap-1.5 w-full">
                {players.map(player => {
                  const mainResult = blackjackResults[player.id]
                  if (!mainResult) return null
                  const hasSplit = gameState.blackjackSplits?.includes(player.id) ?? false
                  const splitResult = hasSplit ? gameState.blackjackSplitResults?.[player.id] : undefined
                  const chips = blackjackChips?.[player.id] ?? 0
                  return (
                    <div key={player.id} className="flex items-center justify-between rounded-xl px-3 py-2"
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                      <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{player.name}</span>
                      <div className="flex items-center gap-2">
                        {hasSplit ? (
                          <div className="flex flex-col items-end gap-0.5">
                            <div className="flex items-center gap-1">
                              <span className="text-[9px]" style={{ color: 'var(--text-dim)' }}>H1</span>
                              <span className="text-[10px] font-bold" style={{ color: BJ_RESULT_COLOR[mainResult] }}>
                                {BJ_RESULT_LABEL[mainResult]}
                              </span>
                            </div>
                            {splitResult && (
                              <div className="flex items-center gap-1">
                                <span className="text-[9px]" style={{ color: 'var(--text-dim)' }}>H2</span>
                                <span className="text-[10px] font-bold" style={{ color: BJ_RESULT_COLOR[splitResult] }}>
                                  {BJ_RESULT_LABEL[splitResult]}
                                </span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-[10px] font-bold" style={{ color: BJ_RESULT_COLOR[mainResult] }}>
                            {BJ_RESULT_LABEL[mainResult]}
                          </span>
                        )}
                        <div className="flex items-center gap-1">
                          <ChipSvg size={12} color={chipColorFor(chips)} />
                          <span className="text-[10px] font-semibold" style={{ color: 'var(--text-muted)' }}>{chips}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              <RoundOverActions
                isHost={isHost}
                onPlayAgain={() => send({ type: 'next_round' })}
                onHome={() => send({ type: 'end_game' })}
                onEnd={() => send({ type: 'close_room' })}
                onLeave={onLeave}
              />
            </div>
          )}
        </div>
      )}

      {/* Other players' hands (not me) */}
      {otherPlayers.length > 0 && (!showResults || !resultsExpanded) && (
        <div className="flex gap-5 justify-center flex-wrap">
          {otherPlayers.map(player => {
            const mainZone = gameState.zones.find(z => z.id === `hand-${player.id}`)
            const splitZone = gameState.zones.find(z => z.id === `hand-${player.id}-b`)
            if (!mainZone || mainZone.cards.length === 0) return null
            const hasSplit = gameState.blackjackSplits?.includes(player.id) ?? false
            const isOnSplitHand = hasSplit && (gameState.blackjackMainHandDone?.includes(player.id) ?? false)
            const mainVal = bjHandValue(mainZone.cards)
            const splitVal = splitZone ? bjHandValue(splitZone.cards) : 0
            const isActive = currentTurnPlayerId === player.id
            const chips = blackjackChips?.[player.id] ?? 0
            const bet = blackjackBets?.[player.id] ?? 0
            const mainBust = !hasSplit && player.isFolded
            return (
              <div key={player.id} className="flex flex-col items-center gap-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-semibold truncate max-w-[64px]"
                    style={{ color: isActive ? 'var(--accent)' : 'var(--text-muted)' }}>
                    {player.name}{isActive ? ' ▶' : ''}
                  </span>
                </div>
                {/* Chip + bet info */}
                <div className="flex items-center gap-1.5">
                  <ChipSvg size={13} color={chipColorFor(chips)} />
                  <span className="text-[10px] font-semibold" style={{ color: 'var(--text-muted)' }}>{chips}</span>
                  <span style={{ color: 'var(--text-dim)', fontSize: 9 }}>·</span>
                  <span className="text-[9px]" style={{ color: 'var(--text-dim)' }}>bet</span>
                  <span className="text-[10px] font-semibold" style={{ color: '#d97706' }}>{bet}</span>
                </div>
                {/* Main hand */}
                <div className="flex flex-col items-center gap-0.5">
                  {hasSplit && (
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] uppercase tracking-wide" style={{ color: 'var(--text-dim)' }}>H1</span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                        style={{ background: 'var(--surface-hi)', color: mainVal > 21 ? '#fc8181' : mainVal === 21 ? 'var(--accent)' : 'var(--text)', border: `1px solid ${!isOnSplitHand && isActive ? 'var(--accent)' : 'var(--border-hi)'}` }}>
                        {mainVal > 21 ? 'Bust' : mainVal}
                      </span>
                    </div>
                  )}
                  {!hasSplit && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{ background: 'var(--surface-hi)', color: mainBust ? '#fc8181' : mainVal === 21 ? 'var(--accent)' : 'var(--text)', border: '1px solid var(--border-hi)' }}>
                      {mainBust ? 'Bust' : mainVal}
                    </span>
                  )}
                  <div className="flex gap-1 flex-wrap justify-center">
                    {mainZone.cards.map(card => <Card key={card.id} card={card} size="sm" />)}
                  </div>
                </div>
                {/* Split hand */}
                {hasSplit && splitZone && splitZone.cards.length > 0 && (
                  <div className="flex flex-col items-center gap-0.5 mt-1">
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] uppercase tracking-wide" style={{ color: 'var(--text-dim)' }}>H2</span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                        style={{ background: 'var(--surface-hi)', color: splitVal > 21 ? '#fc8181' : splitVal === 21 ? 'var(--accent)' : 'var(--text)', border: `1px solid ${isOnSplitHand && isActive ? 'var(--accent)' : 'var(--border-hi)'}` }}>
                        {splitVal > 21 ? 'Bust' : splitVal}
                      </span>
                    </div>
                    <div className="flex gap-1 flex-wrap justify-center">
                      {splitZone.cards.map(card => <Card key={card.id} card={card} size="sm" />)}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Shoe */}
      {drawPileCount > 0 && (
        <div className="flex flex-col items-center gap-1">
          <div className="relative" style={{ width: 58, height: 86 }}>
            <div style={{ position: 'absolute', top: -2, left: -2, width: 58, height: 86, borderRadius: 'var(--radius-card)', background: 'linear-gradient(145deg,#1a2d54,#1e3560)', border: '1px solid rgba(255,255,255,0.06)' }} />
            <div style={{ position: 'absolute', top: -1, left: -1, width: 58, height: 86, borderRadius: 'var(--radius-card)', background: 'linear-gradient(145deg,#1e3560,#243f72)', border: '1px solid rgba(255,255,255,0.08)' }} />
            <div style={{ position: 'absolute', top: 0, left: 0, width: 58, height: 86, borderRadius: 'var(--radius-card)', background: 'linear-gradient(145deg,#243f72,#1e3560)', border: '1px solid rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: 700 }}>{drawPileCount}</span>
            </div>
          </div>
          <span className="text-[9px] uppercase tracking-widest" style={{ color: 'var(--text-dim)' }}>shoe</span>
        </div>
      )}
    </div>
  )
}
