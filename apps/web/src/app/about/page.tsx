import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'DealMeIn — About' }

const GAMES = [
  { name: 'Blackjack', desc: 'Hit, stand, split — beat the dealer.' },
  { name: 'Poker', desc: 'Texas Hold\'em with blinds and all-in.' },
  { name: 'President', desc: 'Climb the ranks; Scum deals next.' },
  { name: 'Euchre', desc: '4-player trick-taking with trump suits.' },
  { name: 'Cambio', desc: 'Lowest hand wins — hidden cards, power cards.' },
  { name: 'Bluff', desc: 'Play cards face-down and lie about them.' },
]

export default function AboutPage() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div className="sticky top-0 z-10 pt-safe" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
        <div className="flex items-center gap-3 px-4 py-3">
          <Link
            href="/"
            className="flex items-center justify-center rounded-full transition-all active:scale-95"
            style={{ width: 32, height: 32, background: 'var(--surface-mid)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
            aria-label="Back to home"
          >
            ←
          </Link>
          <span className="text-sm font-bold" style={{ color: 'var(--text)' }}>About</span>
        </div>
      </div>

      <main className="max-w-md mx-auto px-4 py-8 flex flex-col gap-8">

        {/* Hero */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div
            className="flex items-center justify-center w-16 h-16 rounded-2xl"
            style={{ background: 'var(--surface-mid)', border: '1px solid var(--border-hi)' }}
          >
            <span className="text-3xl">🃏</span>
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>DealMeIn</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Virtual card table for any game</p>
          </div>
        </div>

        {/* Description */}
        <section
          className="rounded-2xl p-5 flex flex-col gap-3 text-sm leading-relaxed"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <p style={{ color: 'var(--text-muted)' }}>
            <span className="font-bold" style={{ color: 'var(--text)' }}>DealMeIn</span> is a real-time multiplayer card
            table that runs entirely in your browser — no accounts, no downloads, just share a room code and play.
          </p>
          <p style={{ color: 'var(--text-muted)' }}>
            Create a room, pick a game, deal the cards. Everything is synced live across devices via WebSockets. Room state
            lives in a Cloudflare Durable Object and expires after 4 hours of inactivity.
          </p>
          <p style={{ color: 'var(--text-muted)' }}>
            No data is stored beyond the active session — your name and room code exist only while you're connected.
          </p>
        </section>

        {/* Games */}
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-dim)' }}>
            Supported games
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {GAMES.map(g => (
              <div
                key={g.name}
                className="rounded-xl px-3 py-2.5 flex flex-col gap-0.5"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
              >
                <span className="text-sm font-bold" style={{ color: 'var(--text)' }}>{g.name}</span>
                <span className="text-[11px] leading-snug" style={{ color: 'var(--text-dim)' }}>{g.desc}</span>
              </div>
            ))}
          </div>
        </section>

        <div style={{ borderTop: '1px solid var(--border)' }} />

        {/* Built by */}
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-dim)' }}>
            Built by
          </h2>
          <a
            href="https://vidxyz.github.io"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-3 rounded-2xl px-4 py-3 transition-all active:scale-[0.98]"
            style={{ background: 'var(--surface)', border: '1px solid var(--border-hi)' }}
          >
            <div
              className="flex items-center justify-center rounded-full font-bold text-sm flex-shrink-0"
              style={{ width: 36, height: 36, background: 'var(--accent-dim)', border: '1px solid var(--border-hi)', color: 'var(--accent)' }}
            >
              V
            </div>
            <span className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>vidxyz.github.io</span>
            <svg className="ml-auto" width="14" height="14" viewBox="0 0 20 20" fill="currentColor" style={{ color: 'var(--text-dim)', flexShrink: 0 }} aria-hidden="true">
              <path fillRule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5z" clipRule="evenodd" />
              <path fillRule="evenodd" d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z" clipRule="evenodd" />
            </svg>
          </a>
        </section>

        {/* CTA */}
        <div className="text-center pb-safe">
          <Link
            href="/"
            className="inline-block px-6 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95"
            style={{ background: 'var(--accent)', color: '#000' }}
          >
            Start playing →
          </Link>
        </div>
      </main>
    </div>
  )
}
