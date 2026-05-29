'use client'

import { useState } from 'react'

interface Props {
  isHost: boolean
  onPlayAgain?: () => void
  onHome: () => void
  onEnd: () => void
  onLeave: () => void
}

type Pending = 'home' | 'end' | 'leave' | null

const CONFIRM: Record<NonNullable<Pending>, { message: string; label: string; danger?: boolean }> = {
  home: { message: 'Return to lobby? The round will end for everyone.', label: 'Back to Lobby' },
  end:  { message: 'Close the room? All players will be removed.', label: 'Close Room', danger: true },
  leave: { message: 'Leave the room?', label: 'Leave' },
}

export function RoundOverActions({ isHost, onPlayAgain, onHome, onEnd, onLeave }: Props) {
  const [pending, setPending] = useState<Pending>(null)

  function handleConfirm() {
    if (pending === 'home') onHome()
    else if (pending === 'end') onEnd()
    else if (pending === 'leave') onLeave()
    setPending(null)
  }

  return (
    <>
      <div className="flex gap-2 w-full">
        {isHost ? (
          <>
            {onPlayAgain && (
              <button
                onClick={onPlayAgain}
                className="flex-1 py-3 rounded-2xl font-bold text-sm transition-all active:scale-95"
                style={{ background: 'var(--accent)', color: '#000' }}
              >
                Play Again
              </button>
            )}
            <button
              onClick={() => setPending('home')}
              className="flex-1 py-3 rounded-2xl font-bold text-sm transition-all active:scale-95"
              style={{ background: 'var(--surface-mid)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
            >
              Home
            </button>
            <button
              onClick={() => setPending('end')}
              className="px-4 py-3 rounded-2xl font-bold text-sm transition-all active:scale-95"
              style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}
            >
              End
            </button>
          </>
        ) : (
          <button
            onClick={() => setPending('leave')}
            className="flex-1 py-3 rounded-2xl font-bold text-sm transition-all active:scale-95"
            style={{ background: 'var(--surface-mid)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
          >
            Leave
          </button>
        )}
      </div>

      {pending && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center px-6"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setPending(null)}
        >
          <div
            className="w-full max-w-xs rounded-3xl p-6 flex flex-col gap-4"
            style={{ background: 'var(--surface)', border: '1px solid var(--border-hi)' }}
            onClick={e => e.stopPropagation()}
          >
            <p className="text-sm font-semibold text-center" style={{ color: 'var(--text)' }}>
              {CONFIRM[pending].message}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPending(null)}
                className="flex-1 py-2.5 rounded-2xl font-bold text-sm transition-all active:scale-95"
                style={{ background: 'var(--surface-mid)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                className="flex-1 py-2.5 rounded-2xl font-bold text-sm transition-all active:scale-95"
                style={CONFIRM[pending].danger ? {
                  background: 'rgba(239,68,68,0.15)',
                  color: '#f87171',
                  border: '1px solid rgba(239,68,68,0.3)',
                } : {
                  background: 'var(--accent)',
                  color: '#000',
                }}
              >
                {CONFIRM[pending].label}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
