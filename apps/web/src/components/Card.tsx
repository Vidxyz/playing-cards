'use client'

import type { Card as CardType } from '@playing-cards/shared'

const SUIT_SYMBOL: Record<string, string> = {
  spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣',
}
const RED_SUITS = new Set(['hearts', 'diamonds'])

interface Props {
  card: CardType
  faceDown?: boolean
  selected?: boolean
  size?: 'xs' | 'sm' | 'md' | 'lg'
  animate?: 'deal' | 'flip' | 'slide' | null
  onClick?: () => void
  className?: string
  style?: React.CSSProperties
}

const SIZE = {
  xs: { w: 28,  h: 40,  rank: 8,  suit: 14, corner: 7  },
  sm: { w: 40,  h: 58,  rank: 10, suit: 20, corner: 9  },
  md: { w: 58,  h: 86,  rank: 12, suit: 28, corner: 10 },
  lg: { w: 80,  h: 116, rank: 14, suit: 42, corner: 12 },
}

export function Card({ card, faceDown, selected, size = 'md', animate, onClick, className = '', style }: Props) {
  const isFaceDown = faceDown || card.id.includes('__facedown') || card.id.startsWith('hidden_')
  const s = SIZE[size]
  const isRed = !isFaceDown && RED_SUITS.has(card.suit)

  const animClass = animate === 'deal' ? 'card-deal'
    : animate === 'flip' ? 'card-flip'
    : animate === 'slide' ? 'card-slide'
    : ''

  const liftStyle: React.CSSProperties = selected
    ? { transform: 'translateY(-14px)', outline: '2px solid var(--accent)', outlineOffset: '2px' }
    : {}

  const cardStyle: React.CSSProperties = {
    width: s.w,
    height: s.h,
    borderRadius: 'var(--radius-card)',
    flexShrink: 0,
    position: 'relative',
    cursor: onClick ? 'pointer' : 'default',
    userSelect: 'none',
    transition: 'transform 0.15s ease, outline 0.1s ease',
    boxShadow: 'var(--card-shadow)',
    border: 'var(--card-border)',
    ...liftStyle,
    ...style,
  }

  if (isFaceDown) {
    return (
      <div
        onClick={onClick}
        className={`${animClass} ${className}`}
        style={{
          ...cardStyle,
          background: 'linear-gradient(145deg, #1e3560 0%, #243f72 40%, #1a2d54 100%)',
        }}
      >
        {/* Subtle diamond pattern */}
        <div style={{
          position: 'absolute', inset: 5, borderRadius: 6, opacity: 0.18,
          backgroundImage: 'repeating-linear-gradient(45deg,#fff 0,#fff 1px,transparent 0,transparent 6px)',
          backgroundSize: '8px 8px',
        }} />
        <div style={{
          position: 'absolute', inset: 5, borderRadius: 6,
          border: '1px solid rgba(255,255,255,0.12)',
        }} />
      </div>
    )
  }

  const rank = card.rank
  const suit = SUIT_SYMBOL[card.suit] || card.suit
  const color = isRed ? 'var(--card-red)' : 'var(--card-black)'

  return (
    <div
      onClick={onClick}
      className={`${animClass} ${className}`}
      style={{ ...cardStyle, background: 'var(--card-white)', color }}
    >
      {/* Top-left corner */}
      <div style={{
        position: 'absolute', top: 4, left: 5,
        fontSize: s.corner, fontWeight: 700, lineHeight: 1.1,
      }}>
        <div>{rank}</div>
        <div style={{ fontSize: s.corner - 1 }}>{suit}</div>
      </div>

      {/* Centre suit */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: s.suit,
      }}>
        {suit}
      </div>

      {/* Bottom-right corner (rotated) */}
      <div style={{
        position: 'absolute', bottom: 4, right: 5,
        fontSize: s.corner, fontWeight: 700, lineHeight: 1.1,
        transform: 'rotate(180deg)',
      }}>
        <div>{rank}</div>
        <div style={{ fontSize: s.corner - 1 }}>{suit}</div>
      </div>
    </div>
  )
}
