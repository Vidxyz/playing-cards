'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { GameState, ClientEvent, ServerEvent, GameAction } from '@playing-cards/shared'
import { RoomSocket } from '@/lib/ws'

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected'

interface PeekResult {
  cardId: string
  zoneId: string
  rank: string
  suit: string
}

export function useRoom(roomCode: string, playerId: string, playerName: string) {
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const [lastAction, setLastAction] = useState<GameAction | null>(null)
  const [peekResult, setPeekResult] = useState<PeekResult | null>(null)
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
    } else if (event.type === 'peek_result') {
      setPeekResult(event)
      // Auto-clear peek after 5 seconds
      setTimeout(() => setPeekResult(null), 5000)
    } else if (event.type === 'kicked') {
      window.location.href = '/?kicked=1'
    }
  }, [])

  const handleStatus = useCallback((s: ConnectionStatus) => {
    setStatus(s)
    if (s === 'disconnected') {
      // Reset so join event re-fires on reconnect
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
    }
  }, [roomCode, playerId, handleMessage, handleStatus])

  const send = useCallback((event: ClientEvent) => {
    socketRef.current?.send(event)
  }, [])

  return { gameState, status, lastAction, peekResult, send }
}
