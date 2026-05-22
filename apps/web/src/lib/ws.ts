import type { ClientEvent, ServerEvent } from '@playing-cards/shared'

const WORKER_URL = process.env.NEXT_PUBLIC_WORKER_URL || 'http://localhost:8787'

export function getWorkerUrl(): string {
  return WORKER_URL
}

export function getWsUrl(roomCode: string, playerId?: string): string {
  const base = WORKER_URL.replace(/^http/, 'ws')
  const params = playerId ? `?playerId=${playerId}` : ''
  return `${base}/api/rooms/${roomCode}/ws${params}`
}

export type MessageHandler = (event: ServerEvent) => void
export type StatusHandler = (status: 'connecting' | 'connected' | 'disconnected') => void

export class RoomSocket {
  private ws: WebSocket | null = null
  private roomCode: string
  private playerId: string
  private onMessage: MessageHandler
  private onStatus: StatusHandler
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private dead = false

  constructor(roomCode: string, playerId: string, onMessage: MessageHandler, onStatus: StatusHandler) {
    this.roomCode = roomCode
    this.playerId = playerId
    this.onMessage = onMessage
    this.onStatus = onStatus
  }

  connect(): void {
    if (this.dead) return
    this.onStatus('connecting')

    const url = getWsUrl(this.roomCode, this.playerId)
    this.ws = new WebSocket(url)

    this.ws.onopen = () => {
      this.onStatus('connected')
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer)
        this.reconnectTimer = null
      }
    }

    this.ws.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as ServerEvent
        this.onMessage(event)
      } catch {
        // ignore malformed
      }
    }

    this.ws.onclose = () => {
      if (!this.dead) {
        this.onStatus('disconnected')
        this.scheduleReconnect()
      }
    }

    this.ws.onerror = () => {
      this.ws?.close()
    }
  }

  send(event: ClientEvent): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(event))
    }
  }

  close(): void {
    this.dead = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.ws?.close()
  }

  private scheduleReconnect(): void {
    this.reconnectTimer = setTimeout(() => {
      this.connect()
    }, 2000)
  }
}
