'use client'

import { useState, useEffect } from 'react'

const GRACE_PERIOD_SEC = 15

export function DisconnectTimer({ disconnectedAt }: { disconnectedAt: number }) {
  const calc = () => Math.max(0, GRACE_PERIOD_SEC - Math.floor((Date.now() - disconnectedAt) / 1000))
  const [remaining, setRemaining] = useState(calc)

  useEffect(() => {
    const id = setInterval(() => setRemaining(calc), 500)
    return () => clearInterval(id)
  }, [disconnectedAt]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <span
      className="text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-full"
      style={{
        color: '#fc8181',
        background: 'rgba(239,68,68,0.12)',
        border: '1px solid rgba(239,68,68,0.25)',
      }}
    >
      leaving {remaining}s
    </span>
  )
}
