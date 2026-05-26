'use client'

import { useState } from 'react'
import type { GameState, ClientEvent, Suit } from '@playing-cards/shared'
import { Card } from './Card'

const SUIT_SYMBOL: Record<Suit, string> = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' }
const SUIT_LABEL:  Record<Suit, string> = { spades: 'Spades', hearts: 'Hearts', diamonds: 'Diamonds', clubs: 'Clubs' }
const SUIT_COLOR:  Record<Suit, string> = { spades: '#e2e8f0', clubs: '#e2e8f0', hearts: '#f87171', diamonds: '#f87171' }
const ALL_SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs']

interface Props {
  gameState: GameState
  myPlayerId: string
  send: (e: ClientEvent) => void
}

export function EuchreBoard({ gameState, myPlayerId, send }: Props) {
  const [goAlone, setGoAlone] = useState(false)
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)

  const {
    euchrePhase, euchreTopCard, euchreDealerPlayerId, euchreMakerPlayerId,
    euchreGoingAlone, euchreBidPassCount, euchreCurrentTrickLedSuit,
    trumpSuit, players, zones, teams, currentTurnPlayerId, turnOrder,
  } = gameState

  const isMyTurn   = currentTurnPlayerId === myPlayerId
  const isDealer   = euchreDealerPlayerId === myPlayerId
  const myPlayer   = players.find(p => p.id === myPlayerId)
  const myHandZone = zones.find(z => z.id === `hand-${myPlayerId}`)
  const myHand     = myHandZone?.cards ?? []
  const partner    = players.find(p => p.teamId === myPlayer?.teamId && p.id !== myPlayerId)
  const makerTeam  = teams.find(t => t.id === players.find(p => p.id === euchreMakerPlayerId)?.teamId)
  const iAmMaker   = euchreMakerPlayerId === myPlayerId
  const sitting    = euchreGoingAlone && partner && !iAmMaker && euchreMakerPlayerId
    ? partner.id === myPlayerId || (players.find(p => p.id === euchreMakerPlayerId)?.teamId === myPlayer?.teamId && !iAmMaker)
    : false

  // Other players for the top strip (everyone except me)
  const others = players.filter(p => p.id !== myPlayerId)

  function currentPlayer() {
    return players.find(p => p.id === currentTurnPlayerId)
  }

  // Spectator view — show the full game state but no interactive elements
  if (!myPlayer) {
    // bidding1
    if (euchrePhase === 'bidding1') {
      return (
        <div className="flex flex-col h-full overflow-y-auto">
          <OtherPlayersStrip players={others} zones={zones} currentTurnPlayerId={currentTurnPlayerId} dealerPlayerId={euchreDealerPlayerId} teams={teams} myPlayerId={myPlayerId} />
          <div className="flex flex-col items-center gap-5 px-6 py-4">
            {euchreTopCard && (
              <div className="flex flex-col items-center gap-2">
                <p className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--text-dim)' }}>Top Card</p>
                <Card card={euchreTopCard} size="lg" />
                <p className="text-sm font-bold" style={{ color: SUIT_COLOR[euchreTopCard.suit] }}>{SUIT_SYMBOL[euchreTopCard.suit]} {SUIT_LABEL[euchreTopCard.suit]}</p>
              </div>
            )}
            <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
              Waiting for <span style={{ color: 'var(--text)' }}>{currentPlayer()?.name ?? '…'}</span> to bid…
            </p>
            <BidProgress passCount={euchreBidPassCount} total={4} />
          </div>
          <TeamScoreBar teams={teams} />
        </div>
      )
    }
    // bidding2
    if (euchrePhase === 'bidding2') {
      return (
        <div className="flex flex-col h-full overflow-y-auto">
          <OtherPlayersStrip players={others} zones={zones} currentTurnPlayerId={currentTurnPlayerId} dealerPlayerId={euchreDealerPlayerId} teams={teams} myPlayerId={myPlayerId} />
          <div className="flex flex-col items-center gap-5 px-6 py-4">
            {euchreTopCard && (
              <div className="flex flex-col items-center gap-2">
                <p className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--text-dim)' }}>Turned Down</p>
                <Card card={euchreTopCard} size="md" faceDown={false} style={{ opacity: 0.4 }} />
              </div>
            )}
            <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
              Waiting for <span style={{ color: 'var(--text)' }}>{currentPlayer()?.name ?? '…'}</span> to call trump…
            </p>
          </div>
          <TeamScoreBar teams={teams} />
        </div>
      )
    }
    // discard
    if (euchrePhase === 'discard') {
      return (
        <div className="flex flex-col h-full overflow-y-auto">
          <OtherPlayersStrip players={others} zones={zones} currentTurnPlayerId={currentTurnPlayerId} dealerPlayerId={euchreDealerPlayerId} teams={teams} myPlayerId={myPlayerId} />
          <div className="flex-1 flex items-center justify-center px-4">
            <div className="w-full rounded-2xl px-4 py-3 text-center"
              style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
              <p className="text-xs font-bold uppercase tracking-wide mb-0.5" style={{ color: 'var(--accent)' }}>
                {trumpSuit ? `${SUIT_SYMBOL[trumpSuit]} ${SUIT_LABEL[trumpSuit]} is trump` : ''}
              </p>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Waiting for {players.find(p => p.id === euchreDealerPlayerId)?.name} to discard…
              </p>
            </div>
          </div>
          <TeamScoreBar teams={teams} />
        </div>
      )
    }
    // playing
    return (
      <div className="flex flex-col h-full overflow-y-auto">
        <OtherPlayersStrip players={others} zones={zones} currentTurnPlayerId={currentTurnPlayerId} dealerPlayerId={euchreDealerPlayerId} teams={teams} myPlayerId={myPlayerId} />
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-2">
            {trumpSuit && (
              <span className="text-xs font-bold px-2 py-1 rounded-full"
                style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid rgba(245,158,11,0.3)' }}>
                {SUIT_SYMBOL[trumpSuit]} {SUIT_LABEL[trumpSuit]}
              </span>
            )}
            {euchreGoingAlone && (
              <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.3)' }}>
                Going Alone
              </span>
            )}
          </div>
          <TrickTally teams={teams} players={players} />
        </div>
        <TrickTable players={players} zones={zones} myPlayerId={myPlayerId} />
        {euchreCurrentTrickLedSuit && (
          <p className="text-center text-[11px] py-1" style={{ color: 'var(--text-dim)' }}>
            Led: {SUIT_SYMBOL[euchreCurrentTrickLedSuit]} {SUIT_LABEL[euchreCurrentTrickLedSuit]}
          </p>
        )}
        <TeamScoreBar teams={teams} />
      </div>
    )
  }

  // ── BIDDING ROUND 1 ────────────────────────────────────────────────────
  if (euchrePhase === 'bidding1') {
    return (
      <div className="flex flex-col h-full overflow-y-auto">
        <OtherPlayersStrip players={others} zones={zones} currentTurnPlayerId={currentTurnPlayerId} dealerPlayerId={euchreDealerPlayerId} teams={teams} myPlayerId={myPlayerId} />

        <div className="flex flex-col items-center gap-5 px-6 py-4">
          {/* Flipped card */}
          {euchreTopCard && (
            <div className="flex flex-col items-center gap-2">
              <p className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--text-dim)' }}>Top Card</p>
              <Card card={euchreTopCard} size="lg" />
              <p className="text-sm font-bold" style={{ color: SUIT_COLOR[euchreTopCard.suit] }}>
                {SUIT_SYMBOL[euchreTopCard.suit]} {SUIT_LABEL[euchreTopCard.suit]}
              </p>
            </div>
          )}

          {/* Bid action */}
          {isMyTurn ? (
            <div className="w-full flex flex-col gap-3">
              <p className="text-sm text-center font-semibold" style={{ color: 'var(--text-muted)' }}>
                Order it up to make {euchreTopCard ? SUIT_LABEL[euchreTopCard.suit] : ''} trump?
              </p>
              <GoAloneToggle value={goAlone} onChange={setGoAlone} />
              <div className="flex gap-3">
                <button
                  onClick={() => { send({ type: 'euchre_order_up', goAlone }); setGoAlone(false) }}
                  className="flex-1 py-3 rounded-2xl font-bold text-sm transition-all active:scale-95"
                  style={{ background: 'var(--accent)', color: '#000' }}
                >
                  Order Up {isDealer ? '(Pick up)' : ''}
                </button>
                <button
                  onClick={() => send({ type: 'euchre_pass' })}
                  className="flex-1 py-3 rounded-2xl font-bold text-sm transition-all active:scale-95"
                  style={{ background: 'var(--surface-mid)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                >
                  Pass
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
              Waiting for <span style={{ color: 'var(--text)' }}>{currentPlayer()?.name ?? '…'}</span>…
            </p>
          )}

          <BidProgress passCount={euchreBidPassCount} total={4} />
        </div>

        <BiddingHand cards={myHand} />
        <TeamScoreBar teams={teams} />
      </div>
    )
  }

  // ── BIDDING ROUND 2 ────────────────────────────────────────────────────
  if (euchrePhase === 'bidding2') {
    const turnedDownSuit = euchreTopCard?.suit
    const dealerMustCall = currentTurnPlayerId === euchreDealerPlayerId
    return (
      <div className="flex flex-col h-full overflow-y-auto">
        <OtherPlayersStrip players={others} zones={zones} currentTurnPlayerId={currentTurnPlayerId} dealerPlayerId={euchreDealerPlayerId} teams={teams} myPlayerId={myPlayerId} />

        <div className="flex flex-col items-center gap-5 px-6 py-4">
          {euchreTopCard && (
            <div className="flex flex-col items-center gap-2">
              <p className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--text-dim)' }}>Turned Down</p>
              <Card card={euchreTopCard} size="md" faceDown={false} style={{ opacity: 0.4 }} />
              <p className="text-[11px]" style={{ color: 'var(--text-dim)' }}>
                {SUIT_SYMBOL[euchreTopCard.suit]} {SUIT_LABEL[euchreTopCard.suit]} — cannot be named
              </p>
            </div>
          )}

          {isMyTurn ? (
            <div className="w-full flex flex-col gap-3">
              <p className="text-sm text-center font-semibold" style={{ color: 'var(--text-muted)' }}>
                {dealerMustCall && isDealer ? 'You must name trump (stick the dealer)' : 'Name a trump suit'}
              </p>
              <GoAloneToggle value={goAlone} onChange={setGoAlone} />
              <div className="grid grid-cols-2 gap-2">
                {ALL_SUITS.map(suit => {
                  const disabled = suit === turnedDownSuit
                  return (
                    <button
                      key={suit}
                      disabled={disabled}
                      onClick={() => { send({ type: 'euchre_call_suit', suit, goAlone }); setGoAlone(false) }}
                      className="py-3 rounded-2xl font-bold text-base transition-all active:scale-95"
                      style={{
                        background: 'var(--surface-mid)',
                        color: disabled ? 'var(--text-dim)' : SUIT_COLOR[suit],
                        border: '1px solid var(--border)',
                        opacity: disabled ? 0.35 : 1,
                        cursor: disabled ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {SUIT_SYMBOL[suit]} {SUIT_LABEL[suit]}
                    </button>
                  )
                })}
              </div>
              {!dealerMustCall && (
                <button
                  onClick={() => send({ type: 'euchre_pass' })}
                  className="w-full py-3 rounded-2xl font-bold text-sm transition-all active:scale-95"
                  style={{ background: 'var(--surface-mid)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                >
                  Pass
                </button>
              )}
            </div>
          ) : (
            <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
              Waiting for <span style={{ color: 'var(--text)' }}>{currentPlayer()?.name ?? '…'}</span>
              {currentTurnPlayerId === euchreDealerPlayerId ? ' (dealer — must call)' : ' to call…'}
            </p>
          )}
        </div>

        <BiddingHand cards={myHand} />
        <TeamScoreBar teams={teams} />
      </div>
    )
  }

  // ── DEALER DISCARD ─────────────────────────────────────────────────────
  if (euchrePhase === 'discard') {
    return (
      <div className="flex flex-col h-full overflow-y-auto">
        <OtherPlayersStrip players={others} zones={zones} currentTurnPlayerId={currentTurnPlayerId} dealerPlayerId={euchreDealerPlayerId} teams={teams} myPlayerId={myPlayerId} />

        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-4">
          <div className="w-full rounded-2xl px-4 py-3 text-center"
            style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
            <p className="text-xs font-bold uppercase tracking-wide mb-0.5" style={{ color: 'var(--accent)' }}>
              {SUIT_SYMBOL[trumpSuit!]} {SUIT_LABEL[trumpSuit!]} is trump
            </p>
            {isDealer
              ? <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Tap a card below to discard it</p>
              : <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Waiting for {players.find(p => p.id === euchreDealerPlayerId)?.name} to discard…</p>
            }
          </div>

          {isDealer && (
            <div className="relative overflow-x-auto no-scrollbar px-4 py-2 w-full" style={{ minHeight: 136 }}>
              <div className="flex items-end gap-2 flex-wrap justify-center">
                {myHand.map(card => (
                  <div
                    key={card.id}
                    onClick={() => send({ type: 'euchre_discard', cardId: card.id })}
                    className="transition-all active:scale-95"
                    style={{ cursor: 'pointer', opacity: 1 }}
                  >
                    <Card card={card} size="lg" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <TeamScoreBar teams={teams} />
      </div>
    )
  }

  // ── PLAYING TRICKS ─────────────────────────────────────────────────────
  if (euchrePhase === 'playing') {
    const sittingOut = euchreGoingAlone && partner &&
      players.find(p => p.id === euchreMakerPlayerId)?.teamId === myPlayer.teamId && !iAmMaker
      ? partner
      : null

    return (
      <div className="flex flex-col h-full overflow-y-auto">
        <OtherPlayersStrip players={others} zones={zones} currentTurnPlayerId={currentTurnPlayerId} dealerPlayerId={euchreDealerPlayerId} teams={teams} myPlayerId={myPlayerId} sittingOut={sittingOut?.id} />

        {/* Game info bar */}
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold px-2 py-1 rounded-full"
              style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid rgba(245,158,11,0.3)' }}>
              {SUIT_SYMBOL[trumpSuit!]} {SUIT_LABEL[trumpSuit!]}
            </span>
            {euchreGoingAlone && (
              <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.3)' }}>
                Going Alone
              </span>
            )}
          </div>
          <TrickTally teams={teams} players={players} />
        </div>

        {/* Trick table */}
        <TrickTable players={players} zones={zones} myPlayerId={myPlayerId} />

        {/* Led suit hint */}
        {euchreCurrentTrickLedSuit && (
          <p className="text-center text-[11px] py-1" style={{ color: 'var(--text-dim)' }}>
            Led: {SUIT_SYMBOL[euchreCurrentTrickLedSuit]} {SUIT_LABEL[euchreCurrentTrickLedSuit]}
          </p>
        )}

        {/* My hand */}
        <div className="px-2 pb-2">
          <p className="text-[10px] uppercase tracking-widest font-semibold px-2 mb-1" style={{ color: 'var(--text-dim)' }}>
            Your Hand {isMyTurn ? '— tap to play' : ''}
          </p>
          {sittingOut ? (
            <div className="flex items-center justify-center py-6">
              <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Sitting out — {players.find(p => p.id === euchreMakerPlayerId)?.name} is going alone</p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 px-2 py-1 justify-center">
              {myHand.map(card => (
                <div
                  key={card.id}
                  onClick={() => isMyTurn && send({ type: 'play_cards', cardIds: [card.id], toZoneId: `trick-${myPlayerId}` })}
                  style={{
                    cursor: isMyTurn ? 'pointer' : 'default',
                    opacity: isMyTurn ? 1 : 0.7,
                    transform: selectedCardId === card.id ? 'translateY(-10px)' : 'none',
                    transition: 'transform 0.1s ease',
                  }}
                  onMouseEnter={() => setSelectedCardId(card.id)}
                  onMouseLeave={() => setSelectedCardId(null)}
                >
                  <Card card={card} size="lg" selected={selectedCardId === card.id && isMyTurn} />
                </div>
              ))}
              {myHand.length === 0 && (
                <p className="text-sm py-4" style={{ color: 'var(--text-dim)' }}>No cards</p>
              )}
            </div>
          )}
        </div>

        <TeamScoreBar teams={teams} />
      </div>
    )
  }

  return null
}

// ── Sub-components ──────────────────────────────────────────────────────────

function OtherPlayersStrip({ players, zones, currentTurnPlayerId, dealerPlayerId, teams, myPlayerId, sittingOut }: {
  players: GameState['players']
  zones: GameState['zones']
  currentTurnPlayerId: string | null
  dealerPlayerId: string | null
  teams: GameState['teams']
  myPlayerId: string
  sittingOut?: string
}) {
  const others = players.filter(p => p.id !== myPlayerId)
  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar px-3 py-2">
      {others.map(player => {
        const isCurrent = currentTurnPlayerId === player.id
        const isDealer  = dealerPlayerId === player.id
        const isPassed  = sittingOut === player.id
        const handCount = zones.find(z => z.id === `hand-${player.id}`)?.cards.length ?? 0
        const team = teams.find(t => t.id === player.teamId)

        return (
          <div key={player.id}
            className="flex items-center gap-2 flex-shrink-0 rounded-2xl px-3 py-2"
            style={{
              background: isCurrent ? 'var(--surface-hi)' : 'var(--surface)',
              border: '1px solid ' + (isCurrent ? 'var(--accent)' : 'var(--border)'),
              opacity: isPassed ? 0.4 : 1,
            }}>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold truncate max-w-[72px]" style={{ color: 'var(--text)' }}>{player.name}</span>
                {isDealer && <span className="text-[9px] font-bold uppercase" style={{ color: 'var(--text-dim)' }}>D</span>}
                {team && <span className="text-[9px] font-bold uppercase" style={{ color: team.id === 'team-a' ? 'var(--accent)' : '#60a5fa' }}>{team.name}</span>}
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{handCount} cards</span>
                <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>· {player.trickCount}T</span>
                {isPassed && <span className="text-[9px] font-bold" style={{ color: '#a78bfa' }}>out</span>}
              </div>
            </div>
            {isCurrent && <span className="text-xs flex-shrink-0" style={{ color: 'var(--accent)' }}>▶</span>}
          </div>
        )
      })}
    </div>
  )
}

function TrickTable({ players, zones, myPlayerId }: {
  players: GameState['players']
  zones: GameState['zones']
  myPlayerId: string
}) {
  // Show all 4 players' trick slots in a 2×2 grid
  // Layout: partner top, opponents left/right, me hidden (shown in hand below)
  return (
    <div className="grid grid-cols-2 gap-2 px-4 py-2">
      {players.map(player => {
        const trickZone = zones.find(z => z.id === `trick-${player.id}`)
        const card = trickZone?.cards[0]
        const isMe = player.id === myPlayerId
        return (
          <div key={player.id}
            className="flex flex-col items-center gap-1 rounded-xl py-2"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <span className="text-[10px] font-semibold" style={{ color: 'var(--text-dim)' }}>
              {isMe ? 'You' : player.name}
            </span>
            {card
              ? <Card card={card} size="sm" />
              : <div style={{ width: 40, height: 58, borderRadius: 'var(--radius-card)', border: '1.5px dashed rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ color: 'var(--text-dim)', fontSize: 10 }}>—</span>
                </div>
            }
          </div>
        )
      })}
    </div>
  )
}

function TrickTally({ teams, players }: { teams: GameState['teams']; players: GameState['players'] }) {
  return (
    <div className="flex gap-3">
      {teams.map(team => {
        const tricks = players.filter(p => p.teamId === team.id).reduce((s, p) => s + p.trickCount, 0)
        const color = team.id === 'team-a' ? 'var(--accent)' : '#60a5fa'
        return (
          <div key={team.id} className="flex items-center gap-1">
            <span className="text-[10px] font-bold" style={{ color }}>{team.name}</span>
            <span className="text-sm font-black" style={{ color }}>{tricks}</span>
          </div>
        )
      })}
    </div>
  )
}

function TeamScoreBar({ teams }: { teams: GameState['teams'] }) {
  return (
    <div className="flex gap-3 px-4 py-2 border-t" style={{ borderColor: 'var(--border)' }}>
      {teams.map(team => {
        const color = team.id === 'team-a' ? 'var(--accent)' : '#60a5fa'
        return (
          <div key={team.id} className="flex items-center gap-1.5 flex-1 justify-center">
            <span className="text-[11px] font-bold" style={{ color }}>{team.name}</span>
            <span className="font-black text-lg" style={{ color }}>{team.totalScore}</span>
            <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>/10</span>
          </div>
        )
      })}
    </div>
  )
}

function BiddingHand({ cards }: { cards: GameState['zones'][number]['cards'] }) {
  if (cards.length === 0) return null
  return (
    <div className="px-2 pb-2">
      <p className="text-[10px] uppercase tracking-widest font-semibold px-2 mb-1" style={{ color: 'var(--text-dim)' }}>
        Your Hand
      </p>
      <div className="flex flex-wrap gap-2 px-2 py-1 justify-center">
        {cards.map(card => (
          <Card key={card.id} card={card} size="lg" />
        ))}
      </div>
    </div>
  )
}

function GoAloneToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="w-full py-2.5 rounded-xl font-semibold text-sm transition-all active:scale-95 flex items-center justify-center gap-2"
      style={{
        background: value ? 'rgba(139,92,246,0.15)' : 'var(--surface-mid)',
        color: value ? '#a78bfa' : 'var(--text-muted)',
        border: '1px solid ' + (value ? 'rgba(139,92,246,0.35)' : 'var(--border)'),
      }}
    >
      <span>{value ? '✓' : '○'}</span>
      Go Alone {value ? '(partner sits out — 4 pts for all 5)' : ''}
    </button>
  )
}

function BidProgress({ passCount, total }: { passCount: number; total: number }) {
  return (
    <div className="flex gap-1.5 items-center">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{
          width: 24, height: 6, borderRadius: 3,
          background: i < passCount ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.1)',
          border: '1px solid rgba(255,255,255,0.08)',
          transition: 'background 0.2s',
        }} />
      ))}
      <span className="text-[10px] ml-1" style={{ color: 'var(--text-dim)' }}>
        {passCount}/{total} passed
      </span>
    </div>
  )
}
