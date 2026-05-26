'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import type { GameState, ClientEvent, GameAction, Zone, Suit, BluffReveal, Player, Card as CardType } from '@playing-cards/shared'
import { rankName, checkRummyGoOut } from '@playing-cards/shared'
import { getPokerBlinds } from '@/lib/poker'
import type { PeekResult } from '@/hooks/useRoom'
import { Hand } from './Hand'
import { Zone as ZoneView } from './Zone'
import { PlayerStrip } from './PlayerStrip'
import { ScoreBoard } from './ScoreBoard'
import { Card } from './Card'
import { CambioTutorialModal, BluffTutorialModal, PresidentTutorialModal, BlackjackTutorialModal, PokerTutorialModal, GoFishTutorialModal, RummyTutorialModal, CrazyEightsTutorialModal } from './CambioTutorial'
import { EuchreBoard } from './EuchreBoard'
import { PresidentBoard } from './PresidentBoard'
import { PokerBoard } from './PokerBoard'
import { BlackjackBoard, bjHandValue, BJ_RESULT_LABEL, BJ_RESULT_COLOR, ChipSvg, ChipStack } from './BlackjackBoard'
import { GoFishBoard } from './GoFishBoard'
import { RummyBoard } from './RummyBoard'
import { CrazyEightsBoard } from './CrazyEightsBoard'
import { ThemeToggle } from './ThemeToggle'
import { Toast } from './Toast'

interface Props {
  gameState: GameState
  myPlayerId: string
  send: (event: ClientEvent) => void
  lastAction: GameAction | null
  peekResults: PeekResult[]
  initialPeeks: PeekResult[]
  clearInitialPeeks: () => void
  onLeave: () => void
  errorMsg?: string | null
}


const SUIT_SYMBOL: Record<string, string> = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' }
const SUIT_OPTS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs']
const GAME_LABEL: Record<string, string> = {
  blackjack: 'Blackjack',
  president: 'President',
  poker: 'Poker',
  euchre: 'Euchre',
  cambio: 'Cambio',
  bluff: 'Bluff',
  'go-fish': 'Go Fish',
  rummy: 'Rummy',
  'crazy-eights': 'Crazy 8s',
}
const GAME_MAX_PLAYERS: Partial<Record<string, number>> = {
  president: 8, blackjack: 7, poker: 9, euchre: 4,
  cambio: 6, bluff: 8, 'go-fish': 6, rummy: 6, 'crazy-eights': 6,
}
const SUIT_OPTS_C8: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs']
const SUIT_LABEL_C8: Record<string, string> = { spades: '♠ Spades', hearts: '♥ Hearts', diamonds: '♦ Diamonds', clubs: '♣ Clubs' }
const SUIT_COLOR_C8: Record<string, string> = { spades: 'var(--text)', clubs: 'var(--text)', hearts: '#f87171', diamonds: '#f87171' }
// Games that manage their own round-over results screen
const GAMES_WITH_OWN_RESULTS = new Set(['president', 'poker', 'blackjack', 'go-fish', 'rummy', 'crazy-eights'])

