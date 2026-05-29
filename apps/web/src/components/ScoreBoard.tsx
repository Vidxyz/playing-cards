'use client'

import { useState } from 'react'
import type { GameState } from '@playing-cards/shared'
import { Card } from './Card'
import { RoundOverActions } from './RoundOverActions'

interface Props {
  gameState: GameState
  onClose: () => void
  isHost?: boolean
  onPlayAgain?: () => void
  onHome?: () => void
  onEnd?: () => void
  onLeave?: () => void
}

export function ScoreBoard({ gameState, onClose, isHost, onPlayAgain, onHome, onEnd, onLeave }: Props) {
  const { players, teams, gameType, phase, zones } = gameState
  const showTeams = teams.length > 0
  const isRoundOver = phase === 'round-over'
  // submitted kept only to prevent duplicate play-again clicks
  const [submitted, setSubmitted] = useState(false)
  const [expanded, setExpanded] = useState(true)
  const [handsExpanded, setHandsExpanded] = useState(true)

  // Collect face-up hand/pos zones that have cards (Euchre/Bluff → hand-*, Cambio → pos-*)
  const revealedZones = zones.filter(z =>
    (z.id.startsWith('hand-') || z.id.startsWith('pos-')) &&
    z.visibility === 'face-up' &&
    z.cards.length > 0 &&
    z.ownerId
  )

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 flex justify-center">
      <div
        className="border-t border-white/10 rounded-t-3xl w-full max-w-md card-slide"
        style={{ background: 'var(--surface)' }}
      >
        {/* Header — always visible, tapping it toggles expand/collapse */}
        <button
          onClick={() => setExpanded(v => !v)}
          className="w-full flex items-center justify-between px-6 py-4"
        >
          <h2 className="font-bold text-lg" style={{ color: 'var(--text)' }}>
            {isRoundOver ? 'Round Over' : 'Scores'}
          </h2>
          <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
            {expanded ? '▲ minimize' : '▼ expand'}
          </span>
        </button>

        {expanded && (
          <div className="px-6 pb-6 flex flex-col gap-4">
            {/* Revealed hands section (Euchre, Bluff, Cambio) */}
            {revealedZones.length > 0 && (
              <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border-hi)' }}>
                <button
                  onClick={() => setHandsExpanded(v => !v)}
                  className="w-full flex items-center justify-between px-3 py-2.5"
                  style={{ background: 'var(--surface-hi)' }}
                >
                  <span className="text-xs font-black uppercase tracking-widest" style={{ color: 'var(--text)' }}>Hands</span>
                  <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>{handsExpanded ? '▲ hide' : '▼ show'}</span>
                </button>
                {handsExpanded && (
                  <div className="flex flex-col gap-3 px-3 py-2.5">
                    {revealedZones.map(zone => {
                      const owner = players.find(p => p.id === zone.ownerId)
                      if (!owner) return null
                      return (
                        <div key={zone.id} className="flex flex-col gap-1">
                          <span className="text-xs font-bold" style={{ color: 'var(--text)' }}>{owner.name}</span>
                          <div className="flex flex-wrap gap-1">
                            {zone.cards.map(card => (
                              <Card key={card.id} card={card} size="sm" />
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Scores */}
            {showTeams ? (
              <TeamScores teams={teams} players={players} />
            ) : gameType === 'cambio' ? (
              <CambioScores players={players} />
            ) : (
              <PlayerScores players={players} gameType={gameType} />
            )}

            {isRoundOver && onHome && onEnd && onLeave && (
              <RoundOverActions
                isHost={isHost ?? false}
                onPlayAgain={onPlayAgain && !submitted ? () => { setSubmitted(true); onPlayAgain(); onClose() } : undefined}
                onHome={onHome}
                onEnd={onEnd}
                onLeave={onLeave}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function CambioScores({ players }: { players: GameState['players'] }) {
  // Lower round score = better in Cambio
  const sorted = [...players].sort((a, b) => a.roundScore - b.roundScore)
  const minScore = sorted[0]?.roundScore ?? 0
  return (
    <div className="flex flex-col gap-2">
      {sorted.map((player, i) => {
        const isWinner = player.roundScore === minScore
        return (
          <div
            key={player.id}
            className="flex items-center justify-between rounded-xl px-4 py-3"
            style={{
              background: isWinner ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.04)',
              border: isWinner ? '1px solid rgba(74,222,128,0.3)' : '1px solid transparent',
            }}
          >
            <div className="flex items-center gap-3">
              <span className="text-sm w-4" style={{ color: 'var(--text-dim)' }}>{i + 1}</span>
              <span className="font-medium text-sm" style={{ color: 'var(--text)' }}>{player.name}</span>
              {isWinner && <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#4ade80' }}>LOW</span>}
            </div>
            <div className="text-right">
              <div className="font-black text-lg" style={{ color: isWinner ? '#4ade80' : 'var(--text)' }}>
                {player.roundScore}
              </div>
              <div className="text-[10px]" style={{ color: 'var(--text-dim)' }}>
                total {player.totalScore}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function PlayerScores({ players, gameType }: { players: GameState['players']; gameType: GameState['gameType'] }) {
  const sorted = [...players].sort((a, b) => b.totalScore - a.totalScore)
  return (
    <div className="flex flex-col gap-2">
      {sorted.map((player, i) => (
        <div key={player.id} className="flex items-center justify-between rounded-xl px-4 py-3"
          style={{ background: 'rgba(255,255,255,0.04)' }}>
          <div className="flex items-center gap-3">
            <span className="text-sm w-4" style={{ color: 'var(--text-dim)' }}>{i + 1}</span>
            <span className="font-medium text-sm" style={{ color: 'var(--text)' }}>{player.name}</span>
          </div>
          <div className="text-right">
            <div className="font-bold" style={{ color: 'var(--text)' }}>{player.totalScore}</div>
            {player.roundScore !== 0 && (
              <div className="text-xs" style={{ color: 'var(--text-dim)' }}>+{player.roundScore} this round</div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function TeamScores({ teams, players }: { teams: GameState['teams']; players: GameState['players'] }) {
  return (
    <div className="flex flex-col gap-3">
      {teams.map(team => {
        const teamPlayers = players.filter(p => p.teamId === team.id)
        return (
          <div key={team.id} className="bg-white/5 rounded-xl px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-white font-bold">{team.name}</span>
              <span className="text-white font-bold text-lg">{team.totalScore}</span>
            </div>
            {teamPlayers.map(p => (
              <div key={p.id} className="flex justify-between text-sm text-white/60">
                <span>{p.name}</span>
                <span>{p.trickCount} tricks</span>
              </div>
            ))}
            {team.roundScore !== 0 && (
              <div className="text-white/40 text-xs mt-1">+{team.roundScore} this round</div>
            )}
          </div>
        )
      })}
    </div>
  )
}
