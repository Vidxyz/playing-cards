'use client'

import { useEffect, useRef, useState } from 'react'
import type { GameState, ClientEvent } from '@playing-cards/shared'
import { Card } from './Card'
import { RoundOverActions } from './RoundOverActions'

const SUIT_SYMBOL: Record<string, string> = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' }
const SUIT_COLOR: Record<string, string> = {
  spades: 'var(--text)', clubs: 'var(--text)',
  hearts: '#f87171', diamonds: '#f87171',
}
const ROLE_LABEL: Record<string, string> = {
  president: '👑 President',
  vp: '🥈 VP',
  neutral: 'Neutral',
  vb: 'Vice Bum',
  bum: '💀 Bum',
}

const FINISH_TITLE: Record<string, { icon: string; label: string; color: string; bg: string; border: string }> = {
  president: { icon: '👑', label: 'President',  color: '#f59e0b', bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.4)' },
  vp:        { icon: '🥈', label: 'Vice Pres',  color: '#94a3b8', bg: 'rgba(148,163,184,0.12)', border: 'rgba(148,163,184,0.35)' },
  neutral:   { icon: '😐', label: 'Neutral',    color: 'var(--text-dim)', bg: 'var(--surface-mid)', border: 'var(--border)' },
  vb:        { icon: '😬', label: 'Vice Bum',   color: '#fb923c', bg: 'rgba(251,146,60,0.12)', border: 'rgba(251,146,60,0.35)' },
  bum:       { icon: '💀', label: 'Bum',        color: '#f87171', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)' },
}

