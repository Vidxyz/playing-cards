'use client'

import { useEffect, useRef, useState } from 'react'
import { use } from 'react'
import { useRouter } from 'next/navigation'
import { useRoom } from '@/hooks/useRoom'
import { Lobby } from '@/components/Lobby'
import { GameTable } from '@/components/GameTable'

interface PlayerSession {
  playerId: string
  name: string
}

function getSession(roomCode: string): PlayerSession | null {
  try {
    const raw = sessionStorage.getItem(`player_${roomCode}`)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export default function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params)
  const router = useRouter()
  const [session, setSession] = useState<PlayerSession | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const s = getSession(code.toUpperCase())
    if (!s) {
      router.replace(`/?join=${code}`)
      return
    }
    setSession(s)
    setReady(true)
  }, [code, router])

  if (!ready || !session) {
    return <Splash label="Connecting…" />
  }

  return <RoomView roomCode={code.toUpperCase()} session={session} />
}

function RoomView({ roomCode, session }: { roomCode: string; session: PlayerSession }) {
  const router = useRouter()
  const { gameState, status, lastAction, peekResults, initialPeeks, clearInitialPeeks, send, errorMsg, restartNotice } = useRoom(
    roomCode,
    session.playerId,
    session.name,
  )
  const [dismissedError, setDismissedError] = useState<string | null>(null)
  const [gameOverSubmitted, setGameOverSubmitted] = useState(false)
  const [hostToast, setHostToast] = useState<string | null>(null)
  const prevHostIdRef = useRef<string | null>(null)

  const visibleError = errorMsg && errorMsg !== dismissedError ? errorMsg : null

  // Detect host transfer and show a toast
  useEffect(() => {
    if (!gameState) return
    const prev = prevHostIdRef.current
    const next = gameState.hostId
    prevHostIdRef.current = next
    if (prev === null || next === prev) return
    const newHost = gameState.players.find(p => p.id === next)
    if (!newHost) return
    setHostToast(next === session.playerId ? 'You are now the host' : `${newHost.name} is now the host`)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState?.hostId])

  useEffect(() => {
    if (!hostToast) return
    const t = setTimeout(() => setHostToast(null), 4000)
    return () => clearTimeout(t)
  }, [hostToast])

  function renderMain() {
    if (status === 'connecting' || !gameState) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-5"
          style={{ background: 'var(--bg)' }}>
          {visibleError ? (
            <>
              <div className="w-full max-w-xs rounded-xl px-4 py-3 text-sm font-medium flex items-center justify-between gap-3"
                style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }}>
                <span>{visibleError}</span>
                <button onClick={() => setDismissedError(visibleError)} style={{ fontSize: 16, lineHeight: 1, color: '#f87171', flexShrink: 0 }}>×</button>
              </div>
              <button
                onClick={() => router.replace('/')}
                className="text-sm font-semibold px-4 py-2 rounded-xl transition-all active:scale-95"
                style={{ background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
              >
                Go Home
              </button>
            </>
          ) : (
            <>
              <div className="w-7 h-7 rounded-full border-2 border-t-transparent animate-spin"
                style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Connecting…</p>
            </>
          )}
        </div>
      )
    }

    if (status === 'disconnected') {
      return <Splash label="Reconnecting…" spinner dim />
    }

    if (gameState.phase === 'game-over') {
      const isHost = gameState.players.find(p => p.id === session.playerId)?.isHost
      const sorted = [...gameState.players].sort((a, b) => b.totalScore - a.totalScore)

      return (
        <div className="min-h-screen flex flex-col items-center justify-center px-5 gap-5"
          style={{ background: 'var(--bg)' }}>
          {visibleError && (
            <div className="w-full max-w-xs rounded-xl px-4 py-2.5 text-sm font-medium flex items-center justify-between gap-3"
              style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }}>
              <span>{visibleError}</span>
              <button onClick={() => setDismissedError(visibleError)} style={{ fontSize: 16, lineHeight: 1, color: '#f87171', flexShrink: 0 }}>×</button>
            </div>
          )}
          <div className="text-center">
            <div className="text-4xl mb-2">🏆</div>
            <h2 className="font-bold text-2xl" style={{ color: 'var(--text)' }}>Game Over</h2>
          </div>
          <div className="flex flex-col gap-2 w-full max-w-xs">
            {sorted.map((p, i) => (
              <div key={p.id} className="flex items-center justify-between rounded-xl px-4 py-3"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <span className="text-sm w-6" style={{ color: 'var(--text-muted)' }}>{i + 1}.</span>
                <span className="text-sm font-medium flex-1" style={{ color: 'var(--text)' }}>{p.name}</span>
                <span className="font-bold text-sm" style={{ color: 'var(--accent)' }}>{p.totalScore} pts</span>
              </div>
            ))}
          </div>
          <div className="flex gap-3 w-full max-w-xs">
            {isHost && (
              <button
                disabled={gameOverSubmitted}
                onClick={() => { setGameOverSubmitted(true); send({ type: 'next_round' }) }}
                className="flex-1 font-bold py-3 rounded-2xl transition-all active:scale-95"
                style={{
                  background: gameOverSubmitted ? 'var(--surface-mid)' : 'var(--accent)',
                  color: gameOverSubmitted ? 'var(--text-dim)' : '#000',
                  cursor: gameOverSubmitted ? 'not-allowed' : 'pointer',
                }}
              >
                Play Again
              </button>
            )}
            <button
              onClick={() => router.replace('/')}
              className="flex-1 font-bold py-3 rounded-2xl transition-all active:scale-95"
              style={{ background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
            >
              Home
            </button>
          </div>
        </div>
      )
    }

    if (gameState.phase === 'lobby') {
      return (
        <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
          <Lobby gameState={gameState} myPlayerId={session.playerId} send={send} onLeave={() => router.replace('/')} errorMsg={errorMsg} />
        </div>
      )
    }

    return (
      <div className="h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>
        <GameTable
          gameState={gameState}
          myPlayerId={session.playerId}
          send={send}
          lastAction={lastAction}
          peekResults={peekResults}
          initialPeeks={initialPeeks}
          clearInitialPeeks={clearInitialPeeks}
          onLeave={() => router.replace('/')}
          errorMsg={errorMsg}
        />
      </div>
    )
  }

  return (
    <>
      {renderMain()}

      {/* Host transfer toast */}
      {hostToast && (
        <div className="fixed top-4 inset-x-0 z-[100] flex justify-center pointer-events-none px-4">
          <div
            className="flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold"
            style={{
              background: 'var(--surface-hi)',
              border: '1px solid var(--accent)',
              color: 'var(--accent)',
              boxShadow: '0 4px 24px rgba(0,0,0,0.35)',
            }}
          >
            <span>👑</span>
            <span>{hostToast}</span>
          </div>
        </div>
      )}

      {/* Round restarted overlay */}
      {restartNotice && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center pointer-events-none px-6">
          <div
            className="flex flex-col items-center gap-3 rounded-3xl px-8 py-6 text-center"
            style={{
              background: 'var(--surface-hi)',
              border: '1px solid var(--border-hi)',
              boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
            }}
          >
            <span style={{ fontSize: 36 }}>🔄</span>
            <div>
              <p className="font-bold text-base" style={{ color: 'var(--text)' }}>Round Restarted</p>
              <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                {restartNotice} restarted the round — cards are being redealt
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function Splash({ label, spinner, dim }: { label: string; spinner?: boolean; dim?: boolean }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3"
      style={{ background: 'var(--bg)', opacity: dim ? 0.6 : 1 }}>
      {spinner && (
        <div className="w-7 h-7 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
      )}
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{label}</p>
    </div>
  )
}
