'use client'

import type { Zone as ZoneType, GameAction } from '@playing-cards/shared'
import { Card } from './Card'

interface Props {
  zone: ZoneType
  playerId: string
  lastAction?: GameAction | null
  onDraw?: () => void
  onFlipCard?: (cardId: string, zoneId: string) => void
  onCallBluff?: () => void
  isBluffRevealing?: boolean
  compact?: boolean
  flashWarn?: boolean
}

export function Zone({ zone, playerId, lastAction, onDraw, onFlipCard, onCallBluff, isBluffRevealing, compact, flashWarn }: Props) {
  const topCard = zone.cards[zone.cards.length - 1]
  const count = zone.cards.length
  const size = compact ? 'sm' : 'lg'

  const canSee =
    zone.visibility === 'face-up' ||
    (zone.visibility === 'owner-only' && zone.ownerId === playerId)
  const revealBluff = zone.isBluffPile && isBluffRevealing

  const wasJustPlayed = lastAction?.type === 'play' && lastAction.toZoneId === zone.id

  return (
    <div className="flex flex-col items-center gap-1.5">
      {/* Zone label */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-widest font-semibold"
          style={{ color: 'var(--text-dim)' }}>
          {zone.name}
        </span>
        {zone.claimLabel && !revealBluff && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
            style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid rgba(245,158,11,0.3)' }}>
            "{zone.claimLabel}"
          </span>
        )}
      </div>

      {/* Card stack */}
      <div
        className="relative"
        style={{
          width: compact ? 40 : 80,
          height: compact ? 58 : 116,
          borderRadius: 'var(--radius-card)',
          outline: flashWarn ? '2px solid rgba(239,68,68,0.8)' : undefined,
          outlineOffset: flashWarn ? '3px' : undefined,
          boxShadow: flashWarn ? '0 0 20px rgba(239,68,68,0.5)' : undefined,
          transition: 'outline 0.2s ease, box-shadow 0.2s ease',
        }}
        onClick={onDraw}
      >
        {count === 0 ? (
          <EmptySlot compact={compact} />
        ) : (
          <>
            {/* Depth shadow cards */}
            {count >= 3 && (
              <div style={{
                position: 'absolute', top: -3, left: -3, width: '100%', height: '100%',
                borderRadius: 'var(--radius-card)',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.06)',
              }} />
            )}
            {count >= 2 && (
              <div style={{
                position: 'absolute', top: -1.5, left: -1.5, width: '100%', height: '100%',
                borderRadius: 'var(--radius-card)',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.08)',
              }} />
            )}
            {/* Top card */}
            <div
              style={{ position: 'absolute', top: 0, left: 0 }}
              onClick={e => {
                if (onFlipCard && topCard) {
                  e.stopPropagation()
                  onFlipCard(topCard.id, zone.id)
                }
              }}
            >
              <Card
                card={topCard}
                faceDown={!canSee && !revealBluff}
                size={size}
                animate={wasJustPlayed ? 'slide' : undefined}
              />
            </div>

            {/* Count badge */}
            {count > 1 && (
              <div style={{
                position: 'absolute', top: -6, right: -6,
                background: 'var(--surface-hi)',
                border: '1px solid var(--border-hi)',
                color: 'var(--text)',
                fontSize: 9, fontWeight: 700,
                width: 16, height: 16, borderRadius: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 10,
              }}>
                {count > 99 ? '99+' : count}
              </div>
            )}
          </>
        )}
      </div>

      {/* Bluff call button */}
      {zone.isBluffPile && count > 0 && onCallBluff && (
        <button
          onClick={onCallBluff}
          className="text-[11px] font-bold px-3 py-1 rounded-full transition-all active:scale-95"
          style={{
            background: 'rgba(229,62,62,0.15)',
            border: '1px solid rgba(229,62,62,0.35)',
            color: '#fc8181',
          }}
        >
          Call Bluff
        </button>
      )}

      {/* Draw pile hint */}
      {onDraw && count > 0 && (
        <span className="text-[9px] uppercase tracking-widest" style={{ color: 'var(--text-dim)' }}>
          tap to draw
        </span>
      )}
    </div>
  )
}

function EmptySlot({ compact }: { compact?: boolean }) {
  return (
    <div style={{
      width: compact ? 40 : 80,
      height: compact ? 58 : 116,
      borderRadius: 'var(--radius-card)',
      border: '1.5px dashed rgba(255,255,255,0.1)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <span style={{ color: 'var(--text-dim)', fontSize: 10 }}>—</span>
    </div>
  )
}