export function GameTable({ gameState, myPlayerId, send, lastAction, peekResults, initialPeeks, clearInitialPeeks, onLeave, errorMsg }: Props) {
  const [showScores, setShowScores] = useState(false)
  const [showTutorialFor, setShowTutorialFor] = useState<string | null>(null)
  const [isBluffRevealing, setIsBluffRevealing] = useState(false)
  const [pilePickupToast, setPilePickupToast] = useState<{ playerName: string; cardCount: number; isMe: boolean } | null>(null)
  const [bluffPileFlash, setBluffPileFlash] = useState(false)
  const [showDoubleDeckToast, setShowDoubleDeckToast] = useState(false)
  const [exchangeBannerReady, setExchangeBannerReady] = useState(false)
  const [rummyGoOutError, setRummyGoOutError] = useState<string | null>(null)
  const [c8sPendingCardId, setC8sPendingCardId] = useState<string | null>(null)
  const [c8sError, setC8sError] = useState<string | null>(null)
  const exchangeBannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rummyGoOutErrTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const c8sErrTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const gameStateRef = useRef(gameState)
  const bluffPileCountRef = useRef(0)

  // Keep gameStateRef current so handlePlayCards can read latest zones without deps
  useEffect(() => { gameStateRef.current = gameState })

  useEffect(() => {
    if (gameState.phase !== 'round-over') return
    if (gameState.gameType && GAMES_WITH_OWN_RESULTS.has(gameState.gameType)) return
    const delay = gameState.gameType === 'cambio' ? 3000 : 0
    const t = setTimeout(() => setShowScores(true), delay)
    return () => clearTimeout(t)
  }, [gameState.phase, gameState.gameType])

  // Track bluff pile size so we can report how many cards were swept up
  useEffect(() => {
    const pile = gameState.zones.find(z => z.isBluffPile)
    if (pile) bluffPileCountRef.current = pile.cards.length
  }, [gameState.zones])

  const me = gameState.players.find(p => p.id === myPlayerId)
  const isHost = me?.isHost ?? false
  const isMyTurn = gameState.currentTurnPlayerId === myPlayerId
  const gameType = gameState.gameType

  const pokerBlinds = useMemo(
    () => gameType === 'poker' ? getPokerBlinds(gameState) : { sbId: null as string | null, bbId: null as string | null },
    [gameType, gameState.pokerDealerPlayerId, gameState.players] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const myHasPassed = gameState.bluffPassedPlayerIds.includes(myPlayerId)
  const presidentHasPassed = gameState.presidentPassedIds.includes(myPlayerId)
  const presidentHasFinished = gameState.presidentFinishOrder.includes(myPlayerId)
  const presidentDiscardEntry = gameState.presidentDiscardPhase?.find(d => d.playerId === myPlayerId && !d.done) ?? null
  const isInDiscardPhase = presidentDiscardEntry !== null
  const discardPhaseActive = gameState.presidentDiscardPhase !== null
  const presidentExchangeEntry = gameState.presidentExchangePhase?.find(e => e.playerId === myPlayerId && !e.done) ?? null
  const isInExchangePhase = presidentExchangeEntry !== null
  const exchangePhaseActive = gameState.presidentExchangePhase !== null
  // Burn in progress: pile still has cards from a burn play — block all plays until cleared
  const burnInProgress = gameType === 'president'
    && gameState.lastAction?.claim === 'burn'
    && gameState.presidentCombo !== null

  // Enable hand only on your turn, or when it's your discard/exchange to make
  const handIsMyTurn = gameType === 'president'
    ? !burnInProgress && (isInExchangePhase
      || isInDiscardPhase
      || (!exchangePhaseActive && !discardPhaseActive && isMyTurn && !presidentHasPassed && !presidentHasFinished))
    : gameType === 'rummy'
      ? isMyTurn && gameState.rummyHasDrawn
      : gameType === 'crazy-eights'
        ? isMyTurn
        : isMyTurn

  useEffect(() => {
    if (lastAction?.type === 'bluff_reveal') {
      setIsBluffRevealing(true)
      const t = setTimeout(() => setIsBluffRevealing(false), 3000)
      return () => clearTimeout(t)
    }
  }, [lastAction])

  // Show exchange banner only after the "Cards Received" overlay has auto-dismissed (3.5s)
  useEffect(() => {
    if (isInExchangePhase) {
      exchangeBannerTimerRef.current = setTimeout(() => setExchangeBannerReady(true), 3500)
    } else {
      setExchangeBannerReady(false)
      if (exchangeBannerTimerRef.current) {
        clearTimeout(exchangeBannerTimerRef.current)
        exchangeBannerTimerRef.current = null
      }
    }
    return () => {
      if (exchangeBannerTimerRef.current) clearTimeout(exchangeBannerTimerRef.current)
    }
  }, [isInExchangePhase])

  // Double-deck toast for President
  useEffect(() => {
    if (gameState.gameType !== 'president' || !gameState.presidentDoubleDeck) return
    if (gameState.phase !== 'playing') return
    setShowDoubleDeckToast(true)
    const t = setTimeout(() => setShowDoubleDeckToast(false), 4000)
    return () => clearTimeout(t)
  }, [gameState.phase, gameState.presidentDoubleDeck, gameState.gameType])

  // Bluff pile pickup animation
  useEffect(() => {
    if (!lastAction || lastAction.type !== 'move') return
    if (lastAction.fromZoneId !== 'bluff-pile') return
    const recipientId = lastAction.playerId
    const player = gameState.players.find(p => p.id === recipientId)
    const playerName = player ? (recipientId === myPlayerId ? 'You' : player.name) : 'Player'
    const cardCount = bluffPileCountRef.current
    if (cardCount === 0) return
    setPilePickupToast({ playerName, cardCount, isMe: recipientId === myPlayerId })
    setBluffPileFlash(true)
    const t1 = setTimeout(() => setBluffPileFlash(false), 1200)
    const t2 = setTimeout(() => setPilePickupToast(null), 3500)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [lastAction, myPlayerId]) // eslint-disable-line react-hooks/exhaustive-deps

  const myHandZones = gameState.zones.filter(z =>
    z.ownerId === myPlayerId &&
    (z.id.startsWith('hand-') || z.id.startsWith('hole-cards-'))
  )
  // Lifted to component scope so the hand-rendering section below can read them
  const bjHasSplit = gameType === 'blackjack' && (gameState.blackjackSplits?.includes(myPlayerId) ?? false)
  const bjIsOnSplitHand = bjHasSplit && (gameState.blackjackMainHandDone?.includes(myPlayerId) ?? false)
  const sharedZones = gameState.zones.filter(z => z.ownerId === null)

  const playTargets = sharedZones
    .filter(z => !['burn', 'tricks-a', 'tricks-b', 'cleared'].includes(z.id))
    .map(z => ({ id: z.id, name: z.name, isBluffPile: z.isBluffPile }))

  const handlePlayCards = useCallback((cardIds: string[], toZoneId: string, claim?: { rank: string }) => {
    if (gameType === 'crazy-eights') {
      const cardId = cardIds[0]
      if (!cardId) return
      const gs = gameStateRef.current
      const myHand = gs.zones.find(z => z.id === `hand-${myPlayerId}`)
      const card = myHand?.cards.find(c => c.id === cardId)
      if (!card) return
      const discardZone = gs.zones.find(z => z.id === 'discard')
      const topCard = discardZone?.cards.at(-1) ?? null
      if (topCard) {
        const effectiveSuit = gs.crazy8sDeclaredSuit ?? topCard.suit
        const canPlay = card.rank === '8' || card.rank === topCard.rank || card.suit === effectiveSuit
        if (!canPlay) {
          const msg = gs.crazy8sDeclaredSuit
            ? `Must match the declared suit (${gs.crazy8sDeclaredSuit}) or rank (${topCard.rank}), or play an 8`
            : `Must match suit (${topCard.suit}) or rank (${topCard.rank}), or play an 8`
          setC8sError(msg)
          if (c8sErrTimerRef.current) clearTimeout(c8sErrTimerRef.current)
          c8sErrTimerRef.current = setTimeout(() => setC8sError(null), 3500)
          return
        }
      }
      if (card.rank === '8') {
        setC8sPendingCardId(cardId)
        return
      }
      send({ type: 'crazy8s_play', cardId })
      return
    }
    if (gameType === 'rummy') {
      const cardId = cardIds[0]
      if (!cardId) return
      if (toZoneId === 'go-out') {
        const handZone = gameStateRef.current.zones.find(z => z.id === `hand-${myPlayerId}`)
        const remaining = (handZone?.cards ?? []).filter(c => c.id !== cardId)
        const result = checkRummyGoOut(remaining)
        if (result !== 'ok') {
          const msg = result === 'cant-meld'
            ? "Your hand can't be fully melded — not all cards form valid sets or runs"
            : 'You need at least one natural run (no jokers) to go out'
          setRummyGoOutError(msg)
          if (rummyGoOutErrTimerRef.current) clearTimeout(rummyGoOutErrTimerRef.current)
          rummyGoOutErrTimerRef.current = setTimeout(() => setRummyGoOutError(null), 4000)
          return
        }
      }
      send({ type: 'rummy_discard', cardId, faceDown: toZoneId === 'go-out' })
      return
    }
    if (gameType === 'president') {
      send({ type: 'play_cards', cardIds, toZoneId, wildRank: claim?.rank })
    } else {
      send({ type: 'play_cards', cardIds, toZoneId, bluffClaim: claim })
    }
  }, [send, gameType, myPlayerId])

  const handleRunDiscard = useCallback((cardIds: string[]) => {
    send({ type: 'president_run_discard', cardIds })
  }, [send])

  const handleExchangeReturn = useCallback((cardIds: string[]) => {
    send({ type: 'president_exchange_return', cardIds })
  }, [send])

  const handleDraw = useCallback((toZoneId?: string) => {
    send({ type: 'draw_card', toZoneId: toZoneId || myHandZones[0]?.id || `hand-${myPlayerId}` })
  }, [send, myHandZones, myPlayerId])

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg)' }}>

      {/* ── Top bar ─────────────────────────────────── */}
      <div className="flex-shrink-0 pt-safe" style={{ borderBottom: '1px solid var(--border)' }}>

        {/* Row 1: Exit | Brand (centered) | Actions + Settings */}
        <div className="relative flex items-center px-4 py-2">

          {/* Left: exit button */}
          {isHost ? (
            <button
              onClick={() => send({ type: 'end_game' })}
              className="text-xs font-semibold px-3 py-1.5 rounded-full transition-all active:scale-95 flex-shrink-0"
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
              className="text-xs font-semibold px-3 py-1.5 rounded-full transition-all active:scale-95 flex-shrink-0"
              style={{
                background: 'var(--surface-mid)',
                color: 'var(--text-muted)',
                border: '1px solid var(--border)',
              }}
            >
              Leave
            </button>
          )}

          {/* Center: DealMeIn brand — absolutely centred so it's unaffected by side widths */}
          <div className="absolute left-0 right-0 flex items-center justify-center pointer-events-none">
            <div className="flex items-center gap-1.5">
              <span style={{ fontSize: 20, lineHeight: 1 }}>🃏</span>
              <span className="font-black text-base tracking-wide" style={{ color: 'var(--text)' }}>DealMeIn</span>
            </div>
          </div>

          {/* Right: actions + settings */}
          <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto">
            {gameType !== 'cambio' && gameType !== 'blackjack' && gameType !== 'euchre' && gameType !== 'president' && gameType !== 'poker' && gameType !== 'go-fish' && gameType !== 'rummy' && gameType !== 'crazy-eights' && (
              <TopBtn
                onClick={() => !myHasPassed && send({ type: 'pass_turn' })}
                disabled={myHasPassed}
              >
                {gameType === 'bluff' && myHasPassed ? 'Passed' : 'Pass'}
              </TopBtn>
            )}
            {(gameType === 'cambio' || gameType === 'bluff' || gameType === 'president' || gameType === 'blackjack' || gameType === 'poker' || gameType === 'go-fish' || gameType === 'rummy' || gameType === 'crazy-eights') && (
              <TopBtn onClick={() => setShowTutorialFor(gameType)}>?</TopBtn>
            )}
            <TopBtn onClick={() => setShowScores(true)}>Scores</TopBtn>
            {isHost && gameType !== 'president' && gameType !== 'poker' && gameType !== 'blackjack' && gameType !== 'go-fish' && gameType !== 'rummy' && gameType !== 'crazy-eights' && (
              <TopBtn onClick={() => send({ type: 'next_round' })} accent>
                Next
              </TopBtn>
            )}
            <ThemeToggle compact />
          </div>
        </div>

        {/* Row 2: player identity + centered game name */}
        {me && (
          <div className="relative flex items-center gap-2 px-4 pt-0.5 pb-1.5">
            {/* Absolutely centered game name */}
            {gameType && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="font-bold text-[14px] leading-tight" style={{ color: 'var(--text-muted)' }}>
                  {GAME_LABEL[gameType] ?? gameType}
                </span>
                <span className="text-[10px] leading-tight" style={{ color: 'var(--text-dim)' }}>
                  Round {gameState.roundNumber}
                </span>
              </div>
            )}
            <div
              className="flex items-center justify-center rounded-full text-[9px] font-black flex-shrink-0"
              style={{ width: 22, height: 22, background: 'var(--accent)', color: '#000' }}
            >
              {me.name.slice(0, 2).toUpperCase()}
            </div>
            <span className="text-xs font-bold truncate max-w-[90px]" style={{ color: 'var(--text)' }}>
              {me.name}
            </span>
            {isHost && (
              <span className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded-full"
                style={{ background: 'var(--surface-mid)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                host
              </span>
            )}
            {pokerBlinds.sbId === myPlayerId && (
              <span className="text-[9px] font-black px-1 py-0.5 rounded"
                style={{ background: 'rgba(59,130,246,0.2)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.35)' }}>
                small blind
              </span>
            )}
            {pokerBlinds.bbId === myPlayerId && (
              <span className="text-[9px] font-black px-1 py-0.5 rounded"
                style={{ background: 'rgba(168,85,247,0.2)', color: '#c084fc', border: '1px solid rgba(168,85,247,0.35)' }}>
                big blind
              </span>
            )}
            {gameState.trumpSuit && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-auto"
                style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid rgba(245,158,11,0.3)' }}>
                {SUIT_SYMBOL[gameState.trumpSuit]} Trump
              </span>
            )}
          </div>
        )}

        <PlayerStrip
          gameState={gameState}
          myPlayerId={myPlayerId}
        />
      </div>

      {/* Spectator notice / join choice */}
      {(() => {
        const pendingMe = gameState.pendingPlayers.find(p => p.id === myPlayerId)
        if (!pendingMe) return null
        const maxPlayers = gameType ? (GAME_MAX_PLAYERS[gameType] ?? 12) : 12
        const hasRoom = gameState.players.length < maxPlayers
        if (hasRoom) {
          // Room available — offer a choice
          return (
            <div className="flex flex-col items-center gap-2 px-4 py-2.5"
              style={{ background: 'rgba(245,158,11,0.07)', borderBottom: '1px solid rgba(245,158,11,0.15)' }}>
              <span className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>
                {pendingMe.staySpectator ? 'Spectating only — not joining next round' : "You'll be dealt in next round"}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => send({ type: 'set_spectator_preference', staySpectator: false })}
                  className="text-[11px] font-bold px-3 py-1 rounded-full transition-all active:scale-95"
                  style={{
                    background: !pendingMe.staySpectator ? 'var(--accent)' : 'var(--surface-mid)',
                    color: !pendingMe.staySpectator ? '#000' : 'var(--text-muted)',
                    border: '1px solid ' + (!pendingMe.staySpectator ? 'var(--accent)' : 'var(--border)'),
                  }}
                >
                  Join next round
                </button>
                <button
                  onClick={() => send({ type: 'set_spectator_preference', staySpectator: true })}
                  className="text-[11px] font-bold px-3 py-1 rounded-full transition-all active:scale-95"
                  style={{
                    background: pendingMe.staySpectator ? 'var(--surface-hi)' : 'var(--surface-mid)',
                    color: pendingMe.staySpectator ? 'var(--text)' : 'var(--text-muted)',
                    border: '1px solid ' + (pendingMe.staySpectator ? 'var(--border-hi)' : 'var(--border)'),
                  }}
                >
                  Just watch
                </button>
              </div>
            </div>
          )
        }
        // No room — pure spectator
        return (
          <div className="flex items-center justify-center gap-2 px-4 py-2"
            style={{ background: 'rgba(245,158,11,0.07)', borderBottom: '1px solid rgba(245,158,11,0.15)' }}>
            <span style={{ fontSize: 13 }}>👁</span>
            <span className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>
              Spectating — game is full, you'll join when there's a free spot
            </span>
          </div>
        )
      })()}

      {/* ── Table (shared zones + draw pile) ─────────── */}
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-4 py-3 overflow-y-auto">

        {/* Turn indicator — hidden for games with their own turn display */}
        {gameState.turnOrder.length > 0 && gameState.currentTurnPlayerId && gameType !== 'president' && gameType !== 'poker' && gameType !== 'go-fish' && gameType !== 'rummy' && gameType !== 'crazy-eights' && (
          <TurnBanner gameState={gameState} myPlayerId={myPlayerId} />
        )}

        {gameType === 'president' ? (
          <PresidentBoard
            gameState={gameState}
            myPlayerId={myPlayerId}
            isHost={isHost}
            send={send}
            onHome={onLeave}
          />
        ) : gameType === 'poker' ? (
          <div className="self-stretch flex-1 flex w-full">
            <PokerBoard
              gameState={gameState}
              myPlayerId={myPlayerId}
              send={send}
              onLeave={onLeave}
              isHost={isHost}
            />
          </div>
        ) : gameType === 'euchre' ? (
          <EuchreBoard
            gameState={gameState}
            myPlayerId={myPlayerId}
            send={send}
          />
        ) : gameType === 'cambio' ? (
          <CambioBoard
            gameState={gameState}
            myPlayerId={myPlayerId}
            peekResults={peekResults}
            initialPeeks={initialPeeks}
            clearInitialPeeks={clearInitialPeeks}
            send={send}
            isMyTurn={isMyTurn}
            showScores={showScores}
          />
        ) : gameType === 'blackjack' ? (
          <BlackjackBoard
            gameState={gameState}
            myPlayerId={myPlayerId}
            isHost={isHost}
            drawPileCount={gameState.drawPileCount}
            send={send}
          />
        ) : gameType === 'go-fish' ? (
          <GoFishBoard
            gameState={gameState}
            myPlayerId={myPlayerId}
            send={send}
            isHost={isHost}
          />
        ) : gameType === 'rummy' ? (
          <RummyBoard
            gameState={gameState}
            myPlayerId={myPlayerId}
            send={send}
            isHost={isHost}
          />
        ) : gameType === 'crazy-eights' ? (
          <CrazyEightsBoard
            gameState={gameState}
            myPlayerId={myPlayerId}
            send={send}
            isHost={isHost}
          />
        ) : (
          <>
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
                    flashWarn={zone.isBluffPile && bluffPileFlash}
                  />
                ))}
              </div>
            )}

            {/* Bluff declaration history */}
            {gameType === 'bluff' && gameState.bluffHistory.length > 0 && (
              <BluffHistoryLog
                last={gameState.bluffHistory.at(-1)!}
                players={gameState.players}
                activeRank={gameState.bluffActiveRank}
              />
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
          </>
        )}
      </div>

      {/* ── My hand (hidden for games with their own hand rendering) ── */}
      {gameType !== 'cambio' && gameType !== 'euchre' && gameType !== 'poker' && gameType !== 'go-fish' && (() => {
        // Compute playable card IDs for crazy-eights
        const c8sPlayableIds = gameType === 'crazy-eights' && isMyTurn ? (() => {
          const discardZone = gameState.zones.find(z => z.id === 'discard')
          const topCard = discardZone?.cards.at(-1)
          if (!topCard) return undefined
          const effectiveSuit = gameState.crazy8sDeclaredSuit ?? topCard.suit
          const myHand = gameState.zones.find(z => z.id === `hand-${myPlayerId}`)
          return myHand?.cards
            .filter(c => c.rank === '8' || c.rank === topCard.rank || c.suit === effectiveSuit)
            .map(c => c.id)
        })() : undefined
        return (
      <div className="flex-shrink-0 pb-safe" style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
        {/* Your turn CTA — blackjack shows Hit/Stand/Split instead */}
        {gameType === 'blackjack' ? (() => {
          const myMainCards = gameState.zones.find(z => z.id === `hand-${myPlayerId}`)?.cards ?? []
          const mySplitCards = gameState.zones.find(z => z.id === `hand-${myPlayerId}-b`)?.cards ?? []
          const hasSplit = gameState.blackjackSplits?.includes(myPlayerId) ?? false
          const isOnSplitHand = hasSplit && (gameState.blackjackMainHandDone?.includes(myPlayerId) ?? false)
          const mainTotal = bjHandValue(myMainCards)
          const splitTotal = bjHandValue(mySplitCards)
          const activeTotal = isOnSplitHand ? splitTotal : mainTotal
          const myMainBust = !hasSplit && me?.isFolded
          const myMainDoneNoFold = hasSplit && (gameState.blackjackMainHandDone?.includes(myPlayerId) ?? false)
          const canSplit = isMyTurn && !hasSplit && myMainCards.length === 2 && (() => {
            const [c1, c2] = myMainCards
            if (!c1 || !c2) return false
            const bv = (r: string) => ['J', 'Q', 'K'].includes(r) ? 10 : r === 'A' ? 11 : Number(r)
            return bv(c1.rank) === bv(c2.rank) && (gameState.blackjackChips?.[myPlayerId] ?? 0) > 0
          })()
          const totalColor = activeTotal > 21 ? '#fc8181' : activeTotal === 21 ? 'var(--accent)' : 'var(--text)'

          return (
            <div className={`px-4 pt-1.5 pb-1.5 flex flex-col ${hasSplit ? 'gap-1' : 'gap-2'}`}>
              {/* Chip + bet info */}
              {myPlayerId in (gameState.blackjackChips ?? {}) && (
                <div className="flex items-center gap-3 px-1">
                  {/* Chip stack (bank) */}
                  <div className="flex items-center gap-2">
                    <ChipStack count={gameState.blackjackChips[myPlayerId]} chipSize={hasSplit ? 18 : 26} />
                    <div className="flex flex-col leading-tight">
                      <span className={`${hasSplit ? 'text-sm' : 'text-xl'} font-black`} style={{ color: 'var(--text)' }}>
                        {gameState.blackjackChips[myPlayerId].toLocaleString()}
                      </span>
                      <span className="text-[9px] uppercase tracking-widest" style={{ color: 'var(--text-dim)' }}>chips</span>
                    </div>
                  </div>
                  <div style={{ flex: 1 }} />
                  {/* Active bets */}
                  <div className="flex items-center gap-3">
                    {hasSplit && (
                      <div className="flex flex-col items-center gap-0.5">
                        <div className="flex items-center gap-1">
                          <ChipSvg size={16} color="#d97706" />
                          <span className="text-sm font-bold" style={{ color: 'var(--accent)' }}>
                            {gameState.blackjackSplitBets?.[myPlayerId] ?? 0}
                          </span>
                        </div>
                        <span className="text-[8px] uppercase tracking-wide" style={{ color: 'var(--text-dim)' }}>split</span>
                      </div>
                    )}
                    <div className="flex flex-col items-center gap-0.5">
                      <div className="flex items-center gap-1">
                        <ChipSvg size={16} color="#d97706" />
                        <span className="text-sm font-bold" style={{ color: 'var(--accent)' }}>
                          {gameState.blackjackBets?.[myPlayerId] ?? 0}
                        </span>
                      </div>
                      <span className="text-[8px] uppercase tracking-wide" style={{ color: 'var(--text-dim)' }}>bet</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Hand total display — always visible during play */}
              {gameState.phase !== 'round-over' && !myMainBust && (
                <div className="flex items-center gap-2">
                  <div className={`flex-1 flex items-center justify-center gap-2 ${hasSplit ? 'py-1' : 'py-2'} rounded-xl`}
                    style={{ background: 'var(--surface-hi)', border: `1px solid ${!isOnSplitHand ? 'var(--accent)' : 'var(--border-hi)'}` }}>
                    <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-dim)' }}>
                      {hasSplit ? 'H1' : 'Total'}
                    </span>
                    <span className={`${hasSplit ? 'text-base' : 'text-xl'} font-black`}
                      style={{ color: mainTotal > 21 ? '#fc8181' : mainTotal === 21 ? 'var(--accent)' : 'var(--text)' }}>
                      {mainTotal}
                    </span>
                    {hasSplit && !isOnSplitHand && isMyTurn && (
                      <span className="text-[9px] font-bold" style={{ color: 'var(--accent)' }}>▶</span>
                    )}
                  </div>
                  {hasSplit && (
                    <div className={`flex-1 flex items-center justify-center gap-2 py-1 rounded-xl`}
                      style={{ background: 'var(--surface-hi)', border: `1px solid ${isOnSplitHand ? 'var(--accent)' : 'var(--border-hi)'}` }}>
                      <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-dim)' }}>H2</span>
                      <span className="text-base font-black"
                        style={{ color: splitTotal > 21 ? '#fc8181' : splitTotal === 21 ? 'var(--accent)' : 'var(--text)' }}>
                        {splitTotal}
                      </span>
                      {isOnSplitHand && isMyTurn && (
                        <span className="text-[9px] font-bold" style={{ color: 'var(--accent)' }}>▶</span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Status banners */}
              {gameState.phase === 'round-over' && gameState.blackjackResults?.[myPlayerId] ? (
                <div className="flex gap-2">
                  <div className="flex-1 py-2 rounded-xl text-center"
                    style={{ background: 'var(--surface-hi)', border: '1px solid var(--border-hi)' }}>
                    {hasSplit && <div className="text-[9px] uppercase tracking-wide mb-0.5" style={{ color: 'var(--text-dim)' }}>Hand 1</div>}
                    <span className="font-black text-sm tracking-widest"
                      style={{ color: BJ_RESULT_COLOR[gameState.blackjackResults[myPlayerId]] }}>
                      {BJ_RESULT_LABEL[gameState.blackjackResults[myPlayerId]]}
                    </span>
                  </div>
                  {hasSplit && gameState.blackjackSplitResults?.[myPlayerId] && (
                    <div className="flex-1 py-2 rounded-xl text-center"
                      style={{ background: 'var(--surface-hi)', border: '1px solid var(--border-hi)' }}>
                      <div className="text-[9px] uppercase tracking-wide mb-0.5" style={{ color: 'var(--text-dim)' }}>Hand 2</div>
                      <span className="font-black text-sm tracking-widest"
                        style={{ color: BJ_RESULT_COLOR[gameState.blackjackSplitResults[myPlayerId]] }}>
                        {BJ_RESULT_LABEL[gameState.blackjackSplitResults[myPlayerId]]}
                      </span>
                    </div>
                  )}
                </div>
              ) : myMainBust ? (
                <div className="w-full py-2 rounded-xl text-center"
                  style={{ background: 'rgba(229,62,62,0.12)', border: '1px solid rgba(229,62,62,0.25)' }}>
                  <span className="font-black text-sm tracking-widest" style={{ color: '#fc8181' }}>BUST</span>
                </div>
              ) : activeTotal === 21 && isMyTurn ? (
                <div className="fade-in w-full py-3 rounded-2xl flex items-center justify-center gap-2"
                  style={{
                    background: 'var(--accent)',
                    boxShadow: '0 0 24px rgba(245,158,11,0.45)',
                  }}>
                  <span style={{ fontSize: 18 }}>{!hasSplit && myMainCards.length === 2 ? '🃏' : '⭐'}</span>
                  <span className="font-black text-base tracking-widest" style={{ color: '#000' }}>
                    {!hasSplit && myMainCards.length === 2 ? 'BLACKJACK!' : '21!'}
                  </span>
                  <span style={{ fontSize: 18 }}>{!hasSplit && myMainCards.length === 2 ? '🃏' : '⭐'}</span>
                </div>
              ) : isMyTurn ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => send({ type: 'draw_card', toZoneId: `hand-${myPlayerId}` })}
                    className="flex-1 py-3 rounded-2xl font-bold text-sm transition-all active:scale-95"
                    style={{ background: 'var(--accent)', color: '#000' }}
                  >
                    Hit
                  </button>
                  <button
                    onClick={() => send({ type: 'pass_turn' })}
                    className="flex-1 py-3 rounded-2xl font-bold text-sm transition-all active:scale-95"
                    style={{ background: 'var(--surface-hi)', color: 'var(--text)', border: '1px solid var(--border-hi)' }}
                  >
                    Stand
                  </button>
                  {canSplit && (
                    <button
                      onClick={() => send({ type: 'blackjack_split' })}
                      className="flex-1 py-3 rounded-2xl font-bold text-sm transition-all active:scale-95"
                      style={{ background: 'var(--surface-mid)', color: 'var(--text-muted)', border: '1px solid var(--border-hi)' }}
                    >
                      Split
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          )
        })() : (
          <>
            {isMyTurn && gameState.turnOrder.length > 0 && gameType !== 'rummy' && gameType !== 'crazy-eights' && (
              <div className="px-4 pt-2 fade-in">
                <div className="w-full py-2 rounded-xl text-center"
                  style={{ background: 'var(--accent)', boxShadow: '0 0 16px rgba(245,158,11,0.25)' }}>
                  <span className="font-black text-sm tracking-widest" style={{ color: '#000' }}>YOUR TURN</span>
                </div>
              </div>
            )}
          </>
        )}

        {isInExchangePhase && exchangeBannerReady && (
          <div
            className="exchange-pulse mx-4 mb-1 py-2.5 px-4 rounded-xl flex items-center justify-center gap-2"
            style={{
              background: 'var(--accent)',
              border: '2px solid var(--accent-hi)',
            }}
          >
            <span style={{ fontSize: 18 }}>👇</span>
            <span style={{ color: '#000', fontWeight: 900, fontSize: 14, letterSpacing: '0.04em' }}>
              Select {presidentExchangeEntry?.cardsOwed ?? '?'} card{(presidentExchangeEntry?.cardsOwed ?? 1) !== 1 ? 's' : ''} to return
            </span>
          </div>
        )}

        <div
          className={isInExchangePhase && exchangeBannerReady ? 'exchange-pulse' : ''}
          style={isInExchangePhase && exchangeBannerReady ? {
            borderRadius: 16,
            border: '2.5px solid var(--accent)',
          } : {}}
        >
          {gameType === 'blackjack' && bjHasSplit ? (
            <div className="flex gap-1 px-2 pb-1">
              {myHandZones.map((zone, idx) => {
                const isActiveHand = idx === (bjIsOnSplitHand ? 1 : 0)
                return (
                  <div key={zone.id} className="flex-1 min-w-0 flex flex-col">
                    <div className="text-center text-[9px] uppercase tracking-wider font-semibold mb-0.5"
                      style={{ color: isActiveHand && isMyTurn ? 'var(--accent)' : 'var(--text-dim)' }}>
                      H{idx + 1}
                    </div>
                    <Hand
                      zone={zone}
                      onPlayCards={handlePlayCards}
                      targetZones={[]}
                      isMyTurn={false}
                      gameType={gameType ?? undefined}
                      bluffActiveRank={undefined}
                      playLabel={undefined}
                      highlightCardIds={[]}
                    />
                  </div>
                )
              })}
            </div>
          ) : (
            myHandZones.map(zone => (
              <Hand
                key={zone.id}
                zone={zone}
                onPlayCards={isInExchangePhase
                  ? (cardIds) => handleExchangeReturn(cardIds)
                  : isInDiscardPhase
                    ? (cardIds) => handleRunDiscard(cardIds)
                    : handlePlayCards}
                targetZones={gameType === 'rummy'
                  ? [
                      { id: 'discard', name: 'Discard', isBluffPile: false },
                      { id: 'go-out', name: 'Go Out', isBluffPile: false },
                    ]
                  : gameType === 'crazy-eights'
                    ? [{ id: 'discard', name: 'Play', isBluffPile: false }]
                    : playTargets}
                isMyTurn={handIsMyTurn}
                gameType={gameType ?? undefined}
                bluffActiveRank={gameState.bluffActiveRank}
                playLabel={isInExchangePhase
                  ? `Return`
                  : isInDiscardPhase
                    ? 'Discard'
                    : undefined}
                highlightCardIds={isInExchangePhase ? (presidentExchangeEntry?.receivedCardIds ?? []) : []}
                playableCardIds={c8sPlayableIds}
              />
            ))
          )}
        </div>

        {/* Extra actions */}
        <div className="flex gap-2 justify-center px-4 pt-1 pb-2">
          {gameType === 'president' && isInDiscardPhase && (
            <ActionPill onClick={() => handleRunDiscard([])}>Skip</ActionPill>
          )}
          {gameType === 'president' && !exchangePhaseActive && !discardPhaseActive && isMyTurn && !presidentHasPassed && !presidentHasFinished && (
            <ActionPill onClick={() => send({ type: 'pass_turn' })}>Pass</ActionPill>
          )}
        </div>
      </div>
        )
      })()}

      {showScores && (
        <ScoreBoard
          gameState={gameState}
          onClose={() => setShowScores(false)}
          isHost={isHost}
          onNextRound={() => send({ type: 'next_round' })}
          onEndGame={() => send({ type: 'end_game' })}
          onHome={onLeave}
        />
      )}

      {showTutorialFor === 'cambio' && (
        <CambioTutorialModal onClose={() => setShowTutorialFor(null)} />
      )}
      {showTutorialFor === 'bluff' && (
        <BluffTutorialModal onClose={() => setShowTutorialFor(null)} />
      )}
      {showTutorialFor === 'president' && (
        <PresidentTutorialModal onClose={() => setShowTutorialFor(null)} />
      )}
      {showTutorialFor === 'blackjack' && (
        <BlackjackTutorialModal onClose={() => setShowTutorialFor(null)} />
      )}
      {showTutorialFor === 'poker' && (
        <PokerTutorialModal onClose={() => setShowTutorialFor(null)} />
      )}
      {showTutorialFor === 'go-fish' && (
        <GoFishTutorialModal onClose={() => setShowTutorialFor(null)} />
      )}
      {showTutorialFor === 'rummy' && (
        <RummyTutorialModal onClose={() => setShowTutorialFor(null)} />
      )}
      {showTutorialFor === 'crazy-eights' && (
        <CrazyEightsTutorialModal onClose={() => setShowTutorialFor(null)} />
      )}

      {/* Crazy Eights suit picker — shown when player plays an 8 */}
      {c8sPendingCardId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          onClick={() => setC8sPendingCardId(null)}
        >
          <div
            className="w-full max-w-xs rounded-3xl p-6 flex flex-col gap-4"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="text-center">
              <p className="text-base font-black" style={{ color: 'var(--text)' }}>Declare a Suit</p>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                You played an 8 — choose the suit for the next player
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {SUIT_OPTS_C8.map(suit => (
                <button
                  key={suit}
                  onClick={() => {
                    send({ type: 'crazy8s_play', cardId: c8sPendingCardId, declaredSuit: suit })
                    setC8sPendingCardId(null)
                  }}
                  className="py-4 rounded-2xl font-bold text-base transition-all active:scale-95"
                  style={{
                    background: 'var(--surface-mid)',
                    color: SUIT_COLOR_C8[suit],
                    border: '1.5px solid var(--border-hi)',
                  }}
                >
                  {SUIT_LABEL_C8[suit]}
                </button>
              ))}
            </div>
            <button
              onClick={() => setC8sPendingCardId(null)}
              className="py-2 rounded-xl text-sm transition-all active:scale-95"
              style={{ background: 'var(--surface-mid)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {gameState.bluffReveal && (
        <BluffRevealModal
          reveal={gameState.bluffReveal}
          players={gameState.players}
          myPlayerId={myPlayerId}
          onResolve={() => send({ type: 'resolve_bluff' })}
        />
      )}

      {showDoubleDeckToast && (
        <div className="fixed top-4 left-0 right-0 z-50 flex justify-center px-4 pointer-events-none">
          <div
            className="fade-in flex items-center gap-3 px-4 py-3 rounded-2xl"
            style={{
              background: 'rgba(0,0,0,0.88)',
              border: '1.5px solid rgba(245,158,11,0.4)',
              boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
              backdropFilter: 'blur(8px)',
            }}
          >
            <span style={{ fontSize: 20 }}>🃏🃏</span>
            <div>
              <div className="text-sm font-bold" style={{ color: 'var(--accent)' }}>Two decks in play</div>
              <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>5+ players — duplicate cards are possible</div>
            </div>
          </div>
        </div>
      )}

      {pilePickupToast && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center"
          onClick={() => setPilePickupToast(null)}
        >
          <div
            className="fade-in flex flex-col items-center gap-2 px-6 py-5 rounded-3xl cursor-pointer"
            style={{
              background: 'rgba(0,0,0,0.85)',
              border: '1.5px solid rgba(239,68,68,0.5)',
              boxShadow: '0 0 40px rgba(239,68,68,0.25)',
              backdropFilter: 'blur(8px)',
              maxWidth: 280,
            }}
          >
            <span style={{ fontSize: 32 }}>🃏</span>
            <div className="text-center">
              <div className="font-black text-lg" style={{ color: pilePickupToast.isMe ? '#f87171' : 'var(--text)' }}>
                {pilePickupToast.playerName}
              </div>
              <div className="text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>
                sweeps up {pilePickupToast.cardCount} card{pilePickupToast.cardCount !== 1 ? 's' : ''} from the pile
              </div>
            </div>
            <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>tap to dismiss</span>
          </div>
        </div>
      )}

      {errorMsg && <Toast message={errorMsg} />}

      {rummyGoOutError && (
        <div
          className="card-slide"
          style={{
            position: 'fixed',
            top: errorMsg ? 100 : 60,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 601,
            background: 'rgba(180,83,9,0.95)',
            color: '#fff',
            padding: '10px 18px',
            borderRadius: 12,
            fontSize: 13,
            fontWeight: 700,
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
            maxWidth: 320,
            textAlign: 'center',
            pointerEvents: 'none',
            lineHeight: 1.4,
          }}
        >
          {rummyGoOutError}
        </div>
      )}

      {c8sError && (
        <div
          className="card-slide"
          style={{
            position: 'fixed',
            top: errorMsg ? 100 : 60,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 601,
            background: 'rgba(180,83,9,0.95)',
            color: '#fff',
            padding: '10px 18px',
            borderRadius: 12,
            fontSize: 13,
            fontWeight: 700,
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
            maxWidth: 320,
            textAlign: 'center',
            pointerEvents: 'none',
            lineHeight: 1.4,
          }}
        >
          {c8sError}
        </div>
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
  reveal, players, myPlayerId, onResolve,
}: {
  reveal: BluffReveal
  players: Player[]
  myPlayerId: string
  onResolve: () => void
}) {
  const submitter = players.find(p => p.id === reveal.submitterId)
  const caller = players.find(p => p.id === reveal.callerId)
  const recipient = players.find(p => p.id === reveal.recipientId)
  const iAmRecipient = reveal.recipientId === myPlayerId

  const resultColor = reveal.bluffSucceeded ? '#f87171' : '#4ade80'
  const resultBg = reveal.bluffSucceeded ? 'rgba(239,68,68,0.12)' : 'rgba(74,222,128,0.12)'
  const resultBorder = reveal.bluffSucceeded ? 'rgba(239,68,68,0.3)' : 'rgba(74,222,128,0.3)'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.88)' }}>
      <div className="flex flex-col items-center gap-4 px-5 py-6 rounded-3xl w-full max-w-sm"
        style={{ background: 'var(--surface)', border: '1px solid var(--border-hi)' }}>

        {/* Header */}
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>
            Bluff called!
          </p>
          <p className="text-sm" style={{ color: 'var(--text)' }}>
            <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{caller?.name ?? 'Someone'}</span>
            {' challenged '}
            <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{submitter?.name ?? 'Unknown'}</span>
            {"'s claim of "}
            <span style={{ fontWeight: 700, color: 'var(--text)' }}>
              "{reveal.claimCount} {rankName(reveal.claimRank, reveal.claimCount)}"
            </span>
          </p>
        </div>

        {/* Revealed cards */}
        <div className="flex gap-2 flex-wrap justify-center">
          {reveal.cards.map(card => (
            <Card key={card.id} card={card} size="md" animate="flip" />
          ))}
        </div>

        {/* Result verdict */}
        <div className="w-full rounded-2xl px-4 py-3 text-center"
          style={{ background: resultBg, border: `1px solid ${resultBorder}` }}>
          <p className="font-black text-base" style={{ color: resultColor }}>
            {reveal.bluffSucceeded ? '🚨 BLUFF!' : '✅ HONEST!'}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            {reveal.bluffSucceeded
              ? `${submitter?.name ?? 'Submitter'} lied — they pick up the pile`
              : `${submitter?.name ?? 'Submitter'} was honest — ${caller?.name ?? 'Caller'} picks up the pile`}
          </p>
          {iAmRecipient && (
            <p className="text-xs font-bold mt-1.5" style={{ color: resultColor }}>
              That's you — you pick up the pile!
            </p>
          )}
        </div>

        {/* Dismiss */}
        <button
          onClick={onResolve}
          className="w-full py-3 rounded-2xl font-bold text-sm transition-all active:scale-95"
          style={{ background: 'var(--surface-mid)', color: 'var(--text)', border: '1px solid var(--border-hi)' }}
        >
          Got it
        </button>
      </div>
    </div>
  )
}

/* ── Bluff helpers ───────────────────────────────────────────── */

function BluffHistoryLog({
  last, players, activeRank,
}: {
  last: GameState['bluffHistory'][number]
  players: GameState['players']
  activeRank: string | null
}) {
  const lastName = players.find(p => p.id === last.submitterId)?.name ?? '?'
  return (
    <div className="fade-in px-4 py-2 rounded-2xl"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>
        Last play {activeRank ? `· round rank: ${rankName(activeRank, 2)}` : ''} ·{' '}
      </span>
      <span className="text-xs font-semibold" style={{ color: 'var(--text)' }}>
        {lastName} played {last.claimCount} {rankName(last.claimRank, last.claimCount)}
      </span>
    </div>
  )
}

/* ── Small helper components ─────────────────────────────────── */

function TopBtn({ children, onClick, accent, disabled }: {
  children: React.ReactNode; onClick: () => void; accent?: boolean; disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="text-xs font-semibold px-3 py-1.5 rounded-full transition-all active:scale-95"
      style={{
        background: accent ? 'var(--accent-dim)' : 'var(--surface-mid)',
        color: accent ? 'var(--accent)' : disabled ? 'var(--text-dim)' : 'var(--text-muted)',
        border: '1px solid ' + (accent ? 'rgba(245,158,11,0.3)' : 'var(--border)'),
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'default' : 'pointer',
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


function cambioPowerLabel(rank: string, suit: string): string | null {
  if (rank === '7' || rank === '8') return 'Peek your own card'
  if (rank === '9' || rank === '10') return "Peek opponent's card"
  if (rank === 'J' || rank === 'Q') return 'Blind swap any two cards'
  if (rank === 'K' && (suit === 'spades' || suit === 'clubs')) return 'Peek any card + swap'
  return null
}

function zonePosLabel(zoneId: string): string {
  const parts = zoneId.split('-')
  const col = parseInt(parts.at(-1)!)
  const row = parseInt(parts[parts.length - 2])
  if (isNaN(row) || isNaN(col)) return 'card'
  const r = row === 0 ? 'top' : row === 1 ? 'bottom' : `row ${row + 1}`
  const c = col === 0 ? 'left' : 'right'
  return `${r}-${c}`
}

function buildSwapMessage(
  z1Id: string, z2Id: string,
  zones: Zone[], players: Player[], myPlayerId: string,
): string {
  const owner1 = zones.find(z => z.id === z1Id)?.ownerId
  const owner2 = zones.find(z => z.id === z2Id)?.ownerId
  const pos1 = zonePosLabel(z1Id)
  const pos2 = zonePosLabel(z2Id)
  const nameOf = (id: string | null | undefined, possessive = true) => {
    if (!id) return possessive ? "someone's" : 'someone'
    if (id === myPlayerId) return possessive ? 'your' : 'you'
    const n = players.find(p => p.id === id)?.name ?? 'someone'
    return possessive ? `${n}'s` : n
  }
  const mine1 = owner1 === myPlayerId
  const mine2 = owner2 === myPlayerId
  if (mine1 && mine2) return `Your ${pos1} ↔ your ${pos2}`
  if (mine1) return `Your ${pos1} ↔ ${nameOf(owner2)} ${pos2}`
  if (mine2) return `${nameOf(owner1)} ${pos1} ↔ your ${pos2}`
  return `${nameOf(owner1)} ${pos1} ↔ ${nameOf(owner2)} ${pos2}`
}

/* ── Cambio board ────────────────────────────────────── */

function CambioBoard({
  gameState, myPlayerId, peekResults, initialPeeks, clearInitialPeeks, send, isMyTurn, showScores,
}: {
  gameState: GameState
  myPlayerId: string
  peekResults: PeekResult[]
  initialPeeks: PeekResult[]
  clearInitialPeeks: () => void
  send: (event: ClientEvent) => void
  isMyTurn: boolean
  showScores: boolean
}) {
  const [blindSwapZone1, setBlindSwapZone1] = useState<string | null>(null)
  const [stickCandidateZone, setStickCandidateZone] = useState<string | null>(null)
  const [swappedZoneIds, setSwappedZoneIds] = useState<string[]>([])
  const [discardFlash, setDiscardFlash] = useState(false)
  const [stickFlip, setStickFlip] = useState(false)
  const [stickToast, setStickToast] = useState<{ success: boolean; playerName: string } | null>(null)
  const [penaltyFlashZoneId, setPenaltyFlashZoneId] = useState<string | null>(null)
  const [powerSwapToast, setPowerSwapToast] = useState<{ message: string } | null>(null)
  const [swapToast, setSwapToast] = useState<{ message: string } | null>(null)
  const [drawToast, setDrawToast] = useState<{ playerName: string; rank: string; suit: string; power: string | null } | null>(null)
  const gsRef = useRef(gameState)
  const scoresEverShownRef = useRef(false)
  // Initial peek overlay: 'idle' | 'prepare' | 'revealing'
  const [peekPhase, setPeekPhase] = useState<'idle' | 'prepare' | 'revealing'>('idle')
  const [countdown, setCountdown] = useState(3)
  // Mid-game peek countdown (7/8/9/10 power peeks)
  const [peekCountdown, setPeekCountdown] = useState(0)

  // Show the prepare screen as soon as initial peeks arrive
  useEffect(() => {
    if (initialPeeks.length > 0 && peekPhase === 'idle') {
      setPeekPhase('prepare')
    }
  }, [initialPeeks.length, peekPhase])

  // Countdown tick when revealing
  useEffect(() => {
    if (peekPhase !== 'revealing') return
    if (countdown <= 0) {
      clearInitialPeeks()
      setPeekPhase('idle')
      return
    }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [peekPhase, countdown, clearInitialPeeks])

  // Start/reset countdown whenever a mid-game peek result arrives
  useEffect(() => {
    if (peekResults.length > 0) {
      setPeekCountdown(3)
    } else {
      setPeekCountdown(0)
    }
  }, [peekResults])

  // Tick the mid-game peek countdown
  useEffect(() => {
    if (peekCountdown <= 0) return
    const t = setTimeout(() => setPeekCountdown(c => Math.max(0, c - 1)), 1000)
    return () => clearTimeout(t)
  }, [peekCountdown])

  // Latch once scores have been shown so the "Cards Revealed" banner never reappears
  useEffect(() => {
    if (showScores) scoresEverShownRef.current = true
  }, [showScores])

  // Clear stick candidate when it becomes your turn
  useEffect(() => {
    if (isMyTurn) setStickCandidateZone(null)
  }, [isMyTurn])

  // Keep game state ref fresh so lastAction effects can read it without re-triggering
  useEffect(() => { gsRef.current = gameState })

  // Flash animation when a card lands in a player zone (drawn-card swap) or discard
  useEffect(() => {
    const action = gameState.lastAction
    if (!action || action.type !== 'play') return
    if (action.toZoneId?.startsWith('pos-')) {
      const { players, zones } = gsRef.current
      const owner = zones.find(z => z.id === action.toZoneId)?.ownerId
      const pos = zonePosLabel(action.toZoneId)
      const isMe = owner === myPlayerId
      const name = isMe ? 'You' : (players.find(p => p.id === owner)?.name ?? 'Player')
      const msg = isMe ? `You swapped your ${pos} card` : `${name} swapped their ${pos} card`
      setSwappedZoneIds([action.toZoneId])
      setDiscardFlash(true)
      setSwapToast({ message: msg })
      const t1 = setTimeout(() => setSwappedZoneIds([]), 4000)
      const t2 = setTimeout(() => setDiscardFlash(false), 4000)
      const t3 = setTimeout(() => setSwapToast(null), 5000)
      return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
    }
    if (action.toZoneId === 'discard') {
      setDiscardFlash(true)
      const t = setTimeout(() => setDiscardFlash(false), 1200)
      return () => clearTimeout(t)
    }
  }, [gameState.lastAction, myPlayerId])

  // Power swap animation (J/Q blind-swap or Black K peek-swap) — both zones flash
  useEffect(() => {
    const action = gameState.lastAction
    if (!action || action.type !== 'move') return
    if (!action.fromZoneId?.startsWith('pos-') || !action.toZoneId?.startsWith('pos-')) return
    const { players, zones } = gsRef.current
    const msg = buildSwapMessage(action.fromZoneId, action.toZoneId, zones, players, myPlayerId)
    setSwappedZoneIds([action.fromZoneId, action.toZoneId])
    setPowerSwapToast({ message: msg })
    const t1 = setTimeout(() => setSwappedZoneIds([]), 4000)
    const t2 = setTimeout(() => setPowerSwapToast(null), 5000)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [gameState.lastAction, myPlayerId])

  // Draw toast: show who drew what card and its power (Cambio draws have no toZoneId)
  useEffect(() => {
    const action = gameState.lastAction
    if (!action || action.type !== 'draw' || action.toZoneId) return
    const drawn = gameState.cambioDrawn
    if (!drawn) return
    const playerName = gsRef.current.players.find(p => p.id === action.playerId)?.name ?? 'Player'
    const power = cambioPowerLabel(drawn.card.rank, drawn.card.suit)
    setDrawToast({ playerName, rank: drawn.card.rank, suit: drawn.card.suit, power })
    const t = setTimeout(() => setDrawToast(null), 3500)
    return () => clearTimeout(t)
  }, [gameState.lastAction]) // eslint-disable-line react-hooks/exhaustive-deps

  // Stick result animations — visible to all players
  useEffect(() => {
    const action = gameState.lastAction
    if (!action) return
    const playerName = gsRef.current.players.find(p => p.id === action.playerId)?.name ?? 'Player'
    if (action.type === 'stick_success') {
      setStickToast({ success: true, playerName })
      setDiscardFlash(true)
      setStickFlip(true)
      const t1 = setTimeout(() => setStickToast(null), 2000)
      const t2 = setTimeout(() => setDiscardFlash(false), 1200)
      const t3 = setTimeout(() => setStickFlip(false), 1200)
      return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
    }
    if (action.type === 'stick_fail') {
      setStickToast({ success: false, playerName })
      if (action.toZoneId) setPenaltyFlashZoneId(action.toZoneId)
      const t1 = setTimeout(() => setStickToast(null), 2000)
      const t2 = setTimeout(() => setPenaltyFlashZoneId(null), 1200)
      return () => { clearTimeout(t1); clearTimeout(t2) }
    }
  }, [gameState.lastAction])

  const handleReady = () => {
    setCountdown(3)
    setPeekPhase('revealing')
  }

  const handleDismissEarly = () => {
    clearInitialPeeks()
    setPeekPhase('idle')
  }

  const { cambioDrawn, cambioPower, cambioCaller } = gameState

  const sortZones = (zones: Zone[]) =>
    [...zones].sort((a, b) => {
      if (!a.gridPosition || !b.gridPosition) return 0
      return a.gridPosition.row - b.gridPosition.row || a.gridPosition.col - b.gridPosition.col
    })

  const myZones = sortZones(gameState.zones.filter(z => z.ownerId === myPlayerId && z.id.startsWith('pos-')))
  const otherPlayers = gameState.players.filter(p => p.id !== myPlayerId)
  const discardZone = gameState.zones.find(z => z.id === 'discard')
  const topDiscard = discardZone?.cards.at(-1) ?? null

  const getPeek = (zoneId: string) => peekResults.find(pr => pr.zoneId === zoneId) ?? null

  const canActOnDeck = isMyTurn && !cambioDrawn && !cambioPower
  const canDiscardDrawn = !!cambioDrawn
  const drawnHasPower = !!cambioDrawn && ['7', '8', '9', '10', 'J', 'Q', 'K'].includes(cambioDrawn.card.rank)

  const handleAnyZoneTap = (zone: Zone, isMine: boolean) => {
    if (!zone.cards[0]) return

    // Sticking: available for non-turn players always; for turn player before drawing/using a power
    if (isMine && topDiscard && (!isMyTurn || (!cambioDrawn && !cambioPower))) {
      if (stickCandidateZone === zone.id) {
        // Second tap = confirm stick
        send({ type: 'cambio_stick', zoneId: zone.id })
        setStickCandidateZone(null)
      } else {
        // First tap = mark as candidate (green glow)
        setStickCandidateZone(zone.id)
      }
      return
    }

    if (!isMyTurn) return

    if (isMine && cambioDrawn) {
      send({ type: 'cambio_swap', targetZoneId: zone.id })
      return
    }
    if (isMine && cambioPower === 'peek-own') {
      send({ type: 'cambio_power_peek', cardId: zone.cards[0].id, zoneId: zone.id })
      return
    }
    if (!isMine && cambioPower === 'peek-opponent') {
      send({ type: 'cambio_power_peek', cardId: zone.cards[0].id, zoneId: zone.id })
      return
    }
    if (cambioPower === 'peek-swap') {
      send({ type: 'cambio_power_peek', cardId: zone.cards[0].id, zoneId: zone.id })
      return
    }
    if (isMine && cambioPower === 'peek-swap-ready') {
      send({ type: 'cambio_power_swap', zoneId1: zone.id })
      return
    }
    if (cambioPower === 'blind-swap') {
      if (!blindSwapZone1) {
        setBlindSwapZone1(zone.id)
      } else if (zone.id !== blindSwapZone1) {
        send({ type: 'cambio_power_swap', zoneId1: blindSwapZone1, zoneId2: zone.id })
        setBlindSwapZone1(null)
      }
    }
  }

  const myZoneTappable = isMyTurn && (
    !!cambioDrawn ||
    cambioPower === 'peek-own' ||
    cambioPower === 'blind-swap' ||
    cambioPower === 'peek-swap-ready' ||
    cambioPower === 'peek-swap'
  )

  const opponentZoneTappable = isMyTurn && (
    cambioPower === 'peek-opponent' ||
    cambioPower === 'peek-swap' ||
    cambioPower === 'blind-swap'
  )

  // Sticking is allowed anytime: non-turn players always; turn player only before drawing/using a power
  const canTapForStick = !!topDiscard && (!isMyTurn || (!cambioDrawn && !cambioPower))

  const instruction = (() => {
    if (!isMyTurn) {
      if (stickCandidateZone) return 'Tap the same card again to confirm your stick!'
      if (topDiscard) return 'Tap one of your cards twice to attempt a stick.'
      return null
    }
    if (cambioDrawn) {
      if (drawnHasPower) return 'Tap one of your cards to swap, or discard to use the power.'
      return 'Tap one of your cards to swap, or discard it.'
    }
    switch (cambioPower) {
      case 'peek-own': return 'Tap one of your cards to peek.'
      case 'peek-opponent': return "Tap an opponent's card to peek."
      case 'blind-swap': return blindSwapZone1 ? 'Now tap any card to complete the swap.' : 'Tap any card, then tap another to swap them.'
      case 'peek-swap': return 'Tap any card to peek (Black King power).'
      case 'peek-swap-ready': return 'Tap one of your cards to swap with the peeked card, or skip.'
      default: return topDiscard ? (stickCandidateZone ? 'Tap the same card again to confirm your stick!' : 'Tap a card twice to stick, or draw from the deck.') : null
    }
  })()

  const isRoundOver = gameState.phase === 'round-over'

  const renderGrid = (zones: Zone[], isMine: boolean, tappable: boolean, size: 'sm' | 'md', flip = false) => {
    const dim = size === 'sm' ? { w: 40, h: 58 } : { w: 58, h: 86 }
    const maxRow = zones.reduce((max, z) => Math.max(max, z.gridPosition?.row ?? 0), 1)
    const stickTappable = isMine && canTapForStick
    // Opponents sit across the table — rotate 180° so their bottom-right maps to our top-left
    const rowOrder = flip
      ? Array.from({ length: maxRow + 1 }, (_, i) => maxRow - i)
      : Array.from({ length: maxRow + 1 }, (_, i) => i)
    const colOrder = flip ? [1, 0] : [0, 1]
    return (
      <div className="flex flex-col gap-1.5">
        {rowOrder.map(row => (
          <div key={row} className="flex gap-1.5">
            {colOrder.map(col => {
              const zone = zones.find(z => z.gridPosition?.row === row && z.gridPosition?.col === col)
              const card = zone?.cards[0]
              const pr = zone ? getPeek(zone.id) : null
              const isSelected = zone?.id === blindSwapZone1
              const isCandidate = zone?.id === stickCandidateZone
              const isSwapped = !!zone && swappedZoneIds.includes(zone.id)
              const isPenalty = zone?.id === penaltyFlashZoneId
              const clickable = (tappable || stickTappable) && !!zone && !!card
              return (
                <div
                  key={`${row}-${col}`}
                  onClick={() => clickable && handleAnyZoneTap(zone!, isMine)}
                  style={{
                    position: 'relative',
                    cursor: clickable ? 'pointer' : 'default',
                    outline: isSelected
                      ? '2px solid var(--accent)'
                      : isCandidate
                        ? '2px solid #4ade80'
                        : isSwapped
                          ? '2px solid rgba(74,222,128,0.6)'
                          : isPenalty
                            ? '2px solid rgba(248,113,113,0.9)'
                            : undefined,
                    outlineOffset: (isSelected || isCandidate || isSwapped || isPenalty) ? '2px' : undefined,
                    boxShadow: isPenalty ? '0 0 14px rgba(248,113,113,0.45)' : undefined,
                    borderRadius: 'var(--radius-card)',
                    opacity: clickable ? 1 : 0.85,
                    transition: 'outline 0.15s ease, box-shadow 0.15s ease',
                  }}
                >
                  {card ? (
                    <>
                      <Card
                        card={pr ? { id: pr.cardId, rank: pr.rank as any, suit: pr.suit as any } : card}
                        faceDown={!pr && zone?.visibility !== 'face-up'}
                        size={size}
                        animate={pr ? 'flip' : isRoundOver && zone?.visibility === 'face-up' ? 'flip' : isSwapped ? 'deal-slow' : undefined}
                      />
                      {pr && peekCountdown > 0 && (
                        <div style={{
                          position: 'absolute',
                          top: -8,
                          right: -8,
                          width: 22,
                          height: 22,
                          borderRadius: '50%',
                          background: 'var(--accent)',
                          color: '#000',
                          fontSize: 11,
                          fontWeight: 900,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          zIndex: 10,
                          boxShadow: '0 0 10px rgba(245,158,11,0.6)',
                          pointerEvents: 'none',
                        }}>
                          {peekCountdown}
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ width: dim.w, height: dim.h, borderRadius: 'var(--radius-card)', border: '1.5px dashed rgba(255,255,255,0.1)' }} />
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 w-full items-center">

      {/* Cambio called banner */}
      {cambioCaller && (
        <div className="w-full px-3 py-2 rounded-xl text-center text-xs font-semibold"
          style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--accent)', border: '1px solid rgba(245,158,11,0.3)' }}>
          {gameState.players.find(p => p.id === cambioCaller)?.name ?? 'Someone'} called Cambio — one more turn each!
        </div>
      )}

      {/* Instruction */}
      {instruction && (
        <p className="text-xs text-center font-medium" style={{ color: stickCandidateZone ? '#4ade80' : 'var(--text-muted)' }}>{instruction}</p>
      )}

      {/* Other players' grids */}
      {otherPlayers.length > 0 && (
        <div className="flex gap-5 justify-center flex-wrap">
          {otherPlayers.map(player => {
            const pZones = sortZones(gameState.zones.filter(z => z.ownerId === player.id && z.id.startsWith('pos-')))
            const isActive = gameState.currentTurnPlayerId === player.id
            return (
              <div key={player.id} className="flex flex-col items-center gap-1">
                <span className="text-[10px] font-semibold truncate max-w-[80px]"
                  style={{ color: isActive ? 'var(--accent)' : 'var(--text-muted)' }}>
                  {player.name}{isActive ? ' ▶' : ''}
                </span>
                {renderGrid(pZones, false, opponentZoneTappable, 'sm', true)}
              </div>
            )
          })}
        </div>
      )}

      {/* Deck · Discard · Drawn card */}
      <div className="flex gap-4 items-end justify-center">

        {/* Draw pile */}
        {gameState.drawPileCount > 0 && (
          <div className="flex flex-col items-center gap-1">
            <div
              onClick={() => canActOnDeck && send({ type: 'draw_card', toZoneId: `hand-${myPlayerId}` })}
              className="relative"
              style={{ width: 58, height: 86, cursor: canActOnDeck ? 'pointer' : 'default' }}
            >
              <div style={{ position: 'absolute', top: -2, left: -2, width: 58, height: 86, borderRadius: 'var(--radius-card)', background: 'linear-gradient(145deg,#1a2d54,#1e3560)', border: '1px solid rgba(255,255,255,0.06)' }} />
              <div style={{ position: 'absolute', top: -1, left: -1, width: 58, height: 86, borderRadius: 'var(--radius-card)', background: 'linear-gradient(145deg,#1e3560,#243f72)', border: '1px solid rgba(255,255,255,0.08)' }} />
              <div style={{ position: 'absolute', top: 0, left: 0, width: 58, height: 86, borderRadius: 'var(--radius-card)', background: 'linear-gradient(145deg,#243f72,#1e3560)', border: '1px solid rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: 700 }}>{gameState.drawPileCount}</span>
              </div>
            </div>
            {canActOnDeck && (
              <button
                onClick={() => send({ type: 'draw_card', toZoneId: `hand-${myPlayerId}` })}
                className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: 'var(--accent)', color: '#000' }}
              >
                Draw
              </button>
            )}
            <span className="text-[9px] uppercase tracking-widest" style={{ color: 'var(--text-dim)' }}>deck</span>
          </div>
        )}

        {/* Discard pile — view only, no take */}
        {discardZone && (
          <div className="flex flex-col items-center gap-1">
            <div style={{
              position: 'relative',
              borderRadius: 'var(--radius-card)',
              outline: discardFlash ? '2px solid rgba(74,222,128,0.8)' : undefined,
              outlineOffset: discardFlash ? '2px' : undefined,
              boxShadow: discardFlash ? '0 0 14px rgba(74,222,128,0.4)' : undefined,
              transition: 'box-shadow 0.15s ease, outline 0.15s ease',
            }}>
              {topDiscard ? (
                <Card card={topDiscard} size="md" animate={stickFlip ? 'flip' : discardFlash ? 'deal' : undefined} />
              ) : (
                <div style={{ width: 58, height: 86, borderRadius: 'var(--radius-card)', border: '1.5px dashed rgba(255,255,255,0.1)' }} />
              )}
            </div>
            <span className="text-[9px] uppercase tracking-widest" style={{ color: 'var(--text-dim)' }}>discard</span>
          </div>
        )}

        {/* Drawn card — visible to all players so anyone can consider sticking */}
        {cambioDrawn && (
          <div className="flex flex-col items-center gap-1">
            <Card card={cambioDrawn.card} size="md" animate="deal" />
            {isMyTurn && (
              <div className="flex flex-col gap-0.5 items-center">
                {/* Discard without using power — always available */}
                <button
                  onClick={() => send({ type: 'cambio_discard_drawn', usePower: false })}
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(229,62,62,0.14)', color: '#fc8181', border: '1px solid rgba(229,62,62,0.3)' }}
                >
                  Discard
                </button>
                {/* Use power — only shown for action cards (7+) */}
                {drawnHasPower && (
                  <button
                    onClick={() => send({ type: 'cambio_discard_drawn', usePower: true })}
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(245,158,11,0.14)', color: 'var(--accent)', border: '1px solid rgba(245,158,11,0.3)' }}
                  >
                    Use Power
                  </button>
                )}
              </div>
            )}
            <span className="text-[9px] uppercase tracking-widest" style={{ color: 'var(--text-dim)' }}>drawn</span>
          </div>
        )}
      </div>

      {/* My 2×2 grid — spacer pushes cards above the fixed score sheet when it's open */}
      <div className="flex flex-col items-center gap-2" style={{ paddingBottom: showScores ? 300 : 0, transition: 'padding-bottom 0.2s ease' }}>
        <span className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--text-dim)' }}>Your Cards</span>
        {renderGrid(myZones, true, myZoneTappable, 'md')}
      </div>

      {/* Call Cambio */}
      {isMyTurn && !cambioCaller && !cambioDrawn && !cambioPower && (
        <button
          onClick={() => send({ type: 'cambio_call' })}
          className="text-sm font-bold px-6 py-2 rounded-2xl transition-all active:scale-95"
          style={{ background: 'var(--accent)', color: '#000' }}
        >
          Call Cambio
        </button>
      )}

      {/* Skip swap (peek-swap-ready) */}
      {isMyTurn && cambioPower === 'peek-swap-ready' && (
        <button
          onClick={() => send({ type: 'cambio_power_skip' })}
          className="text-xs font-semibold px-4 py-1.5 rounded-full"
          style={{ background: 'var(--surface-mid)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
        >
          Skip swap
        </button>
      )}

      {/* ── Draw toast: who drew what + power ── */}
      {drawToast && !stickToast && !powerSwapToast && (
        <div
          className="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-0.5 px-5 py-3 rounded-2xl shadow-xl cursor-pointer"
          style={{
            background: 'rgba(30,30,40,0.92)',
            border: '1.5px solid rgba(255,255,255,0.1)',
            backdropFilter: 'blur(8px)',
            animation: 'fadeIn 0.2s ease-out both',
            minWidth: 180,
          }}
          onClick={() => setDrawToast(null)}
        >
          <div className="flex items-center gap-2 w-full justify-between">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm" style={{ color: 'var(--text)' }}>
                {drawToast.playerName}
              </span>
              <span className="font-black text-base" style={{
                color: (drawToast.suit === 'hearts' || drawToast.suit === 'diamonds') ? '#f87171' : 'var(--text)',
              }}>
                {drawToast.rank === 'JKR' ? 'Joker' : drawToast.rank}{SUIT_SYMBOL[drawToast.suit]}
              </span>
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 8 }}>✕</span>
          </div>
          {drawToast.power ? (
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--accent)' }}>
              {drawToast.power}
            </span>
          ) : (
            <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>No power</span>
          )}
        </div>
      )}

      {/* ── Stick result toast ── */}
      {stickToast && (
        <div
          className="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-sm shadow-xl cursor-pointer"
          style={{
            background: stickToast.success ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
            border: `1.5px solid ${stickToast.success ? 'rgba(34,197,94,0.6)' : 'rgba(239,68,68,0.6)'}`,
            color: stickToast.success ? '#4ade80' : '#f87171',
            backdropFilter: 'blur(8px)',
            animation: 'fadeIn 0.2s ease-out both',
          }}
          onClick={() => setStickToast(null)}
        >
          <span style={{ fontSize: 18 }}>{stickToast.success ? '✓' : '✗'}</span>
          <span>
            {stickToast.playerName} — {stickToast.success ? 'Stick!' : 'Wrong! +1 card'}
          </span>
          <span style={{ fontSize: 11, color: 'currentColor', opacity: 0.5, marginLeft: 4 }}>✕</span>
        </div>
      )}

      {/* ── Drawn-card swap toast ── */}
      {swapToast && !stickToast && !powerSwapToast && (
        <div
          className="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-sm shadow-xl cursor-pointer"
          style={{
            background: 'rgba(74,222,128,0.1)',
            border: '1.5px solid rgba(74,222,128,0.5)',
            color: '#4ade80',
            backdropFilter: 'blur(8px)',
            animation: 'fadeIn 0.2s ease-out both',
          }}
          onClick={() => setSwapToast(null)}
        >
          <span style={{ fontSize: 18 }}>⇄</span>
          <span>{swapToast.message}</span>
          <span style={{ fontSize: 11, color: 'currentColor', opacity: 0.5, marginLeft: 4 }}>✕</span>
        </div>
      )}

      {/* ── Power swap toast (J/Q/Black K) — personalized per player ── */}
      {powerSwapToast && !stickToast && (
        <div
          className="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-sm shadow-xl cursor-pointer"
          style={{
            background: 'rgba(139,92,246,0.15)',
            border: '1.5px solid rgba(139,92,246,0.6)',
            color: '#c4b5fd',
            backdropFilter: 'blur(8px)',
            animation: 'fadeIn 0.2s ease-out both',
          }}
          onClick={() => setPowerSwapToast(null)}
        >
          <span style={{ fontSize: 18 }}>⇄</span>
          <span>{powerSwapToast.message}</span>
          <span style={{ fontSize: 11, color: 'currentColor', opacity: 0.5, marginLeft: 4 }}>✕</span>
        </div>
      )}

      {/* ── Round-over card reveal banner ── */}
      {isRoundOver && !showScores && !scoresEverShownRef.current && peekPhase === 'idle' && (
        <div
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 flex flex-col items-center gap-2 px-8 py-5 rounded-3xl shadow-2xl"
          style={{
            background: 'rgba(15,15,20,0.92)',
            border: '1.5px solid rgba(245,158,11,0.4)',
            backdropFilter: 'blur(12px)',
            animation: 'fadeIn 0.3s ease-out both',
          }}
        >
          <span style={{ fontSize: 28 }}>🃏</span>
          <span className="font-black text-lg" style={{ color: 'var(--accent)' }}>Cards Revealed!</span>
          <span className="text-xs" style={{ color: 'var(--text-dim)' }}>Scores coming up…</span>
        </div>
      )}

      {/* ── Initial card peek overlay ── */}
      {peekPhase === 'prepare' && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-end pb-safe"
          style={{ background: 'rgba(0,0,0,0.94)' }}>
          <div className="flex flex-col items-center gap-5 px-6 pb-12 pt-8 w-full max-w-sm">
            <div className="w-14 h-14 rounded-full flex items-center justify-center text-2xl"
              style={{ background: 'var(--accent-dim)', border: '1px solid rgba(245,158,11,0.3)' }}>
              🃏
            </div>
            <div className="text-center flex flex-col gap-2">
              <h2 className="font-black text-xl" style={{ color: 'var(--text)' }}>
                Memorize your cards!
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                You'll see your 2 bottom cards for{' '}
                <span className="font-bold" style={{ color: 'var(--accent)' }}>3 seconds</span>.
              </p>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                After that, they're hidden forever — this is your only chance!
              </p>
            </div>
            <button
              onClick={handleReady}
              className="w-full py-4 rounded-2xl font-bold text-base transition-all active:scale-95 mt-2"
              style={{ background: 'var(--accent)', color: '#000' }}
            >
              Show me my cards
            </button>
          </div>
        </div>
      )}

      {peekPhase === 'revealing' && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 px-6"
          style={{ background: 'rgba(0,0,0,0.96)' }}
          onClick={handleDismissEarly}
        >
          <p className="text-[10px] uppercase tracking-[0.2em] font-semibold"
            style={{ color: 'var(--text-dim)' }}>
            Your bottom 2 cards
          </p>
          <div className="flex gap-5">
            {initialPeeks.map(peek => (
              <Card
                key={peek.zoneId}
                card={{ id: peek.cardId, rank: peek.rank as any, suit: peek.suit as any }}
                size="lg"
                animate="flip"
              />
            ))}
          </div>
          {/* Countdown circle */}
          <div className="flex flex-col items-center gap-3">
            <div className="w-20 h-20 rounded-full flex items-center justify-center"
              style={{
                border: '3px solid var(--accent)',
                background: 'var(--surface)',
                boxShadow: '0 0 24px rgba(245,158,11,0.25)',
              }}>
              <span className="font-black text-4xl" style={{ color: 'var(--accent)' }}>
                {countdown}
              </span>
            </div>
            <p className="text-[11px]" style={{ color: 'var(--text-dim)' }}>
              Tap anywhere to dismiss early
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
