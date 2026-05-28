'use client'

import { useState, useCallback } from 'react'
import type { GameState, GameType, ClientEvent } from '@playing-cards/shared'
import { CambioTutorialModal, BluffTutorialModal, EuchreTutorialModal, PresidentTutorialModal, BlackjackTutorialModal, PokerTutorialModal, GoFishTutorialModal, RummyTutorialModal, CrazyEightsTutorialModal } from './CambioTutorial'
import { ThemeToggle } from './ThemeToggle'
import { DisconnectTimer } from './DisconnectTimer'

const GAMES: {
  type: GameType; label: string; desc: string; icon: string; min: number; max: number; comingSoon?: boolean
}[] = [
  { type: 'president', label: 'President',  icon: '👑', desc: 'Get rid of all cards first',       min: 2, max: 8 },
  { type: 'bluff',     label: 'Bluff',      icon: '🎭', desc: 'Lie freely, get caught, take pile', min: 3, max: 8 },
  { type: 'poker',     label: 'Poker',      icon: '♠',  desc: "Texas Hold'em",                    min: 2, max: 9 },
  { type: 'blackjack', label: 'Blackjack',  icon: '21', desc: 'Beat the dealer to 21',             min: 2, max: 7 },
  { type: 'euchre',    label: 'Euchre',     icon: '🤝', desc: '2v2 trick-taking',                  min: 4, max: 4 },
  { type: 'cambio',    label: 'Cambio',     icon: '🔄', desc: 'Lowest total wins — swap & peek',   min: 2, max: 6 },
  { type: 'go-fish',   label: 'Go Fish',    icon: '🐟', desc: 'Collect books of 4 — ask & fish',   min: 2, max: 6 },
  { type: 'rummy',        label: 'Rummy',         icon: '🃏', desc: 'Form melds, go out, lowest score wins', min: 2, max: 6 },
  { type: 'crazy-eights', label: 'Crazy Eights', icon: '8️⃣', desc: 'Match suit or rank — 8s are wild!',      min: 2, max: 6 },
]

interface Props {
  gameState: GameState
  myPlayerId: string
  send: (event: ClientEvent) => void
  onLeave: () => void
  errorMsg?: string | null
}