function finishTitle(finishIdx: number, totalPlayers: number): string {
  if (finishIdx === 0) return 'president'
  if (finishIdx === 1 && totalPlayers >= 4) return 'vp'
  if (finishIdx === totalPlayers - 1) return 'bum'
  if (finishIdx === totalPlayers - 2 && totalPlayers >= 4) return 'vb'
  return 'neutral'
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

interface BurnInfo {
  ownerStr: string  // "Your" | "Alice's"
  rank: string      // 'JKR' | 'A' | '2' | etc.
  suit: string      // Suit key
}

interface FinishBanner {
  position: number      // 1-based finish position
  role: string | null   // 'president' | 'vp' | null (others determined at round end)
}

interface Props {
  gameState: GameState
  myPlayerId: string
  isHost: boolean
  send: (event: ClientEvent) => void
  onLeave: () => void
}

export function PresidentBoard({ gameState, myPlayerId, isHost, send, onLeave }: Props) {
  const [burnFlash, setBurnFlash] = useState(false)
  const [burnInfo, setBurnInfo] = useState<BurnInfo | null>(null)
  const lastBurnTimestampRef = useRef<number | null>(null)
  const burnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [passFlash, setPassFlash] = useState<string | null>(null)
  const lastPassTimestampRef = useRef<number | null>(null)
  const passTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [finishBanner, setFinishBanner] = useState<FinishBanner | null>(null)
  const prevFinishIdxRef = useRef(-1)
  const finishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Exchange phase animation: show overlay when cards arrive
  const [exchangeOverlay, setExchangeOverlay] = useState(false)
  const lastShownExchangeRoundRef = useRef(-1)
  const exchangeOverlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const action = gameState.lastAction
    if (!action || action.type !== 'play' || action.claim !== 'burn') return
    // Guard by timestamp: both phases of a two-phase broadcast share the same timestamp.
    // Without this, the second broadcast (pile cleared) would re-trigger the animation.
    if (action.timestamp === lastBurnTimestampRef.current) return
    lastBurnTimestampRef.current = action.timestamp

    // Capture info from first broadcast (cards still on pile, combo still set)
    const player = gameState.players.find(p => p.id === action.playerId)
    const combo = gameState.presidentCombo
    setBurnInfo({
      ownerStr: action.playerId === myPlayerId ? 'Your' : `${player?.name ?? 'Someone'}'s`,
      rank: combo?.rank ?? '?',
      suit: combo?.suit ?? 'spades',
    })
    setBurnFlash(true)

    if (burnTimerRef.current) clearTimeout(burnTimerRef.current)
    burnTimerRef.current = setTimeout(() => {
      setBurnFlash(false)
      setBurnInfo(null)
      burnTimerRef.current = null
    }, 3000)
    // Timer is managed via ref — intentionally no cleanup return so React
    // cannot cancel it when the second broadcast re-runs this effect.
  }, [gameState.lastAction, gameState.players, gameState.presidentCombo, myPlayerId])

  useEffect(() => {
    const action = gameState.lastAction
    if (!action || action.type !== 'pass') return
    if (action.timestamp === lastPassTimestampRef.current) return
    lastPassTimestampRef.current = action.timestamp

    const player = gameState.players.find(p => p.id === action.playerId)
    const name = action.playerId === myPlayerId ? 'You' : (player?.name ?? 'Someone')
    setPassFlash(name)

    if (passTimerRef.current) clearTimeout(passTimerRef.current)
    passTimerRef.current = setTimeout(() => {
      setPassFlash(null)
      passTimerRef.current = null
    }, 2000)
    // No cleanup return — same intentional pattern as burn timer
  }, [gameState.lastAction, gameState.players, myPlayerId])

  // Clear timers on unmount
  useEffect(() => () => {
    if (burnTimerRef.current) clearTimeout(burnTimerRef.current)
    if (passTimerRef.current) clearTimeout(passTimerRef.current)
    if (finishTimerRef.current) clearTimeout(finishTimerRef.current)
    if (exchangeOverlayTimerRef.current) clearTimeout(exchangeOverlayTimerRef.current)
  }, [])

  useEffect(() => {
    const active = gameState.presidentExchangePhase !== null
    const round = gameState.roundNumber
    if (active && lastShownExchangeRoundRef.current !== round) {
      lastShownExchangeRoundRef.current = round
      setExchangeOverlay(true)
      // Dismiss any lingering finish banner — the exchange overlay takes priority
      setFinishBanner(null)
      if (finishTimerRef.current) { clearTimeout(finishTimerRef.current); finishTimerRef.current = null }
      if (exchangeOverlayTimerRef.current) clearTimeout(exchangeOverlayTimerRef.current)
      exchangeOverlayTimerRef.current = setTimeout(() => {
        setExchangeOverlay(false)
        exchangeOverlayTimerRef.current = null
      }, 3500)
    }
  }, [gameState.presidentExchangePhase, gameState.roundNumber])

  useEffect(() => {
    const idx = gameState.presidentFinishOrder.indexOf(myPlayerId)
    if (idx === -1) {
      prevFinishIdxRef.current = -1  // reset on new round
      return
    }
    if (idx === prevFinishIdxRef.current) return
    prevFinishIdxRef.current = idx

    // Don't show finish banner when exchange phase is active: the exchange overlay covers
    // this moment, and on page refresh prevFinishIdxRef resets to -1 which would spuriously
    // re-fire the banner from the previous round's finish data.
    if (gameState.presidentExchangePhase !== null) return

    const totalPlayers = gameState.players.length
    let role: string | null = null
    if (idx === 0) role = 'president'
    else if (idx === 1 && totalPlayers >= 4) role = 'vp'

    if (finishTimerRef.current) clearTimeout(finishTimerRef.current)
    // Delay the overlay so the last card played remains visible for a moment first
    finishTimerRef.current = setTimeout(() => {
      setFinishBanner({ position: idx + 1, role })
      finishTimerRef.current = setTimeout(() => {
        setFinishBanner(null)
        finishTimerRef.current = null
      }, 3500)
    }, 2000)
  }, [gameState.presidentFinishOrder, myPlayerId, gameState.players.length, gameState.presidentExchangePhase])

  const combo = gameState.presidentCombo
  const playPile = gameState.zones.find(z => z.id === 'play-pile')
  const allPlayers = gameState.players
  const discardPhase = gameState.presidentDiscardPhase
  const myDiscardEntry = discardPhase?.find(d => d.playerId === myPlayerId && !d.done) ?? null
  const exchangePhase = gameState.presidentExchangePhase
  const myExchangeEntry = exchangePhase?.find(e => e.playerId === myPlayerId) ?? null
  const iAmGiver = exchangePhase?.some(e => e.recipientId === myPlayerId) ?? false

  const isFirstRound = Object.keys(gameState.presidentRoles).length === 0
  const roleFor = (pid: string) => isFirstRound ? 'neutral' : (gameState.presidentRoles[pid] ?? 'neutral')

  if (gameState.phase === 'round-over') {
    return (
      <PresidentResults
        gameState={gameState}
        myPlayerId={myPlayerId}
        isHost={isHost}
        onPlayAgain={() => send({ type: 'next_round' })}
        onHome={() => send({ type: 'end_game' })}
        onEnd={() => send({ type: 'close_room' })}
        onLeave={onLeave}
      />
    )
  }

  const myRole = roleFor(myPlayerId)
  const myRoleLabel = ROLE_LABEL[myRole] ?? myRole

  return (
    <div className="flex flex-col w-full gap-3">

      {/* Self role chip */}
      <div className="flex justify-center">
        <span
          className="text-xs font-bold px-3 py-1 rounded-full"
          style={{
            background: myRole === 'president' ? 'rgba(245,158,11,0.15)'
              : myRole === 'bum' ? 'rgba(239,68,68,0.1)'
              : 'var(--surface-mid)',
            color: myRole === 'president' ? 'var(--accent)'
              : myRole === 'bum' ? '#f87171'
              : 'var(--text-muted)',
            border: '1px solid ' + (myRole === 'president' ? 'rgba(245,158,11,0.3)'
              : myRole === 'bum' ? 'rgba(239,68,68,0.25)'
              : 'var(--border)'),
          }}
        >
          {myRoleLabel}
        </span>
      </div>

      {burnFlash && (
        <div
          className="w-full py-2.5 rounded-xl text-center fade-in"
          style={{
            background: 'rgba(245,158,11,0.15)',
            border: '1.5px solid rgba(245,158,11,0.5)',
            boxShadow: '0 0 24px rgba(245,158,11,0.25)',
          }}
        >
          <span className="font-black tracking-widest text-sm" style={{ color: 'var(--accent)' }}>
            🔥 BURN
          </span>
          {burnInfo && (
            <span className="text-sm ml-1.5" style={{ color: 'var(--text)' }}>
              {' — '}
              {burnInfo.rank === 'JKR' ? (
                <>{burnInfo.ownerStr} <span style={{ color: '#fbbf24', fontWeight: 800 }}>Joker</span></>
              ) : (
                <>{burnInfo.ownerStr} <span style={{ color: SUIT_COLOR[burnInfo.suit] ?? 'inherit', fontWeight: 800 }}>
                  {burnInfo.rank}{SUIT_SYMBOL[burnInfo.suit] ?? ''}
                </span></>
              )}
              {' '}cleared the pile!
            </span>
          )}
        </div>
      )}

      {passFlash && (
        <div
          className="w-full py-2.5 rounded-xl text-center fade-in"
          style={{
            background: 'rgba(148,163,184,0.1)',
            border: '1.5px solid rgba(148,163,184,0.35)',
          }}
        >
          <span className="font-black tracking-widest text-sm" style={{ color: 'var(--text-muted)' }}>
            ✋ PASS
          </span>
          <span className="text-sm ml-1.5" style={{ color: 'var(--text-muted)' }}>
            {' — '}{passFlash} passed
          </span>
        </div>
      )}

      {/* Card exchange phase banner */}
      {exchangePhase && (
        <div
          className="w-full rounded-xl px-4 py-3 fade-in"
          style={{
            background: 'var(--accent-dim)',
            border: '1.5px solid color-mix(in srgb, var(--accent) 35%, transparent)',
          }}
        >
          <p className="text-xs font-black tracking-widest text-center mb-1" style={{ color: 'var(--accent)' }}>
            🔄 CARD EXCHANGE
          </p>
          {myExchangeEntry && !myExchangeEntry.done ? (
            <>
              <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
                You received <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{myExchangeEntry.receivedCardIds.length}</span> card{myExchangeEntry.receivedCardIds.length !== 1 ? 's' : ''} from the{' '}
                <span style={{ fontWeight: 700, textTransform: 'capitalize' }}>{myExchangeEntry.giverRole === 'vb' ? 'Vice Bum' : 'Bum'}</span>.
              </p>
              <p className="text-sm text-center mt-2 font-black tracking-wide" style={{ color: 'var(--accent)' }}>
                👇 Select {myExchangeEntry.cardsOwed} card{myExchangeEntry.cardsOwed !== 1 ? 's' : ''} to return
              </p>
            </>
          ) : iAmGiver ? (
            <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
              Your best card{exchangePhase.find(e => e.recipientId === myPlayerId)?.cardsOwed !== 1 ? 's were' : ' was'} taken. Waiting for the other player to return cards…
            </p>
          ) : (
            <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
              Card exchange in progress…
            </p>
          )}
          {/* Who still needs to act */}
          <div className="flex flex-wrap justify-center gap-1.5 mt-2">
            {exchangePhase.map(e => {
              const p = gameState.players.find(pl => pl.id === e.playerId)
              return (
                <span key={e.playerId} className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                  style={{
                    background: e.done ? 'var(--accent-dim)' : 'var(--surface-mid)',
                    color: e.done ? 'var(--accent)' : 'var(--text-muted)',
                    border: '1px solid ' + (e.done ? 'color-mix(in srgb, var(--accent) 30%, transparent)' : 'var(--border)'),
                    textDecoration: e.done ? 'line-through' : 'none',
                  }}>
                  {p?.id === myPlayerId ? 'You' : (p?.name ?? '?')}{e.done ? ' ✓' : ''}
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* Run discard phase banner */}
      {discardPhase && (
        <div
          className="w-full rounded-xl px-4 py-3 fade-in"
          style={{
            background: 'rgba(34,197,94,0.08)',
            border: '1.5px solid rgba(34,197,94,0.35)',
          }}
        >
          <p className="text-xs font-black tracking-widest text-center mb-1" style={{ color: '#4ade80' }}>
            🃏 RUN BONUS
          </p>
          {myDiscardEntry ? (
            <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
              Discard up to <span style={{ color: '#4ade80', fontWeight: 700 }}>{myDiscardEntry.cardsNeeded}</span> card{myDiscardEntry.cardsNeeded !== 1 ? 's' : ''} from your hand, or skip — your choice.
            </p>
          ) : (
            <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
              Waiting for others to discard…
            </p>
          )}
          {/* Who still needs to act */}
          <div className="flex flex-wrap justify-center gap-1.5 mt-2">
            {discardPhase.map(d => {
              const p = gameState.players.find(pl => pl.id === d.playerId)
              return (
                <span key={d.playerId} className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                  style={{
                    background: d.done ? 'rgba(74,222,128,0.1)' : 'var(--surface-mid)',
                    color: d.done ? '#4ade80' : 'var(--text-muted)',
                    border: '1px solid ' + (d.done ? 'rgba(74,222,128,0.3)' : 'var(--border)'),
                    textDecoration: d.done ? 'line-through' : 'none',
                  }}>
                  {p?.name ?? '?'}{d.done ? ' ✓' : ''}
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* All players */}
      {allPlayers.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {allPlayers.map(player => {
            const isMe = player.id === myPlayerId
            const isActive = gameState.currentTurnPlayerId === player.id
            const hasPassed = gameState.presidentPassedIds.includes(player.id)
            const finishIdx = gameState.presidentFinishOrder.indexOf(player.id)
            const hasFinished = finishIdx !== -1
            const handZone = gameState.zones.find(z => z.id === `hand-${player.id}`)
            const cardCount = handZone?.cards.length ?? 0
            const role = roleFor(player.id)

            return (
              <div
                key={player.id}
                className="flex items-center justify-between px-3 py-2 rounded-xl"
                style={{
                  background: isActive ? 'rgba(245,158,11,0.08)' : isMe ? 'var(--accent-dim)' : 'var(--surface)',
                  border: '1px solid ' + (isActive ? 'rgba(245,158,11,0.4)' : isMe ? 'color-mix(in srgb, var(--accent) 25%, transparent)' : 'var(--border)'),
                  opacity: hasFinished ? 0.6 : 1,
                }}
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0"
                    style={{
                      background: isActive ? 'var(--accent)' : isMe ? 'color-mix(in srgb, var(--accent) 30%, var(--surface-mid))' : 'var(--surface-mid)',
                      color: isActive ? '#000' : isMe ? 'var(--accent)' : 'var(--text-muted)',
                    }}
                  >
                    {player.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex flex-col leading-none">
                    <span className="text-sm font-semibold" style={{ color: isActive ? 'var(--accent)' : isMe ? 'var(--accent)' : 'var(--text)' }}>
                      {isMe ? 'You' : player.name}{isActive ? ' ▶' : ''}
                    </span>
                    <span className="text-[10px] mt-0.5" style={{ color: 'var(--text-dim)' }}>
                      {ROLE_LABEL[role] ?? role}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {hasFinished ? (() => {
                    const t = FINISH_TITLE[finishTitle(finishIdx, gameState.players.length)]
                    return (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1"
                        style={{ background: t.bg, color: t.color, border: `1px solid ${t.border}` }}>
                        <span>{t.icon}</span>
                        <span>{t.label}</span>
                      </span>
                    )
                  })() : hasPassed ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: 'var(--surface-mid)', color: 'var(--text-dim)', border: '1px solid var(--border)' }}>
                      Passed
                    </span>
                  ) : (
                    <span className="text-[10px] tabular-nums" style={{ color: 'var(--text-dim)' }}>
                      {cardCount} card{cardCount !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Table combo */}
      <div
        className="flex flex-col items-center gap-3 py-4 px-4 rounded-2xl"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        {/* Suit order reminder */}
        <div className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-dim)' }}>
          <span className="font-bold" style={{ color: SUIT_COLOR.spades }}>♠</span>
          <span>›</span>
          <span className="font-bold" style={{ color: SUIT_COLOR.hearts }}>♥</span>
          <span>›</span>
          <span className="font-bold" style={{ color: SUIT_COLOR.clubs }}>♣</span>
          <span>›</span>
          <span className="font-bold" style={{ color: SUIT_COLOR.diamonds }}>♦</span>
          <span className="ml-1.5 text-[10px]">suit order (high → low)</span>
        </div>

        {combo ? (
          <div className="flex flex-col items-center gap-2">
            <span className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--text-dim)' }}>
              Beat this{combo.maxSuitIsWild ? ' · wild suit' : ''}
            </span>
            {playPile && playPile.cards.length > 0 && (() => {
              const CARD_W = 80
              const CARD_H = 116
              const OX = 20   // horizontal peek per card
              const OY = 4    // vertical drop per card
              const count = playPile.cards.length
              return (
                <div style={{
                  position: 'relative',
                  width: CARD_W + (count - 1) * OX,
                  height: CARD_H + (count - 1) * OY,
                }}>
                  {playPile.cards.map((card, i) => {
                    const isDeclaredWild = card.rank === '3' && combo !== null
                    return (
                      <div key={card.id} style={{
                        position: 'absolute',
                        left: i * OX,
                        top: i * OY,
                        zIndex: i,
                      }}>
                        <Card card={card} faceDown={false} size="lg" />
                        {isDeclaredWild && (
                          <div style={{
                            position: 'absolute',
                            bottom: 6,
                            left: '50%',
                            transform: 'translateX(-50%)',
                            background: 'rgba(0,0,0,0.82)',
                            color: 'var(--accent)',
                            fontSize: 11,
                            fontWeight: 900,
                            letterSpacing: '0.04em',
                            borderRadius: 5,
                            padding: '2px 7px',
                            whiteSpace: 'nowrap',
                            pointerEvents: 'none',
                            zIndex: 10,
                            boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
                          }}>
                            → {combo.rank}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>
        ) : (
          <div className="text-center">
            <p className="text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>
              Table is clear
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-dim)' }}>
              Play any valid combo to start
            </p>
          </div>
        )}
      </div>

      {/* Exchange received-cards overlay — shown briefly when cards arrive (hide once player has returned their cards) */}
      {exchangeOverlay && myExchangeEntry && !myExchangeEntry.done && (() => {
        const myHand = gameState.zones.find(z => z.id === `hand-${myPlayerId}`)
        const receivedCards = myExchangeEntry.receivedCardIds
          .map(id => myHand?.cards.find(c => c.id === id))
          .filter((c): c is NonNullable<typeof c> => c !== undefined)
        return (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 810,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.6)', pointerEvents: 'none',
          }}>
            <div className="fade-in" style={{
              background: 'var(--surface)', border: '2px solid var(--accent)',
              borderRadius: 24, padding: '28px 36px', textAlign: 'center',
              boxShadow: '0 12px 48px rgba(0,0,0,0.7)', minWidth: 220,
            }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>🔄</div>
              <p style={{ color: 'var(--accent)', fontWeight: 900, fontSize: 18, marginBottom: 6 }}>
                Cards Received!
              </p>
              <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 14 }}>
                From the {myExchangeEntry.giverRole === 'vb' ? 'Vice Bum' : 'Bum'}:
              </p>
              {receivedCards.length > 0 && (
                <div className="flex gap-3 justify-center" style={{ marginBottom: 14 }}>
                  {receivedCards.map(card => (
                    <Card key={card.id} card={card} faceDown={false} size="lg" />
                  ))}
                </div>
              )}
              <p style={{ color: 'var(--accent)', fontSize: 14, fontWeight: 900 }}>
                👇 Choose {myExchangeEntry.cardsOwed} card{myExchangeEntry.cardsOwed !== 1 ? 's' : ''} to return
              </p>
            </div>
          </div>
        )
      })()}

      {/* Exchange lost-cards overlay — shown to bum/VB while waiting for cards to be returned */}
      {exchangeOverlay && iAmGiver && !myExchangeEntry && (() => {
        const myEntry = exchangePhase?.find(e => e.recipientId === myPlayerId)
        if (!myEntry || myEntry.done) return null  // hide once president has returned cards
        return (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 810,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.6)', pointerEvents: 'none',
          }}>
            <div className="fade-in" style={{
              background: 'var(--surface)', border: '2px solid color-mix(in srgb, var(--accent) 40%, transparent)',
              borderRadius: 24, padding: '28px 36px', textAlign: 'center',
              boxShadow: '0 12px 48px rgba(0,0,0,0.7)', minWidth: 220,
            }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>📤</div>
              <p style={{ color: 'var(--text)', fontWeight: 900, fontSize: 18, marginBottom: 6 }}>
                Cards Taken
              </p>
              <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                Your best {myEntry.cardsOwed} card{myEntry.cardsOwed !== 1 ? 's were' : ' was'} sent to the{' '}
                {myEntry.giverRole === 'vb' ? 'Vice President' : 'President'}.
              </p>
              <p style={{ color: 'var(--text-dim)', fontSize: 11, marginTop: 10 }}>
                Waiting for them to return cards…
              </p>
            </div>
          </div>
        )
      })()}

      {/* Finish overlay — shown only to the local player when they get out */}
      {finishBanner && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 800,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0,0,0,0.55)',
          pointerEvents: 'none',
        }}>
          <div
            className="fade-in"
            style={{
              background: 'var(--surface)',
              border: '2px solid var(--accent)',
              borderRadius: 24,
              padding: '36px 48px',
              textAlign: 'center',
              boxShadow: '0 12px 48px rgba(0,0,0,0.7)',
              minWidth: 240,
            }}
          >
            <div style={{ fontSize: 56, lineHeight: 1, marginBottom: 12 }}>
              {finishBanner.role === 'president' ? '👑' : finishBanner.role === 'vp' ? '🥈' : '✅'}
            </div>
            <p style={{ color: 'var(--accent)', fontWeight: 900, fontSize: 24, letterSpacing: 0.5 }}>
              {finishBanner.role === 'president'
                ? 'President!'
                : finishBanner.role === 'vp'
                  ? 'Vice President!'
                  : `Finished ${ordinal(finishBanner.position)}!`}
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 8 }}>
              {finishBanner.role === 'president'
                ? 'First out — you lead the pack 🎉'
                : finishBanner.role === 'vp'
                  ? 'Runner-up finish!'
                  : 'You\'re out! Hang tight for the results…'}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

function PresidentResults({
  gameState, myPlayerId, isHost, onPlayAgain, onHome, onEnd, onLeave,
}: {
  gameState: GameState
  myPlayerId: string
  isHost: boolean
  onPlayAgain: () => void
  onHome: () => void
  onEnd: () => void
  onLeave: () => void
}) {
  const [scoresExpanded, setScoresExpanded] = useState(true)

  const ROLE_EMOJI: Record<string, string> = {
    president: '👑', vp: '🥈', neutral: '😐', vb: '😬', bum: '💀',
  }

  const positions = gameState.presidentFinishOrder.map((id, i) => ({
    id,
    pos: i + 1,
    player: gameState.players.find(p => p.id === id),
    role: gameState.presidentRoles[id],
  }))

  return (
    <div className="flex flex-col gap-3 w-full">
      <div className="text-center">
        <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: 'var(--text-dim)' }}>Round Over</p>
      </div>

      {/* Revealed hands */}
      <div className="flex flex-col gap-3">
        {gameState.players.map(p => {
          const handZone = gameState.zones.find(z => z.id === `hand-${p.id}`)
          const cards = handZone?.cards ?? []
          const isMe = p.id === myPlayerId
          const role = gameState.presidentRoles[p.id]
          return (
            <div key={p.id} className="flex flex-col gap-1.5 px-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold" style={{ color: isMe ? 'var(--accent)' : 'var(--text)' }}>
                  {isMe ? 'You' : p.name}
                </span>
                {role && (
                  <span className="text-[9px] font-semibold" style={{ color: 'var(--text-dim)' }}>
                    {ROLE_EMOJI[role]} {ROLE_LABEL[role] ?? role}
                  </span>
                )}
              </div>
              {cards.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {cards.map(card => <Card key={card.id} card={card} size="sm" />)}
                </div>
              ) : (
                <span className="text-xs italic" style={{ color: 'var(--text-dim)' }}>went out</span>
              )}
            </div>
          )
        })}
      </div>

      {/* Collapsible standings */}
      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border-hi)' }}>
        <button
          onClick={() => setScoresExpanded(v => !v)}
          className="w-full flex items-center justify-between px-3 py-2.5 transition-colors active:opacity-70"
          style={{ background: 'var(--surface-hi)' }}
        >
          <span className="text-xs font-black uppercase tracking-widest" style={{ color: 'var(--text)' }}>Final Standings</span>
          <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>{scoresExpanded ? '▲ hide' : '▼ show'}</span>
        </button>
        {scoresExpanded && (
          <div className="flex flex-col gap-1 px-2 pb-2 pt-1">
            {positions.map(({ id, pos, player, role }) => {
              const isMe = id === myPlayerId
              return (
                <div
                  key={id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                  style={{
                    background: isMe ? 'var(--accent-dim)' : 'var(--surface-mid)',
                    border: '1px solid ' + (isMe ? 'rgba(245,158,11,0.4)' : 'var(--border)'),
                  }}
                >
                  <span className="font-black text-base w-5 text-center tabular-nums" style={{ color: 'var(--text-dim)' }}>
                    {pos}
                  </span>
                  <span className="text-xl">{ROLE_EMOJI[role] ?? '•'}</span>
                  <div className="flex-1">
                    <span className="font-semibold text-sm" style={{ color: isMe ? 'var(--accent)' : 'var(--text)' }}>
                      {isMe ? 'You' : (player?.name ?? '?')}
                    </span>
                  </div>
                  <span className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>
                    {ROLE_LABEL[role] ?? role}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <RoundOverActions
        isHost={isHost}
        onPlayAgain={onPlayAgain}
        onHome={onHome}
        onEnd={onEnd}
        onLeave={onLeave}
      />
    </div>
  )
}
