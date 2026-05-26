'use client'

import { useState } from 'react'
import type { GameState, ClientEvent, Rank } from '@playing-cards/shared'

interface Props {
  gameState: GameState
  myPlayerId: string
  send: (event: ClientEvent) => void
  isHost: boolean
}

const RANK_LABEL: Record<string, string> = {
  '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7',
  '8': '8', '9': '9', '10': '10', 'J': 'J', 'Q': 'Q', 'K': 'K', 'A': 'A',
}

export function GoFishBoard({ gameState, myPlayerId, send, isHost }: Props) {
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null)
  const [selectedRank, setSelectedRank] = useState<string | null>(null)

  const isMyTurn = gameState.currentTurnPlayerId === myPlayerId
  const me = gameState.players.find(p => p.id === myPlayerId)

  const myHand = gameState.zones.find(z => z.id === `hand-${myPlayerId}`)
  const myBooks = gameState.zones.find(z => z.id === `books-${myPlayerId}`)

  // Ranks in my hand (unique, sorted by RANK_LABEL order)
  const RANK_ORDER: Rank[] = ['2','3','4','5','6','7','8','9','10','J','Q','K','A']
  const myHandRanks = [...new Set((myHand?.cards ?? []).map(c => c.rank as Rank))]
    .sort((a, b) => RANK_ORDER.indexOf(a) - RANK_ORDER.indexOf(b))

  const otherPlayers = gameState.players.filter(p => p.id !== myPlayerId)

  const canAsk = isMyTurn && selectedTarget !== null && selectedRank !== null && myHandRanks.includes(selectedRank as Rank)

  const handleAsk = () => {
    if (!canAsk || !selectedTarget || !selectedRank) return
    send({ type: 'gofish_ask', targetPlayerId: selectedTarget, rank: selectedRank })
    setSelectedTarget(null)
    setSelectedRank(null)
  }

  const lastAsk = gameState.goFishLastAsk

  const getHandCount = (pid: string) => {
    const zone = gameState.zones.find(z => z.id === `hand-${pid}`)
    return zone?.cards.filter(c => !c.id.startsWith('hidden_')).length ?? zone?.cards.length ?? 0
  }

  const getBookCount = (pid: string) => gameState.goFishBooks[pid]?.length ?? 0
  const getBookRanks = (pid: string) => gameState.goFishBooks[pid] ?? []

  const currentTurnPlayer = gameState.players.find(p => p.id === gameState.currentTurnPlayerId)

  return (
    <div className="w-full flex flex-col gap-3">

      {/* ── Turn indicator ───────────────────────────── */}
      {gameState.phase === 'playing' && gameState.currentTurnPlayerId && (
        <div
          className="mx-auto px-4 py-2 rounded-full text-sm font-bold"
          style={isMyTurn
            ? { background: 'var(--accent)', color: '#000' }
            : { background: 'var(--surface-hi)', color: 'var(--text-muted)', border: '1px solid var(--border-hi)' }
          }
        >
          {isMyTurn ? 'Your turn — ask a player!' : `${currentTurnPlayer?.name ?? '?'}'s turn`}
        </div>
      )}

      {/* ── Last ask result ──────────────────────────── */}
      {lastAsk && (
        <LastAskBanner lastAsk={lastAsk} players={gameState.players} myPlayerId={myPlayerId} />
      )}

      {/* ── Other players ───────────────────────────── */}
      <div className="flex flex-wrap gap-2 justify-center">
        {otherPlayers.map(p => {
          const handCount = getHandCount(p.id)
          const bookCount = getBookCount(p.id)
          const bookRanks = getBookRanks(p.id)
          const isSelected = selectedTarget === p.id
          const isCurrent = gameState.currentTurnPlayerId === p.id
          const isConnected = p.isConnected

          return (
            <button
              key={p.id}
              onClick={() => isMyTurn && setSelectedTarget(isSelected ? null : p.id)}
              className="flex flex-col items-center gap-1.5 px-4 py-3 rounded-2xl transition-all active:scale-95"
              style={{
                background: isSelected
                  ? 'var(--accent-dim)'
                  : 'var(--surface-hi)',
                border: isSelected
                  ? '2px solid var(--accent)'
                  : isCurrent
                    ? '2px solid rgba(255,255,255,0.25)'
                    : '1px solid var(--border-hi)',
                opacity: isConnected ? 1 : 0.5,
                cursor: isMyTurn ? 'pointer' : 'default',
                minWidth: 100,
              }}
            >
              <div className="flex items-center gap-1.5">
                <div
                  className="flex items-center justify-center rounded-full text-[10px] font-black flex-shrink-0"
                  style={{ width: 24, height: 24, background: isCurrent ? 'var(--accent)' : 'var(--surface-mid)', color: isCurrent ? '#000' : 'var(--text-muted)' }}
                >
                  {p.name.slice(0, 2).toUpperCase()}
                </div>
                <span className="text-xs font-bold truncate max-w-[80px]" style={{ color: 'var(--text)' }}>
                  {p.name}
                </span>
                {!isConnected && <span className="text-[9px]" style={{ color: 'var(--text-dim)' }}>●</span>}
              </div>

              <div className="flex items-center gap-2">
                <div className="flex flex-col items-center">
                  <span className="text-base font-black" style={{ color: 'var(--text)' }}>{handCount}</span>
                  <span className="text-[8px] uppercase tracking-wide" style={{ color: 'var(--text-dim)' }}>cards</span>
                </div>
                <div className="w-px h-6" style={{ background: 'var(--border)' }} />
                <div className="flex flex-col items-center">
                  <span className="text-base font-black" style={{ color: bookCount > 0 ? 'var(--accent)' : 'var(--text-muted)' }}>{bookCount}</span>
                  <span className="text-[8px] uppercase tracking-wide" style={{ color: 'var(--text-dim)' }}>books</span>
                </div>
              </div>

              {bookRanks.length > 0 && (
                <div className="flex flex-wrap gap-0.5 justify-center">
                  {bookRanks.map((r: string) => (
                    <span key={r} className="text-[9px] font-bold px-1 py-0.5 rounded"
                      style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid rgba(245,158,11,0.3)' }}>
                      {RANK_LABEL[r] ?? r}
                    </span>
                  ))}
                </div>
              )}

              {isSelected && (
                <span className="text-[10px] font-bold" style={{ color: 'var(--accent)' }}>Selected ✓</span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Draw pile ───────────────────────────────── */}
      <div className="flex items-center justify-center gap-2">
        <div className="flex flex-col items-center gap-1">
          <div className="relative" style={{ width: 56, height: 80 }}>
            <div style={{
              position: 'absolute', top: -2, left: -2, width: 56, height: 80,
              borderRadius: 'var(--radius-card)',
              background: 'linear-gradient(145deg,#1a2d54,#1e3560)',
              border: '1px solid rgba(255,255,255,0.06)',
            }} />
            <div style={{
              position: 'absolute', top: 0, left: 0, width: 56, height: 80,
              borderRadius: 'var(--radius-card)',
              background: 'linear-gradient(145deg,#243f72,#1e3560)',
              border: '1px solid rgba(255,255,255,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: 700 }}>
                {gameState.drawPileCount}
              </span>
            </div>
          </div>
          <span className="text-[9px] uppercase tracking-widest" style={{ color: 'var(--text-dim)' }}>draw pile</span>
        </div>
      </div>

      {/* ── Ask controls (only on my turn) ──────────── */}
      {isMyTurn && gameState.phase === 'playing' && (
        <div className="flex flex-col gap-2 px-2">
          {/* Step 1: target */}
          {!selectedTarget && (
            <div className="text-center text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
              Step 1: tap a player above to ask them
            </div>
          )}
          {selectedTarget && (
            <div className="text-center text-xs font-semibold" style={{ color: 'var(--accent)' }}>
              Asking {gameState.players.find(p => p.id === selectedTarget)?.name ?? '?'}
              {!selectedRank && ' — now pick a rank below'}
            </div>
          )}

          {/* Rank picker */}
          {myHandRanks.length > 0 && (
            <div className="flex flex-wrap gap-1.5 justify-center">
              {myHandRanks.map(rank => (
                <button
                  key={rank}
                  onClick={() => setSelectedRank(selectedRank === rank ? null : rank)}
                  className="font-bold text-sm transition-all active:scale-95 rounded-xl"
                  style={{
                    minWidth: 40, height: 40,
                    background: selectedRank === rank ? 'var(--accent)' : 'var(--surface-hi)',
                    color: selectedRank === rank ? '#000' : 'var(--text)',
                    border: selectedRank === rank ? '2px solid var(--accent-hi)' : '1px solid var(--border-hi)',
                  }}
                >
                  {RANK_LABEL[rank] ?? rank}
                </button>
              ))}
            </div>
          )}

          {myHandRanks.length === 0 && (
            <div className="text-center text-xs" style={{ color: 'var(--text-dim)' }}>
              Waiting for cards to ask with…
            </div>
          )}

          {/* Ask button */}
          <button
            onClick={handleAsk}
            disabled={!canAsk}
            className="w-full py-3 rounded-2xl font-black text-sm tracking-widest uppercase transition-all active:scale-95"
            style={canAsk
              ? { background: 'var(--accent)', color: '#000', boxShadow: '0 0 16px rgba(245,158,11,0.3)' }
              : { background: 'var(--surface-mid)', color: 'var(--text-dim)', border: '1px solid var(--border)', cursor: 'not-allowed' }
            }
          >
            {canAsk
              ? `Ask ${gameState.players.find(p => p.id === selectedTarget)?.name ?? '?'} for ${RANK_LABEL[selectedRank!] ?? selectedRank}s`
              : 'Ask!'
            }
          </button>
        </div>
      )}

      {/* ── My books ────────────────────────────────── */}
      {myBooks && myBooks.cards.length > 0 && (
        <div className="flex flex-col gap-1 px-2">
          <div className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--text-dim)' }}>
            My books ({getBookCount(myPlayerId)})
          </div>
          <div className="flex flex-wrap gap-1">
            {getBookRanks(myPlayerId).map((r: string) => (
              <span key={r} className="text-xs font-bold px-2 py-1 rounded-lg"
                style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid rgba(245,158,11,0.3)' }}>
                {RANK_LABEL[r] ?? r}s
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Round over ──────────────────────────────── */}
      {gameState.phase === 'round-over' && (
        <div className="flex flex-col gap-2 px-2">
          <div className="text-center text-sm font-black tracking-widest uppercase" style={{ color: 'var(--accent)' }}>
            Game Over!
          </div>
          <div className="flex flex-col gap-1">
            {[...gameState.players]
              .sort((a, b) => (getBookCount(b.id)) - (getBookCount(a.id)))
              .map((p, i) => (
                <div key={p.id} className="flex items-center justify-between px-3 py-2 rounded-xl"
                  style={{ background: i === 0 ? 'var(--accent-dim)' : 'var(--surface-hi)', border: `1px solid ${i === 0 ? 'rgba(245,158,11,0.3)' : 'var(--border-hi)'}` }}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold" style={{ color: i === 0 ? 'var(--accent)' : 'var(--text-dim)' }}>
                      #{i + 1}
                    </span>
                    <span className="text-sm font-bold" style={{ color: p.id === myPlayerId ? 'var(--accent)' : 'var(--text)' }}>
                      {p.name}{p.id === myPlayerId ? ' (you)' : ''}
                    </span>
                  </div>
                  <span className="text-sm font-black" style={{ color: i === 0 ? 'var(--accent)' : 'var(--text)' }}>
                    {getBookCount(p.id)} book{getBookCount(p.id) !== 1 ? 's' : ''}
                  </span>
                </div>
              ))
            }
          </div>
          {isHost && (
            <button
              onClick={() => send({ type: 'next_round' })}
              className="w-full py-3 rounded-2xl font-black text-sm tracking-widest uppercase transition-all active:scale-95"
              style={{ background: 'var(--accent)', color: '#000' }}
            >
              Play Again
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function LastAskBanner({
  lastAsk,
  players,
  myPlayerId,
}: {
  lastAsk: NonNullable<GameState['goFishLastAsk']>
  players: GameState['players']
  myPlayerId: string
}) {
  const asker = players.find(p => p.id === lastAsk.askerId)
  const target = players.find(p => p.id === lastAsk.targetId)
  const iMadeAsk = lastAsk.askerId === myPlayerId
  const iWasAsked = lastAsk.targetId === myPlayerId

  let icon = '🎣'
  let message = ''
  let color = 'var(--text-muted)'
  let bg = 'var(--surface-hi)'
  let borderColor = 'var(--border-hi)'

  if (lastAsk.luckyFish) {
    icon = '🐟✨'
    message = iMadeAsk
      ? `Lucky fish! You drew a ${lastAsk.rank} from the pile!`
      : `${asker?.name} drew a ${lastAsk.rank} — lucky fish!`
    color = 'var(--accent)'
    bg = 'var(--accent-dim)'
    borderColor = 'rgba(245,158,11,0.35)'
  } else if (lastAsk.success) {
    icon = '✅'
    message = iMadeAsk
      ? `${target?.name} had ${lastAsk.rank}s — you got them!`
      : iWasAsked
        ? `${asker?.name} took your ${lastAsk.rank}s`
        : `${asker?.name} got ${lastAsk.rank}s from ${target?.name}`
    color = '#4ade80'
    bg = 'rgba(74,222,128,0.1)'
    borderColor = 'rgba(74,222,128,0.25)'
  } else {
    icon = '🐟'
    message = iMadeAsk
      ? `Go fish! ${target?.name} had no ${lastAsk.rank}s`
      : `${asker?.name} asked ${target?.name} for ${lastAsk.rank}s — go fish!`
    color = 'var(--text-muted)'
  }

  return (
    <div
      className="mx-2 flex items-center gap-2 px-3 py-2.5 rounded-xl fade-in"
      style={{ background: bg, border: `1px solid ${borderColor}` }}
    >
      <span style={{ fontSize: 18 }}>{icon}</span>
      <span className="text-xs font-semibold" style={{ color }}>{message}</span>
    </div>
  )
}
