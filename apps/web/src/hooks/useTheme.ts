'use client'

import { useEffect, useState } from 'react'

type Theme = 'dark' | 'light'

export function useTheme() {
  const [theme, setTheme] = useState<Theme>('dark')

  // Read the theme that the inline script may have already applied
  useEffect(() => {
    const applied = document.documentElement.getAttribute('data-theme')
    setTheme(applied === 'light' ? 'light' : 'dark')
  }, [])

  const toggle = () => {
    setTheme(prev => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark'
      try { localStorage.setItem('theme', next) } catch { /* private mode */ }
      if (next === 'light') {
        document.documentElement.setAttribute('data-theme', 'light')
      } else {
        document.documentElement.removeAttribute('data-theme')
      }
      return next
    })
  }

  return { theme, toggle, isDark: theme === 'dark' }
}
