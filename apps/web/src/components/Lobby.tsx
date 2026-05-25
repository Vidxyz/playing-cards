'use client'

import { useState, useCallback } from 'react'
import type { GameState, GameType, ClientEvent } from '@playing-cards/shared'
import { CambioTutorialModal, BluffTutorialModal, EuchreTutorialModal, PresidentTutorialModal, BlackjackTutorialModal, PokerTutorialModal } from './CambioTutorial'

const GAMES: {
  type: GameType; label: string; desc: string; icon: string; min: number; max: number; comingSoon?: boolean
}[] = [
  { type: 'president', label: 'President',  icon: '👑', desc: 'Get rid of all cards first',       min: 2, max: 8 },
  { type: 'bluff',     label: 'Bluff',      icon: '🎭', desc: 'Lie freely, get caught, take pile', min: 3, max: 8 },
  { type: 'poker',     label: 'Poker',      icon: '♠',  desc: "Texas Hold'em",                    min: 2, max: 9 },
  { type: 'blackjack', label: 'Blackjack',  icon: '21', desc: 'Beat the dealer to 21',             min: 2, max: 7 },
  { type: 'euchre',    label: 'Euchre',     icon: '🤝', desc: '2v2 trick-taking',                  min: 4, max: 4 },
  { type: 'cambio',    label: 'Cambio',     icon: '🔄', desc: 'Lowest total wins — swap & peek',   min: 2, max: 6 },
]

interface Props {
  gameState: GameState
  myPlayerId: string
  send: (event: ClientEvent) => void
}

export function Lobby({ gameState, myPlayerId, send }: Props) {
  const [showCambioTutorial, setShowCambioTutorial] = useState(false)
  const [showBluffTutorial, setShowBluffTutorial] = useState(false)
  const [showEuchreTutorial, setShowEuchreTutorial] = useState(false)
  const [showPresidentTutorial, setShowPresidentTutorial] = useState(false)
  const [showBlackjackTutorial, setShowBlackjackTutorial] = useState(false)
  const [showPokerTutorial, setShowPokerTutorial] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
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
          {gameState.players.map(player => (
            <div key={player.id}
              className="flex items-center justify-between rounded-xl px-3 py-2.5"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{ background: 'var(--surface-mid)', color: 'var(--text-muted)' }}>
                  {player.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{player.name}</span>
                  {player.isHost && (
                    <span className="ml-2 text-[10px] font-bold uppercase tracking-wide"
                      style={{ color: 'var(--accent)' }}>Host</span>
                  )}
                </div>
              </div>
              <div>
                {!player.isConnected && (
                  <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>offline</span>
                )}
                {player.isReady && !player.isHost && (
                  <span className="text-green-400 text-sm font-bold">✓</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Game selector — host only */}
      {isHost && (
        <Section label="Choose Game">
          <div className="grid grid-cols-2 gap-2">
            {GAMES.map(game => {
              const tooFew  = playerCount < game.min
              const tooMany = playerCount > game.max
              const playerMismatch = tooFew || tooMany
              const active = selectedGame === game.type
              const locked = game.comingSoon ?? false

              return (
                <button
                  key={game.type}
                  disabled={locked}
                  onClick={() => !locked && send({ type: 'set_game', gameType: game.type })}
                  className="flex flex-col items-start text-left rounded-xl p-3 transition-all active:scale-95"
                  style={{
                    background: active ? 'var(--accent-dim)' : 'var(--surface)',
                    border: '1px solid ' + (active ? 'var(--accent)' : 'var(--border)'),
                    opacity: locked ? 0.45 : 1,
                    cursor: locked ? 'not-allowed' : 'pointer',
                  }}
                >
                  <span className="text-xl mb-1.5">{game.icon}</span>
                  <span className="font-bold text-sm" style={{ color: active ? 'var(--accent)' : 'var(--text)' }}>
                    {game.label}
                  </span>
                  <span className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{game.desc}</span>
                  <span className="text-[10px] mt-1" style={{ color: locked ? 'var(--text-dim)' : playerMismatch ? '#f87171' : 'var(--text-dim)' }}>
                    {locked ? 'Coming soon' : game.min === game.max ? `${game.min} players` : `${game.min}–${game.max} players`}
                    {!locked && active && playerMismatch && (tooFew ? ` · need ${game.min - playerCount} more` : ` · too many`)}
                  </span>
                </button>
              )
            })}
          </div>
        </Section>
      )}

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

      {/* Action */}
      <div className="px-4 pb-10 pt-2">
        {isHost ? (
          <button
            disabled={!canDeal}
            onClick={() => send({ type: 'start_deal' })}
            className="w-full py-4 rounded-2xl font-bold text-base transition-all active:scale-95"
            style={{
              background: canDeal ? 'var(--accent)' : 'var(--surface-mid)',
              color: canDeal ? '#000' : 'var(--text-dim)',
              border: '1px solid ' + (canDeal ? 'var(--accent)' : 'var(--border)'),
              cursor: canDeal ? 'pointer' : 'not-allowed',
            }}
          >
            {canDeal ? 'Deal Cards' : !selectedGame ? 'Select a game above' : playerCount < (selectedConfig?.min ?? 2) ? `Need ${(selectedConfig?.min ?? 2) - playerCount} more player${(selectedConfig?.min ?? 2) - playerCount > 1 ? 's' : ''}` : `Too many players (max ${selectedConfig?.max})`}
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

