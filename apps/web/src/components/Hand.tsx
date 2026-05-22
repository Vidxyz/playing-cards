'use client'

import { useState, useCallback, useEffect } from 'react'
import type { Zone, Card as CardType } from '@playing-cards/shared'
import { Card } from './Card'

interface Props {
  zone: Zone
  onPlayCards?: (cardIds: string[], toZoneId: string) => void
  targetZones: { id: string; name: string; isBluffPile: boolean }[]
  isMyTurn?: boolean
  gameType?: string
}

export function Hand({ zone, onPlayCards, targetZones, isMyTurn, gameType }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [targetZoneId, setTargetZoneId] = useState<string>(targetZones[0]?.id || '')
  const [arrangeMode, setArrangeMode] = useState(false)
  const [movingId, setMovingId] = useState<string | null>(null)
  const [customOrder, setCustomOrder] = useState<string[]>(() => zone.cards.map(c => c.id))

  useEffect(() => {
    const serverIds = zone.cards.map(c => c.id)
    setCustomOrder(prev => {
      const kept = prev.filter(id => serverIds.includes(id))
      const added = serverIds.filter(id => !prev.includes(id))
      return [...kept, ...added]
    })
  }, [zone.cards])

  const handleCardTap = useCallback((cardId: string) => {
    if (arrangeMode) {
      if (movingId === null) {
        setMovingId(cardId)
      } else if (movingId === cardId) {
        setMovingId(null)
      } else {
        setCustomOrder(prev => {
          const next = [...prev]
          const fromIdx = next.indexOf(movingId)
          const toIdx = next.indexOf(cardId)
          if (fromIdx !== -1 && toIdx !== -1) {
            ;[next[fromIdx], next[toIdx]] = [next[toIdx], next[fromIdx]]
          }
          return next
        })
        setMovingId(null)
      }
    } else {
      setSelected(prev => {
        const next = new Set(prev)
        if (next.has(cardId)) next.delete(cardId)
        else next.add(cardId)
        return next
      })
    }
  }, [arrangeMode, movingId])

  const handlePlay = useCallback(() => {
    if (selected.size === 0 || !targetZoneId) return
    onPlayCards?.([...selected], targetZoneId)
    setSelected(new Set())
  }, [selected, targetZoneId, onPlayCards])

  const orderedCards = customOrder
    .map(id => zone.cards.find(c => c.id === id))
    .filter((c): c is CardType => c !== undefined)

  const count = orderedCards.length
  const overlap = count <= 7 ? 28 : count <= 12 ? 42 : 54

  return (
    <div className="flex flex-col">
      {/* Fan of cards */}
      <div className="relative overflow-x-auto no-scrollbar px-4 py-2" style={{ minHeight: 136 }}>
        <div className="flex items-end" style={{ width: count > 0 ? 80 + (count - 1) * (80 - overlap) + 16 : 80 }}>
          {orderedCards.map((card, i) => (
            <div
              key={card.id}
              className="flex-shrink-0"
              style={{
                marginLeft: i === 0 ? 0 : -(overlap),
                zIndex: (arrangeMode ? movingId === card.id : selected.has(card.id)) ? 100 : i,
                position: 'relative',
              }}
            >
              <Card
                card={card}
                selected={arrangeMode ? movingId === card.id : selected.has(card.id)}
                animate="deal"
                size="lg"
                onClick={() => handleCardTap(card.id)}
              />
            </div>
          ))}
          {count === 0 && (
            <div style={{
              width: 80, height: 116, borderRadius: 'var(--radius-card)',
              border: '1.5px dashed rgba(255,255,255,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>empty</span>
            </div>
          )}
        </div>
      </div>

      {/* Arrange toggle */}
      <div className="flex items-center gap-2 px-4 pb-1">
        <button
          onClick={() => { setArrangeMode(a => !a); setMovingId(null); setSelected(new Set()) }}
          className="text-xs px-2.5 py-1 rounded-full transition-all active:scale-95"
          style={{
            background: arrangeMode ? 'var(--accent-dim)' : 'var(--surface-mid)',
            color: arrangeMode ? 'var(--accent)' : 'var(--text-muted)',
            border: '1px solid ' + (arrangeMode ? 'rgba(245,158,11,0.3)' : 'var(--border)'),
          }}
        >
          {arrangeMode ? 'Done' : 'Arrange'}
        </button>
        {arrangeMode && (
          <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
            {movingId ? 'Tap another card to swap' : 'Tap a card to pick up'}
          </span>
        )}
      </div>

      {/* Action panel — visible in play mode when cards are selected */}
      {!arrangeMode && selected.size > 0 && (
        <div className="px-4 pb-2 flex flex-col gap-2 card-slide">
          {targetZones.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
              {targetZones.map(z => (
                <button
                  key={z.id}
                  onClick={() => setTargetZoneId(z.id)}
                  className="px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all active:scale-95"
                  style={{
                    background: targetZoneId === z.id ? 'var(--accent)' : 'var(--surface-mid)',
                    color: targetZoneId === z.id ? '#000' : 'var(--text-muted)',
                    border: '1px solid ' + (targetZoneId === z.id ? 'var(--accent)' : 'var(--border-hi)'),
                  }}
                >
                  → {z.name}
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handlePlay}
              className="flex-1 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95"
              style={{ background: 'var(--accent)', color: '#000' }}
            >
              Play {selected.size} card{selected.size !== 1 ? 's' : ''}
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="px-4 py-2.5 rounded-xl text-sm transition-all active:scale-95"
              style={{ background: 'var(--surface-mid)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
