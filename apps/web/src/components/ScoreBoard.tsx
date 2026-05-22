'use client'

import { useState } from 'react'
import type { GameState } from '@playing-cards/shared'

interface Props {
  gameState: GameState
  onClose: () => void
}

export function ScoreBoard({ gameState, onClose }: Props) {
  const { players, teams, gameType } = gameState
  const showTeams = teams.length > 0

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div
        className="bg-[#0f2d1a] border-t border-white/10 rounded-t-3xl w-full max-w-md p-6 card-slide"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-bold text-lg">Scores</h2>
          <button onClick={onClose} className="text-white/40 text-sm">Close</button>
        </div>

        {showTeams ? (
          <TeamScores teams={teams} players={players} />
        ) : (
          <PlayerScores players={players} gameType={gameType} />
        )}
      </div>
    </div>
  )
}

function PlayerScores({ players, gameType }: { players: GameState['players']; gameType: GameState['gameType'] }) {
  const sorted = [...players].sort((a, b) => b.totalScore - a.totalScore)
  return (
    <div className="flex flex-col gap-2">
      {sorted.map((player, i) => (
        <div key={player.id} className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="text-white/40 text-sm w-4">{i + 1}</span>
            <span className="text-white font-medium">{player.name}</span>
          </div>
          <div className="text-right">
            <div className="text-white font-bold">{player.totalScore}</div>
            {player.roundScore !== 0 && (
              <div className="text-white/40 text-xs">+{player.roundScore} this round</div>
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
