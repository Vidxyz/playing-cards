'use client'

import { useEffect, useState } from 'react'

export type AccentKey = 'amber' | 'blue' | 'green' | 'purple' | 'rose' | 'cyan' | 'orange' | 'fuchsia' | 'teal'

export const ACCENT_OPTIONS: { key: AccentKey; label: string; swatch: string }[] = [
  { key: 'amber',   label: 'Amber',   swatch: '#f59e0b' },
  { key: 'orange',  label: 'Orange',  swatch: '#f97316' },
  { key: 'rose',    label: 'Rose',    swatch: '#f43f5e' },
  { key: 'fuchsia', label: 'Fuchsia', swatch: '#e879f9' },
  { key: 'purple',  label: 'Purple',  swatch: '#a855f7' },
  { key: 'blue',    label: 'Blue',    swatch: '#3b82f6' },
  { key: 'cyan',    label: 'Cyan',    swatch: '#22d3ee' },
  { key: 'teal',    label: 'Teal',    swatch: '#2dd4bf' },
  { key: 'green',   label: 'Green',   swatch: '#22c55e' },
]

function applyAccent(key: AccentKey) {
  if (key === 'amber') {
    document.documentElement.removeAttribute('data-accent')
  } else {
    document.documentElement.setAttribute('data-accent', key)
  }
}

export function useAccent() {
  const [accent, setAccentState] = useState<AccentKey>('amber')

  useEffect(() => {
    try {
      const saved = localStorage.getItem('accent') as AccentKey | null
      if (saved && ACCENT_OPTIONS.some(o => o.key === saved)) {
        setAccentState(saved)
        applyAccent(saved)
      }
    } catch { /* private mode */ }
  }, [])

  function setAccent(key: AccentKey) {
    setAccentState(key)
    applyAccent(key)
    try { localStorage.setItem('accent', key) } catch { /* private mode */ }
  }

  return { accent, setAccent }
}