export function Lobby({ gameState, myPlayerId, send, onLeave, errorMsg }: Props) {
  const [showCambioTutorial, setShowCambioTutorial] = useState(false)
  const [showBluffTutorial, setShowBluffTutorial] = useState(false)
  const [showEuchreTutorial, setShowEuchreTutorial] = useState(false)
  const [showPresidentTutorial, setShowPresidentTutorial] = useState(false)
  const [showBlackjackTutorial, setShowBlackjackTutorial] = useState(false)
  const [showPokerTutorial, setShowPokerTutorial] = useState(false)
  const [showGoFishTutorial, setShowGoFishTutorial] = useState(false)
  const [showRummyTutorial, setShowRummyTutorial] = useState(false)
  const [showCrazyEightsTutorial, setShowCrazyEightsTutorial] = useState(false)
  const [pendingKick, setPendingKick] = useState<{ id: string; name: string } | null>(null)
  const [confirmEndRoom, setConfirmEndRoom] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [dealing, setDealing] = useState(false)
  const [dismissedError, setDismissedError] = useState<string | null>(null)
  const me = gameState.players.find(p => p.id === myPlayerId)

  const copyJoinLink = useCallback(async () => {
    const link = `${window.location.origin}/?join=${gameState.roomCode}`
    try {
      await navigator.clipboard.writeText(link)
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
    } catch {
      // Clipboard API unavailable — silently ignore
    }
  }, [gameState.roomCode])
  const isHost = me?.isHost ?? false
  const playerCount = gameState.players.length
  const selectedGame = gameState.gameType
  const selectedConfig = GAMES.find(g => g.type === selectedGame)
  const canDeal = selectedGame !== null
    && playerCount >= (selectedConfig?.min ?? 2)
    && playerCount <= (selectedConfig?.max ?? 99)

  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ background: 'var(--bg)' }}>

      {/* Top bar */}
      <div className="relative flex items-center px-4 py-3 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}>
        {isHost ? (
          <button
            onClick={() => setConfirmEndRoom(true)}
            className="text-xs font-semibold px-3 py-1.5 rounded-full transition-all active:scale-95"
            style={{
              background: 'rgba(229,62,62,0.12)',
              color: '#fc8181',
              border: '1px solid rgba(229,62,62,0.25)',
            }}
          >
            End Room
          </button>
        ) : (
          <button
            onClick={() => setConfirmLeave(true)}
            className="text-xs font-semibold px-3 py-1.5 rounded-full transition-all active:scale-95"
            style={{
              background: 'var(--surface-mid)',
              color: 'var(--text-muted)',
              border: '1px solid var(--border)',
            }}
          >
            Leave
          </button>
        )}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="flex items-center gap-1.5">
            <span style={{ fontSize: 18 }}>🃏</span>
            <span className="font-black text-sm tracking-wide" style={{ color: 'var(--text)' }}>DealMeIn</span>
          </div>
        </div>
        <div className="ml-auto">
          <ThemeToggle compact />
        </div>
      </div>

      {/* Error banner */}
      {errorMsg && errorMsg !== dismissedError && (
        <div className="px-4 pt-3">
          <div className="rounded-xl px-4 py-2.5 text-sm font-medium flex items-center justify-between gap-3"
            style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }}>
            <span>{errorMsg}</span>
            <button
              onClick={() => setDismissedError(errorMsg)}
              style={{ fontSize: 16, lineHeight: 1, color: '#f87171', flexShrink: 0 }}
            >×</button>
          </div>
        </div>
      )}

      {/* Room code hero */}
      <div className="flex flex-col items-center pt-10 pb-6 px-4">
        <p className="text-[10px] uppercase tracking-[0.2em] font-semibold mb-3"
          style={{ color: 'var(--text-dim)' }}>
          Room Code
        </p>
        <div className="rounded-2xl px-8 py-4"
          style={{ background: 'var(--surface-mid)', border: '1px solid var(--border-hi)' }}>
          <span className="font-mono font-bold text-4xl tracking-[0.35em]"
            style={{ color: 'var(--text)', letterSpacing: '0.35em' }}>
            {gameState.roomCode}
          </span>
        </div>
        <button
          onClick={copyJoinLink}
          className="mt-3 flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all active:scale-95"
          style={{
            background: linkCopied ? 'rgba(139,92,246,0.12)' : 'var(--surface)',
            border: '1px solid ' + (linkCopied ? 'rgba(139,92,246,0.45)' : 'var(--border)'),
            color: linkCopied ? '#a78bfa' : 'var(--text-muted)',
          }}
        >
          <span>{linkCopied ? '✓' : '🔗'}</span>
          {linkCopied ? 'Link copied!' : 'Copy join link'}
        </button>
      </div>

      {/* Players */}
      <Section label={`Players (${playerCount})`}>
        <div className="flex flex-col gap-1.5">
          {gameState.players.map(player => {
            const isMe = player.id === myPlayerId
            return (
            <div key={player.id}
              className="flex items-center justify-between rounded-xl px-3 py-2.5"
              style={{
                background: isMe ? 'var(--accent-dim)' : 'var(--surface)',
                border: '1px solid ' + (isMe ? 'rgba(245,158,11,0.35)' : 'var(--border)'),
              }}>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{
                    background: isMe ? 'var(--accent)' : 'var(--surface-mid)',
                    color: isMe ? '#000' : 'var(--text-muted)',
                  }}>
                  {player.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <span className="text-sm font-bold" style={{ color: isMe ? 'var(--accent)' : 'var(--text)' }}>{player.name}</span>
                  {isMe && (
                    <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide"
                      style={{ color: 'var(--accent)', opacity: 0.7 }}>you</span>
                  )}
                  {player.isHost && (
                    <span className="ml-2 text-[10px] font-bold uppercase tracking-wide"
                      style={{ color: 'var(--accent)' }}>Host</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!player.isConnected && (
                  player.disconnectedAt
                    ? <DisconnectTimer disconnectedAt={player.disconnectedAt} />
                    : <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>offline</span>
                )}
                {player.isReady && !player.isHost && (
                  <span className="text-green-400 text-sm font-bold">✓</span>
                )}
                {isHost && !player.isHost && (
                  <button
                    onClick={() => setPendingKick({ id: player.id, name: player.name })}
                    className="flex items-center justify-center rounded-full text-xs font-bold transition-all active:scale-90"
                    style={{
                      width: 22, height: 22,
                      background: 'rgba(239,68,68,0.12)',
                      color: '#f87171',
                      border: '1px solid rgba(239,68,68,0.25)',
                    }}
                    title="Remove player"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          )})}
        </div>
      </Section>

      {/* Game selector — visible to all, interactive only for host */}
      <Section label="Choose Game">
        <div className="grid grid-cols-2 gap-2">
          {GAMES.map(game => {
            const tooFew  = playerCount < game.min
            const tooMany = playerCount > game.max
            const playerMismatch = tooFew || tooMany
            const active = selectedGame === game.type
            const locked = game.comingSoon ?? false
            const clickable = isHost && !locked

            return (
              <button
                key={game.type}
                disabled={!clickable}
                onClick={() => clickable && send({ type: 'set_game', gameType: game.type })}
                className="flex flex-col items-start text-left rounded-xl p-3 transition-all active:scale-95"
                style={{
                  background: active ? 'var(--accent-dim)' : 'var(--surface)',
                  border: '1px solid ' + (active ? 'var(--accent)' : 'var(--border)'),
                  opacity: locked ? 0.45 : 1,
                  cursor: clickable ? 'pointer' : 'default',
                }}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xl leading-none">{game.icon}</span>
                  <span className="font-bold text-sm leading-tight" style={{ color: active ? 'var(--accent)' : 'var(--text)' }}>
                    {game.label}
                  </span>
                </div>
                <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{game.desc}</span>
                <span className="text-[10px] mt-1" style={{ color: locked ? 'var(--text-dim)' : playerMismatch ? '#f87171' : 'var(--text-dim)' }}>
                  {locked ? 'Coming soon' : game.min === game.max ? `${game.min} players` : `${game.min}–${game.max} players`}
                  {!locked && active && playerMismatch && (tooFew ? ` · need ${game.min - playerCount} more` : ` · too many`)}
                </span>
              </button>
            )
          })}
        </div>
        {!isHost && (
          <p className="text-[10px] mt-2 text-center" style={{ color: 'var(--text-dim)' }}>
            Only the host can change the game
          </p>
        )}
      </Section>

      {/* President — how to play (visible to all players) */}
      {selectedGame === 'president' && (
        <div className="px-4 mb-4">
          <button
            onClick={() => setShowPresidentTutorial(true)}
            className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-95 flex items-center justify-center gap-2"
            style={{ background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
          >
            <span>📖</span>
            How to play President
          </button>
        </div>
      )}

      {/* Euchre — how to play (visible to all players) */}
      {selectedGame === 'euchre' && (
        <div className="px-4 mb-4">
          <button
            onClick={() => setShowEuchreTutorial(true)}
            className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-95 flex items-center justify-center gap-2"
            style={{
              background: 'var(--surface)',
              color: 'var(--text-muted)',
              border: '1px solid var(--border)',
            }}
          >
            <span>📖</span>
            How to play Euchre
          </button>
        </div>
      )}

      {/* Cambio — how to play (visible to all players) */}
      {selectedGame === 'cambio' && (
        <div className="px-4 mb-4">
          <button
            onClick={() => setShowCambioTutorial(true)}
            className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-95 flex items-center justify-center gap-2"
            style={{
              background: 'var(--surface)',
              color: 'var(--text-muted)',
              border: '1px solid var(--border)',
            }}
          >
            <span>📖</span>
            How to play Cambio
          </button>
        </div>
      )}

      {/* Bluff — how to play (visible to all players) */}
      {selectedGame === 'bluff' && (
        <div className="px-4 mb-4">
          <button
            onClick={() => setShowBluffTutorial(true)}
            className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-95 flex items-center justify-center gap-2"
            style={{
              background: 'var(--surface)',
              color: 'var(--text-muted)',
              border: '1px solid var(--border)',
            }}
          >
            <span>📖</span>
            How to play Bluff
          </button>
        </div>
      )}

      {/* Blackjack — how to play (visible to all players) */}
      {selectedGame === 'blackjack' && (
        <div className="px-4 mb-4">
          <button
            onClick={() => setShowBlackjackTutorial(true)}
            className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-95 flex items-center justify-center gap-2"
            style={{ background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
          >
            <span>📖</span>
            How to play Blackjack
          </button>
        </div>
      )}

      {/* Poker — how to play (visible to all players) */}
      {selectedGame === 'poker' && (
        <div className="px-4 mb-4">
          <button
            onClick={() => setShowPokerTutorial(true)}
            className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-95 flex items-center justify-center gap-2"
            style={{ background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
          >
            <span>📖</span>
            How to play Poker
          </button>
        </div>
      )}

      {/* Go Fish — how to play (visible to all players) */}
      {selectedGame === 'go-fish' && (
        <div className="px-4 mb-4">
          <button
            onClick={() => setShowGoFishTutorial(true)}
            className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-95 flex items-center justify-center gap-2"
            style={{ background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
          >
            <span>📖</span>
            How to play Go Fish
          </button>
        </div>
      )}

      {/* Rummy — how to play (visible to all players) */}
      {selectedGame === 'rummy' && (
        <div className="px-4 mb-4">
          <button
            onClick={() => setShowRummyTutorial(true)}
            className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-95 flex items-center justify-center gap-2"
            style={{ background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
          >
            <span>📖</span>
            How to play Rummy
          </button>
        </div>
      )}

      {/* Crazy Eights — how to play */}
      {selectedGame === 'crazy-eights' && (
        <div className="px-4 mb-4">
          <button
            onClick={() => setShowCrazyEightsTutorial(true)}
            className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-95 flex items-center justify-center gap-2"
            style={{ background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
          >
            <span>📖</span>
            How to play Crazy Eights
          </button>
        </div>
      )}

      {/* Crazy Eights bust-score config */}
      {isHost && selectedGame === 'crazy-eights' && (
        <Section label="Bust Score (elimination threshold)">
          <div className="flex gap-2">
            {[100, 200, 300, 500].map(score => {
              const active = gameState.crazy8sMaxScore === score
              return (
                <button
                  key={score}
                  onClick={() => send({ type: 'set_crazy8s_config', maxScore: score })}
                  className="flex-1 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95"
                  style={{
                    background: active ? 'var(--accent-dim)' : 'var(--surface)',
                    color: active ? 'var(--accent)' : 'var(--text-muted)',
                    border: '1px solid ' + (active ? 'var(--accent)' : 'var(--border)'),
                  }}
                >
                  {score}
                </button>
              )
            })}
          </div>
          <p className="text-[10px] mt-1.5" style={{ color: 'var(--text-dim)' }}>
            A player reaching this total is eliminated. Last one standing wins.
          </p>
        </Section>
      )}

      {/* Rummy bust-score config */}
      {isHost && selectedGame === 'rummy' && (
        <Section label="Bust Score (elimination threshold)">
          <div className="flex gap-2">
            {[50, 100, 150, 200].map(score => {
              const active = gameState.rummyMaxScore === score
              return (
                <button
                  key={score}
                  onClick={() => send({ type: 'set_rummy_config', maxScore: score })}
                  className="flex-1 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95"
                  style={{
                    background: active ? 'var(--accent-dim)' : 'var(--surface)',
                    color: active ? 'var(--accent)' : 'var(--text-muted)',
                    border: '1px solid ' + (active ? 'var(--accent)' : 'var(--border)'),
                  }}
                >
                  {score}
                </button>
              )
            })}
          </div>
          <p className="text-[10px] mt-1.5" style={{ color: 'var(--text-dim)' }}>
            A player reaching this total is eliminated. Last one standing wins.
          </p>
        </Section>
      )}

      {/* Bluff joker count */}
      {isHost && selectedGame === 'bluff' && (
        <Section label="Jokers in Deck">
          <div className="flex gap-2">
            {[0, 1, 2, 3, 4].map(count => {
              const active = gameState.bluffJokers === count
              return (
                <button
                  key={count}
                  onClick={() => send({ type: 'set_bluff_jokers', count })}
                  className="flex-1 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95"
                  style={{
                    background: active ? 'var(--accent-dim)' : 'var(--surface)',
                    color: active ? 'var(--accent)' : 'var(--text-muted)',
                    border: '1px solid ' + (active ? 'var(--accent)' : 'var(--border)'),
                  }}
                >
                  {count === 0 ? 'None' : `${count}`}
                </button>
              )
            })}
          </div>
          <p className="text-[10px] mt-1.5" style={{ color: 'var(--text-dim)' }}>
            Jokers are wildcards — they count as any rank
          </p>
        </Section>
      )}

      {/* Poker config */}
      {isHost && selectedGame === 'poker' && (
        <>
          <Section label="Starting Chips">
            <div className="flex gap-2">
              {[500, 1000, 2000, 5000].map(chips => {
                const active = gameState.pokerStartingChips === chips
                return (
                  <button
                    key={chips}
                    onClick={() => send({ type: 'set_poker_config', startingChips: chips, smallBlind: gameState.pokerSmallBlind })}
                    className="flex-1 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95"
                    style={{
                      background: active ? 'var(--accent-dim)' : 'var(--surface)',
                      color: active ? 'var(--accent)' : 'var(--text-muted)',
                      border: '1px solid ' + (active ? 'var(--accent)' : 'var(--border)'),
                    }}
                  >
                    {chips}
                  </button>
                )
              })}
            </div>
          </Section>
          <Section label="Small Blind">
            <div className="flex gap-2">
              {[5, 10, 25, 50].map(blind => {
                const active = gameState.pokerSmallBlind === blind
                return (
                  <button
                    key={blind}
                    onClick={() => send({ type: 'set_poker_config', startingChips: gameState.pokerStartingChips, smallBlind: blind })}
                    className="flex-1 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95"
                    style={{
                      background: active ? 'var(--accent-dim)' : 'var(--surface)',
                      color: active ? 'var(--accent)' : 'var(--text-muted)',
                      border: '1px solid ' + (active ? 'var(--accent)' : 'var(--border)'),
                    }}
                  >
                    {blind}
                  </button>
                )
              })}
            </div>
            <p className="text-[10px] mt-1.5" style={{ color: 'var(--text-dim)' }}>
              Big blind: {gameState.pokerSmallBlind * 2}
            </p>
          </Section>
        </>
      )}

      {/* Cambio joker count */}
      {isHost && selectedGame === 'cambio' && (
        <Section label="Jokers in Deck">
          <div className="flex gap-2">
            {[0, 1, 2].map(count => {
              const active = gameState.cambioJokers === count
              return (
                <button
                  key={count}
                  onClick={() => send({ type: 'set_cambio_jokers', count })}
                  className="flex-1 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95"
                  style={{
                    background: active ? 'var(--accent-dim)' : 'var(--surface)',
                    color: active ? 'var(--accent)' : 'var(--text-muted)',
                    border: '1px solid ' + (active ? 'var(--accent)' : 'var(--border)'),
                  }}
                >
                  {count === 0 ? 'None' : count === 1 ? '1 Joker' : '2 Jokers'}
                </button>
              )
            })}
          </div>
          <p className="text-[10px] mt-1.5" style={{ color: 'var(--text-dim)' }}>
            Jokers are worth 0 pts
          </p>
        </Section>
      )}

      {/* Blackjack chip config */}
      {isHost && selectedGame === 'blackjack' && (
        <>
          <Section label="Starting Chips">
            <div className="flex gap-2">
              {[500, 1000, 2000, 5000].map(chips => {
                const active = gameState.blackjackStartingChips === chips
                return (
                  <button
                    key={chips}
                    onClick={() => send({ type: 'set_blackjack_config', startingChips: chips, betAmount: gameState.blackjackBetAmount })}
                    className="flex-1 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95"
                    style={{
                      background: active ? 'var(--accent-dim)' : 'var(--surface)',
                      color: active ? 'var(--accent)' : 'var(--text-muted)',
                      border: '1px solid ' + (active ? 'var(--accent)' : 'var(--border)'),
                    }}
                  >
                    {chips}
                  </button>
                )
              })}
            </div>
          </Section>
          <Section label="Bet Per Hand">
            <div className="flex gap-2">
              {[25, 50, 100, 200].map(bet => {
                const active = gameState.blackjackBetAmount === bet
                return (
                  <button
                    key={bet}
                    onClick={() => send({ type: 'set_blackjack_config', startingChips: gameState.blackjackStartingChips, betAmount: bet })}
                    className="flex-1 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95"
                    style={{
                      background: active ? 'var(--accent-dim)' : 'var(--surface)',
                      color: active ? 'var(--accent)' : 'var(--text-muted)',
                      border: '1px solid ' + (active ? 'var(--accent)' : 'var(--border)'),
                    }}
                  >
                    {bet}
                  </button>
                )
              })}
            </div>
            <p className="text-[10px] mt-1.5" style={{ color: 'var(--text-dim)' }}>
              Blackjack pays 2.5×
            </p>
          </Section>
        </>
      )}

      {/* Euchre seat assignment */}
      {isHost && selectedGame === 'euchre' && playerCount === 4 && (
        <Section label="Team Seats">
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            <div className="grid grid-cols-2">
              {[
                { label: 'Team A', color: 'var(--accent)', indices: [0, 2] },
                { label: 'Team B', color: '#60a5fa',       indices: [1, 3] },
              ].map(team => (
                <div key={team.label} className="p-3" style={{ background: 'var(--surface)' }}>
                  <p className="text-xs font-bold mb-1.5" style={{ color: team.color }}>{team.label}</p>
                  {gameState.players
                    .filter(p => team.indices.includes(p.seatIndex))
                    .map(p => (
                      <p key={p.id} className="text-xs" style={{ color: 'var(--text-muted)' }}>{p.name}</p>
                    ))}
                </div>
              ))}
            </div>
            <div className="px-3 pb-3 pt-2 flex flex-wrap gap-1.5" style={{ background: 'var(--surface)' }}>
              <p className="text-[10px] w-full" style={{ color: 'var(--text-dim)' }}>Tap to rotate seat:</p>
              {gameState.players.map(p => (
                <button
                  key={p.id}
                  onClick={() => send({ type: 'assign_seat', playerId: p.id, seatIndex: (p.seatIndex + 1) % 4 })}
                  className="text-xs px-2 py-1 rounded-lg transition-all active:scale-95"
                  style={{ background: 'var(--surface-mid)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                  {p.name} #{p.seatIndex}
                </button>
              ))}
            </div>
          </div>
        </Section>
      )}

      {showCambioTutorial && (
        <CambioTutorialModal onClose={() => setShowCambioTutorial(false)} />
      )}

      {showBluffTutorial && (
        <BluffTutorialModal onClose={() => setShowBluffTutorial(false)} />
      )}

      {showEuchreTutorial && (
        <EuchreTutorialModal onClose={() => setShowEuchreTutorial(false)} />
      )}

      {showPresidentTutorial && (
        <PresidentTutorialModal onClose={() => setShowPresidentTutorial(false)} />
      )}

      {showBlackjackTutorial && (
        <BlackjackTutorialModal onClose={() => setShowBlackjackTutorial(false)} />
      )}

      {showPokerTutorial && (
        <PokerTutorialModal onClose={() => setShowPokerTutorial(false)} />
      )}

      {showGoFishTutorial && (
        <GoFishTutorialModal onClose={() => setShowGoFishTutorial(false)} />
      )}

      {showRummyTutorial && (
        <RummyTutorialModal onClose={() => setShowRummyTutorial(false)} />
      )}

      {showCrazyEightsTutorial && (
        <CrazyEightsTutorialModal onClose={() => setShowCrazyEightsTutorial(false)} />
      )}

      {confirmLeave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6" onClick={() => setConfirmLeave(false)}
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div
            className="w-full max-w-xs rounded-3xl p-6 flex flex-col gap-4"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)' }}>
                <span style={{ fontSize: 22 }}>🚪</span>
              </div>
              <h3 className="font-bold text-base" style={{ color: 'var(--text)' }}>Leave Lobby?</h3>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                You can rejoin if the room is still open.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmLeave(false)}
                className="flex-1 py-2.5 rounded-2xl text-sm font-semibold transition-all active:scale-95"
                style={{ background: 'var(--surface-mid)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
              >
                Cancel
              </button>
              <button
                onClick={onLeave}
                className="flex-1 py-2.5 rounded-2xl text-sm font-bold transition-all active:scale-95"
                style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}
              >
                Leave
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmEndRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6" onClick={() => setConfirmEndRoom(false)}
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div
            className="w-full max-w-xs rounded-3xl p-6 flex flex-col gap-4"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)' }}>
                <span style={{ fontSize: 22 }}>🚪</span>
              </div>
              <h3 className="font-bold text-base" style={{ color: 'var(--text)' }}>End Room?</h3>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Everyone will be removed and the room will close.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmEndRoom(false)}
                className="flex-1 py-2.5 rounded-2xl text-sm font-semibold transition-all active:scale-95"
                style={{ background: 'var(--surface-mid)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
              >
                Cancel
              </button>
              <button
                onClick={() => { send({ type: 'end_game' }); onLeave() }}
                className="flex-1 py-2.5 rounded-2xl text-sm font-bold transition-all active:scale-95"
                style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}
              >
                End Room
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingKick && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6" onClick={() => setPendingKick(null)}
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div
            className="w-full max-w-xs rounded-3xl p-6 flex flex-col gap-4"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)' }}>
                <span style={{ fontSize: 22 }}>🚪</span>
              </div>
              <h3 className="font-bold text-base" style={{ color: 'var(--text)' }}>Remove player?</h3>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                <strong style={{ color: 'var(--text)' }}>{pendingKick.name}</strong> will be kicked from the room.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPendingKick(null)}
                className="flex-1 py-2.5 rounded-2xl text-sm font-semibold transition-all active:scale-95"
                style={{ background: 'var(--surface-mid)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
              >
                Cancel
              </button>
              <button
                onClick={() => { send({ type: 'kick_player', playerId: pendingKick.id }); setPendingKick(null) }}
                className="flex-1 py-2.5 rounded-2xl text-sm font-bold transition-all active:scale-95"
                style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action */}
      <div className="px-4 pb-10 pt-2">
        {isHost ? (
          <button
            disabled={!canDeal || dealing}
            onClick={() => { setDealing(true); send({ type: 'start_deal' }) }}
            className="w-full py-4 rounded-2xl font-bold text-base transition-all active:scale-95"
            style={{
              background: canDeal && !dealing ? 'var(--accent)' : 'var(--surface-mid)',
              color: canDeal && !dealing ? '#000' : 'var(--text-dim)',
              border: '1px solid ' + (canDeal && !dealing ? 'var(--accent)' : 'var(--border)'),
              cursor: canDeal && !dealing ? 'pointer' : 'not-allowed',
            }}
          >
            {dealing ? 'Dealing…' : canDeal ? 'Deal Cards' : !selectedGame ? 'Select a game above' : playerCount < (selectedConfig?.min ?? 2) ? `Need ${(selectedConfig?.min ?? 2) - playerCount} more player${(selectedConfig?.min ?? 2) - playerCount > 1 ? 's' : ''}` : `Too many players (max ${selectedConfig?.max})`}
          </button>
        ) : (
          <button
            onClick={() => send({ type: 'ready' })}
            className="w-full py-4 rounded-2xl font-bold text-base transition-all active:scale-95"
            style={{
              background: me?.isReady ? 'rgba(74,222,128,0.15)' : 'var(--surface-mid)',
              color: me?.isReady ? '#4ade80' : 'var(--text)',
              border: '1px solid ' + (me?.isReady ? 'rgba(74,222,128,0.35)' : 'var(--border-hi)'),
            }}
          >
            {me?.isReady ? '✓ Ready' : 'Mark Ready'}
          </button>
        )}
      </div>
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-4 mb-4">
      <p className="text-[10px] uppercase tracking-[0.18em] font-semibold mb-2"
        style={{ color: 'var(--text-dim)' }}>
        {label}
      </p>
      {children}
    </div>
  )
}

