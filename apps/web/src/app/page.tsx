'use client'

import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ThemeToggle } from '@/components/ThemeToggle'

const WORKER_URL = process.env.NEXT_PUBLIC_WORKER_URL || 'http://localhost:8787'

function generatePlayerId(): string {
  return Math.random().toString(36).slice(2, 11)
}

function HomeInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [name, setName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [mode, setMode] = useState<'home' | 'join'>('home')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [kickedMsg, setKickedMsg] = useState<string | null>(null)

  useEffect(() => {
    const join = searchParams.get('join')
    if (join) { setJoinCode(join.toUpperCase()); setMode('join') }
  }, [searchParams])

  useEffect(() => {
    try {
      const msg = sessionStorage.getItem('kicked_reason')
      if (msg) {
        sessionStorage.removeItem('kicked_reason')
        setKickedMsg(msg)
        const t = setTimeout(() => setKickedMsg(null), 6000)
        return () => clearTimeout(t)
      }
    } catch {}
  }, [])

  async function createRoom() {
    if (!name.trim()) { setError('Enter your name first'); return }
    setLoading(true); setError('')
    try {
      const res = await fetch(`${WORKER_URL}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostName: name.trim() }),
      })
      if (!res.ok) throw new Error('Server error')
      const { roomCode, playerId } = await res.json() as { roomCode: string; playerId: string }
      sessionStorage.setItem(`player_${roomCode}`, JSON.stringify({ playerId, name: name.trim() }))
      router.push(`/room/${roomCode}`)
    } catch {
      setError('Could not create room — is the worker running?')
    } finally {
      setLoading(false)
    }
  }

  async function joinRoom() {
    if (!name.trim()) { setError('Enter your name first'); return }
    const code = joinCode.trim().toUpperCase()
    if (code.length !== 6) { setError('Room code must be 6 characters'); return }
    setLoading(true); setError('')
    try {
      const res = await fetch(`${WORKER_URL}/api/rooms/${code}`)
      if (!res.ok) { setError('Room not found — check the code and try again'); setLoading(false); return }
      const playerId = generatePlayerId()
      sessionStorage.setItem(`player_${code}`, JSON.stringify({ playerId, name: name.trim() }))
      router.push(`/room/${code}`)
    } catch {
      setError('Could not connect — is the worker running?')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center px-5 relative"
      style={{ background: 'var(--bg)' }}
    >
      <div className="absolute top-4 right-4">
        <ThemeToggle compact />
      </div>
      <div className="w-full max-w-xs flex flex-col gap-5">

        {/* Kicked / disconnect notification */}
        {kickedMsg && (
          <div
            className="card-slide flex items-start gap-2.5 rounded-2xl px-4 py-3"
            style={{ background: 'rgba(229,62,62,0.1)', border: '1px solid rgba(229,62,62,0.28)', color: '#fc8181' }}
          >
            <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>⚠️</span>
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-sm font-semibold leading-snug" style={{ color: '#fc8181' }}>{kickedMsg}</span>
            </div>
            <button
              onClick={() => setKickedMsg(null)}
              className="ml-auto flex-shrink-0 text-xs"
              style={{ color: 'rgba(252,129,129,0.5)', lineHeight: 1 }}
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        )}

        {/* Logo */}
        <div className="text-center mb-2">
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-3xl mb-4"
            style={{ background: 'var(--surface-mid)', border: '1px solid var(--border-hi)' }}>
            <span style={{ fontSize: 52 }}>🃏</span>
          </div>
          <h1 className="font-black text-3xl tracking-tight" style={{ color: 'var(--text)' }}>
            DealMeIn
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Virtual card table for any game
          </p>
        </div>

        {/* Name */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs uppercase tracking-widest font-medium" style={{ color: 'var(--text-muted)' }}>
            Your Name
          </label>
          <input
            type="text"
            placeholder="Enter your name"
            value={name}
            maxLength={20}
            autoComplete="off"
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (mode === 'home' ? createRoom() : joinRoom())}
            className="rounded-xl px-4 py-3 text-base outline-none transition-all"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border-hi)',
              color: 'var(--text)',
            }}
            onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
            onBlur={e => (e.target.style.borderColor = 'var(--border-hi)')}
          />
        </div>

        {mode === 'home' ? (
          <div className="flex flex-col gap-2.5">
            <button
              onClick={createRoom}
              disabled={loading}
              className="w-full py-3.5 rounded-xl font-bold text-base transition-all active:scale-95 disabled:opacity-50"
              style={{ background: 'var(--accent)', color: '#000' }}
            >
              {loading ? 'Creating…' : 'Create Room'}
            </button>
            <button
              onClick={() => { setMode('join'); setError('') }}
              className="w-full py-3.5 rounded-xl font-semibold text-base transition-all active:scale-95"
              style={{ background: 'var(--surface-mid)', color: 'var(--text)', border: '1px solid var(--border-hi)' }}
            >
              Join Room
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs uppercase tracking-widest font-medium" style={{ color: 'var(--text-muted)' }}>
                Room Code
              </label>
              <input
                type="text"
                placeholder="XXXXXX"
                value={joinCode}
                maxLength={6}
                autoComplete="off"
                onChange={e => setJoinCode(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && joinRoom()}
                className="rounded-xl px-4 py-3 text-center text-2xl font-mono tracking-[0.3em] uppercase outline-none transition-all"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border-hi)',
                  color: 'var(--text)',
                }}
                onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                onBlur={e => (e.target.style.borderColor = 'var(--border-hi)')}
              />
            </div>
            <button
              onClick={joinRoom}
              disabled={loading}
              className="w-full py-3.5 rounded-xl font-bold text-base transition-all active:scale-95 disabled:opacity-50"
              style={{ background: 'var(--accent)', color: '#000' }}
            >
              {loading ? 'Joining…' : 'Join Room'}
            </button>
            <button
              onClick={() => { setMode('home'); setError('') }}
              className="text-sm text-center transition-opacity hover:opacity-80"
              style={{ color: 'var(--text-muted)' }}
            >
              ← Back
            </button>
          </div>
        )}

        {error && (
          <div className="rounded-xl px-4 py-3 text-sm text-center card-slide"
            style={{ background: 'rgba(229,62,62,0.12)', border: '1px solid rgba(229,62,62,0.25)', color: '#fc8181' }}>
            {error}
          </div>
        )}

        {/* Supported games */}
        <div className="flex justify-center gap-2 flex-wrap pt-1">
          {[
            { label: 'President',    icon: '👑' },
            { label: 'Poker',        icon: '♠️' },
            { label: 'Blackjack',    icon: '21' },
            { label: 'Euchre',       icon: '🤝' },
            { label: 'Cambio',       icon: '🔄' },
            { label: 'Bluff',        icon: '🎭' },
            { label: 'Go Fish',      icon: '🐟' },
            { label: 'Rummy',        icon: '🃏' },
            { label: 'Crazy Eights', icon: '8️⃣' },
          ].map(g => (
            <span
              key={g.label}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full"
              style={{
                background: 'var(--surface-mid)',
                color: 'var(--text)',
                border: '1px solid var(--border-hi)',
              }}
            >
              <span style={{ fontSize: 13 }}>{g.icon}</span>
              {g.label}
            </span>
          ))}
        </div>
      </div>
    </main>
  )
}

export default function Home() {
  return (
    <Suspense>
      <HomeInner />
    </Suspense>
  )
}
