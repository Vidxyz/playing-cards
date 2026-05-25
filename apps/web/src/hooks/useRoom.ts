'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { GameState, ClientEvent, ServerEvent, GameAction } from '@playing-cards/shared'
import { RoomSocket } from '@/lib/ws'

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected'

export interface PeekResult {
  cardId: string
  zoneId: string
  rank: string
  suit: string
}

export function useRoom(roomCode: string, playerId: string, playerName: string) {
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const [lastAction, setLastAction] = useState<GameAction | null>(null)
  const [peekResults, setPeekResults] = useState<PeekResult[]>([])
  // Initial-deal peeks for Cambio: held until the player taps "ready", then shown for 3s client-side
  const [initialPeeks, setInitialPeeks] = useState<PeekResult[]>([])
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const socketRef = useRef<RoomSocket | null>(null)
  const joinedRef = useRef(false)

  const handleMessage = useCallback((event: ServerEvent) => {
    if (event.type === 'state') {
      setGameState(event.state)
      if (event.state.lastAction) {
        setLastAction(event.state.lastAction)
      }
    } else if (event.type === 'action') {
      setLastAction(event.action)
    } else if (event.type === 'error') {
      setErrorMsg(event.message)
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
      errorTimerRef.current = setTimeout(() => setErrorMsg(null), 3000)
    } else if (event.type === 'peek_result') {
      const entry: PeekResult = { cardId: event.cardId, zoneId: event.zoneId, rank: event.rank, suit: event.suit }
      if (event.fromInitialDeal) {
        // Hold without a timer — CambioBoard manages the 3s countdown on user interaction
        setInitialPeeks(prev => [
          ...prev.filter(p => p.zoneId !== entry.zoneId),
          entry,
        ])
      } else {
        setPeekResults(prev => [
          ...prev.filter(p => !(p.cardId === entry.cardId && p.zoneId === entry.zoneId)),
          entry,
        ])
        const duration = event.duration ?? 5000
        setTimeout(() => {
          setPeekResults(prev => prev.filter(p => !(p.cardId === entry.cardId && p.zoneId === entry.zoneId)))
        }, duration)
      }
    } else if (event.type === 'kicked') {
      // Persist informational reasons (disconnect, expiry) so home page can show them.
      // 'Game ended by host' is intentional — no notification needed.
      if (event.reason && event.reason !== 'Game ended by host') {
        try { sessionStorage.setItem('kicked_reason', event.reason) } catch {}
      }
      window.location.href = '/'
    }
  }, [])

  const handleStatus = useCallback((s: ConnectionStatus) => {
    setStatus(s)
    if (s === 'disconnected') {
      joinedRef.current = false
    }
    if (s === 'connected' && !joinedRef.current) {
      joinedRef.current = true
      socketRef.current?.send({ type: 'join', name: playerName })
    }
  }, [playerName])

  useEffect(() => {
    const socket = new RoomSocket(roomCode, playerId, handleMessage, handleStatus)
    socketRef.current = socket
    socket.connect()

    return () => {
      socket.close()
      socketRef.current = null
      joinedRef.current = false
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
    }
  }, [roomCode, playerId, handleMessage, handleStatus])

  const send = useCallback((event: ClientEvent) => {
    socketRef.current?.send(event)
  }, [])

  const clearInitialPeeks = useCallback(() => setInitialPeeks([]), [])

  return { gameState, status, lastAction, peekResults, initialPeeks, clearInitialPeeks, send, errorMsg }
}
