'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useTheme } from '@/hooks/useTheme'
import { useAccent, ACCENT_OPTIONS, type AccentKey } from '@/hooks/useAccent'

export function ThemeToggle({ compact: _compact }: { compact?: boolean }) {
  const { isDark, toggle } = useTheme()
  const { accent, setAccent } = useAccent()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div ref={rootRef} style={{ position: 'relative', zIndex: 200 }}>
      {/* Gear button */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Settings"
        className="transition-all active:scale-95 select-none"
        style={{
          width: 32, height: 32,
          borderRadius: '50%',
          background: open ? 'var(--accent-dim)' : 'var(--surface-mid)',
          border: '1px solid ' + (open ? 'var(--accent)' : 'var(--border)'),
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 15,
          transition: 'background 0.15s, border-color 0.15s',
        }}
      >
        ⚙️
      </button>

      {/* Panel */}
      {open && (
        <div
          className="fade-in"
          style={{
            position: 'absolute', top: 'calc(100% + 8px)', right: 0,
            width: 200,
            background: 'var(--surface)',
            border: '1px solid var(--border-hi)',
            borderRadius: 16,
            padding: '14px 14px 12px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
            display: 'flex', flexDirection: 'column', gap: 14,
          }}
        >
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', letterSpacing: '0.04em', margin: 0 }}>
            Settings
          </p>

          {/* Theme */}
          <section style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-dim)', fontWeight: 600 }}>
              Theme
            </span>
            <button
              onClick={toggle}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '7px 10px',
                borderRadius: 10,
                background: 'var(--surface-mid)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                cursor: 'pointer',
                fontSize: 13, fontWeight: 600,
                width: '100%',
              }}
            >
              <span>{isDark ? '🌙  Dark' : '☀️  Light'}</span>
              <span style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 500 }}>tap</span>
            </button>
          </section>

          {/* Accent */}
          <section style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-dim)', fontWeight: 600 }}>
              Accent Color
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              {ACCENT_OPTIONS.map(opt => {
                const active = accent === opt.key
                return (
                  <button
                    key={opt.key}
                    onClick={() => setAccent(opt.key as AccentKey)}
                    title={opt.label}
                    style={{
                      width: 26, height: 26,
                      borderRadius: '50%',
                      background: opt.swatch,
                      border: active ? '2px solid var(--text)' : '2px solid transparent',
                      outline: active ? `2px solid ${opt.swatch}` : 'none',
                      outlineOffset: 2,
                      cursor: 'pointer',
                      transform: active ? 'scale(1.18)' : 'scale(1)',
                      transition: 'transform 0.12s, outline 0.12s',
                      flexShrink: 0,
                    }}
                  />
                )
              })}
            </div>
          </section>

          {/* About */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            <Link
              href="/about"
              onClick={() => setOpen(false)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '7px 10px',
                borderRadius: 10,
                background: 'var(--surface-mid)',
                border: '1px solid var(--border)',
                color: 'var(--text-muted)',
                fontSize: 13, fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              <span>ℹ️  About</span>
              <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" style={{ opacity: 0.4, flexShrink: 0 }} aria-hidden="true">
                <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
              </svg>
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
