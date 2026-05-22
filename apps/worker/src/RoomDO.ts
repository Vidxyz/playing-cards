import type {
  GameState, GamePhase, Player, Team, Zone, Card, Suit,
  ClientEvent, ServerEvent, GameAction
} from '@playing-cards/shared'
import { buildDeck, shuffle } from './game/deck'
import { buildZones, dealCards } from './game/deal'
import { getConfig } from './game/zones'

interface Session {
  ws: WebSocket
  playerId: string
}

function generateRoomCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 11)
}

const ROOM_TTL_MS = 4 * 60 * 60 * 1000 // 4 hours

export class RoomDO implements DurableObject {
  private sessions: Map<string, Session> = new Map()
  private state: DurableObjectState
  private gameState: GameState | null = null
  private drawPile: Card[] = []

  constructor(state: DurableObjectState) {
    this.state = state
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    // WebSocket upgrade
    if (request.headers.get('Upgrade') === 'websocket') {
      const playerId = url.searchParams.get('playerId') || generateId()
      const pair = new WebSocketPair()
      const [client, server] = Object.values(pair)

      this.state.acceptWebSocket(server, [playerId])

      // Refresh expiry alarm
      await this.state.storage.setAlarm(Date.now() + ROOM_TTL_MS)

      return new Response(null, { status: 101, webSocket: client })
    }

    // Called by POST /api/rooms immediately after room code is generated —
    // creates empty lobby state so the room "exists" before Player 1 connects via WS.
    if (url.pathname.endsWith('/init') && request.method === 'POST') {
      const code = url.searchParams.get('code') || generateRoomCode()
      if (!this.gameState) {
        const gs: GameState = {
          roomCode: code,
          hostId: '',           // set to real playerId when first player joins via WS
          gameType: null,
          phase: 'lobby',
          players: [],
          teams: [],
          zones: [],
          drawPileCount: 0,
          currentTurnPlayerId: null,
          turnOrder: [],
          roundNumber: 0,
          trumpSuit: null,
          lastAction: null,
          bluffReveal: null,
          lastBluffBatch: null,
          bluffPassCount: 0,
        }
        await this.saveState(gs)
        await this.state.storage.setAlarm(Date.now() + ROOM_TTL_MS)
      }
      return new Response('OK', { status: 200 })
    }

    if (url.pathname.endsWith('/state')) {
      const gs = await this.loadState()
      return new Response(JSON.stringify(gs), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response('Not found', { status: 404 })
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const tags = this.state.getTags(ws)
    const playerId = tags[0]
    if (!playerId) return

    let event: ClientEvent
    try {
      event = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message))
    } catch {
      this.sendTo(ws, { type: 'error', message: 'Invalid JSON' })
      return
    }

    await this.handleEvent(playerId, ws, event)
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const tags = this.state.getTags(ws)
    const playerId = tags[0]
    if (!playerId) return

    this.sessions.delete(playerId)

    const gs = await this.loadState()
    if (!gs) return

    const player = gs.players.find(p => p.id === playerId)
    if (player) {
      player.isConnected = false
      await this.saveState(gs)
      await this.broadcast({ type: 'state', state: this.redactFor('') }, null)
    }
  }

  async alarm(): Promise<void> {
    // Room expired — kick everyone and clear storage
    await this.broadcast({ type: 'kicked', reason: 'Room expired' }, null)
    await this.state.storage.deleteAll()
  }

  private async handleEvent(playerId: string, ws: WebSocket, event: ClientEvent): Promise<void> {
    if (event.type === 'join') {
      await this.handleJoin(playerId, ws, event.name)
      return
    }

    const gs = await this.loadState()
    if (!gs) {
      this.sendTo(ws, { type: 'error', message: 'Room not initialised' })
      return
    }

    const player = gs.players.find(p => p.id === playerId)
    if (!player) {
      this.sendTo(ws, { type: 'error', message: 'Player not found' })
      return
    }

    switch (event.type) {
      case 'ready':
        player.isReady = !player.isReady
        break

      case 'set_game':
        if (!player.isHost) return
        gs.gameType = event.gameType
        break

      case 'start_deal':
        if (!player.isHost) return
        await this.handleDeal(gs)
        return

      case 'play_cards':
        this.handlePlayCards(gs, player, event.cardIds, event.toZoneId, event.claim)
        break

      case 'move_card':
        this.handleMoveCard(gs, player, event.cardId, event.fromZoneId, event.toZoneId)
        break

      case 'draw_card':
        this.handleDrawCard(gs, player, event.toZoneId)
        break

      case 'flip_card':
        this.handleFlipCard(gs, player, event.cardId, event.zoneId)
        break

      case 'call_bluff':
        await this.handleCallBluff(gs, player)
        return

      case 'resolve_bluff':
        if (!player.isHost) return
        this.handleResolveBluff(gs, event.bluffSucceeded)
        break

      case 'pass_turn':
        if (gs.gameType === 'bluff') {
          const bluffZone = gs.zones.find(z => z.isBluffPile)
          if (bluffZone && bluffZone.cards.length > 0 && gs.lastBluffBatch) {
            gs.bluffPassCount++
            if (gs.bluffPassCount >= gs.turnOrder.length - 1) {
              this.handleBluffPassClear(gs, playerId)
              break
            }
          }
        }
        this.advanceTurn(gs)
        gs.lastAction = { type: 'pass', playerId, timestamp: Date.now() }
        break

      case 'fold':
        player.isFolded = true
        gs.lastAction = { type: 'fold', playerId, timestamp: Date.now() }
        break

      case 'next_round':
        if (!player.isHost) return
        await this.handleNextRound(gs)
        return

      case 'end_game':
        if (!player.isHost) return
        await this.broadcast({ type: 'kicked', reason: 'Game ended by host' }, null)
        await this.state.storage.deleteAll()
        return

      case 'set_trump':
        if (!player.isHost) return
        gs.trumpSuit = event.suit
        break

      case 'assign_seat':
        if (!player.isHost) return
        this.handleAssignSeat(gs, event.playerId, event.seatIndex)
        break

      case 'update_score':
        this.handleUpdateScore(gs, event.targetId, event.delta, event.targetType)
        break

      case 'peek_card':
        await this.handlePeekCard(gs, player, ws, event.cardId, event.zoneId)
        return
    }

    await this.saveState(gs)
    await this.broadcastState(gs)
  }

  private async handleJoin(playerId: string, ws: WebSocket, name: string): Promise<void> {
    // Register session
    this.sessions.set(playerId, { ws, playerId })

    let gs = await this.loadState()

    if (!gs) {
      // First player — create room
      const roomCode = await this.state.storage.get<string>('roomCode') || generateRoomCode()
      await this.state.storage.put('roomCode', roomCode)

      gs = {
        roomCode,
        hostId: playerId,
        gameType: null,
        phase: 'lobby',
        players: [],
        teams: [],
        zones: [],
        drawPileCount: 0,
        currentTurnPlayerId: null,
        turnOrder: [],
        roundNumber: 0,
        trumpSuit: null,
        lastAction: null,
        bluffReveal: null,
        lastBluffBatch: null,
        bluffPassCount: 0,
      }
    }

    // First real player — claim host slot that /init left blank
    if (gs.players.length === 0 && !gs.hostId) {
      gs.hostId = playerId
    }

    let player = gs.players.find(p => p.id === playerId)
    if (!player) {
      player = {
        id: playerId,
        name,
        seatIndex: gs.players.length,
        teamId: null,
        isHost: gs.hostId === playerId,
        isConnected: true,
        isReady: false,
        isFolded: false,
        trickCount: 0,
        roundScore: 0,
        totalScore: 0,
      }
      gs.players.push(player)
    } else {
      player.isConnected = true
      player.name = name
    }

    await this.saveState(gs)

    // Send full state to the joining player
    this.sendTo(ws, { type: 'state', state: this.redactFor(playerId) })

    // Notify others
    await this.broadcastState(gs, playerId)
  }

  private async handleDeal(gs: GameState): Promise<void> {
    if (!gs.gameType) return

    const config = getConfig(gs.gameType)
    if (!config) return

    gs.phase = 'dealing'

    // Build and shuffle deck
    const deck = shuffle(buildDeck(config.deckFilter))

    // Build zones from templates
    gs.zones = buildZones(config, gs.players)

    // Deal cards
    const { zones, remaining } = dealCards(deck, gs.zones, config, gs.players)
    gs.zones = zones
    this.drawPile = remaining
    gs.drawPileCount = remaining.length

    // Set up teams for Euchre
    if (config.hasTeams && gs.teams.length === 0) {
      gs.teams = [
        { id: 'team-a', name: 'Team A', seatIndices: [0, 2], roundScore: 0, totalScore: 0 },
        { id: 'team-b', name: 'Team B', seatIndices: [1, 3], roundScore: 0, totalScore: 0 },
      ]
      for (const player of gs.players) {
        const teamA = gs.teams[0].seatIndices.includes(player.seatIndex)
        player.teamId = teamA ? 'team-a' : 'team-b'
      }
    }

    // Turn order
    gs.turnOrder = gs.players.map(p => p.id)
    gs.currentTurnPlayerId = gs.turnOrder[0]
    gs.roundNumber++
    gs.phase = 'playing'
    gs.lastAction = { type: 'deal', playerId: gs.hostId, timestamp: Date.now() }

    await this.saveState(gs)
    await this.broadcastState(gs)
  }

  private handlePlayCards(gs: GameState, player: Player, cardIds: string[], toZoneId: string, claim?: string): void {
    const fromZoneId = this.findCardZone(gs, cardIds[0], player.id)
    if (!fromZoneId) return

    const fromZone = gs.zones.find(z => z.id === fromZoneId)
    const toZone = gs.zones.find(z => z.id === toZoneId)
    if (!fromZone || !toZone) return

    const cards: Card[] = []
    for (const cardId of cardIds) {
      const idx = fromZone.cards.findIndex(c => c.id === cardId)
      if (idx === -1) continue
      cards.push(...fromZone.cards.splice(idx, 1))
    }

    toZone.cards.push(...cards)

    if (toZone.isBluffPile) {
      gs.lastBluffBatch = { cardIds: cards.map(c => c.id), submitterId: player.id }
      gs.bluffPassCount = 0
    }

    gs.lastAction = {
      type: 'play',
      playerId: player.id,
      cardIds,
      fromZoneId,
      toZoneId,
      timestamp: Date.now(),
    }

    this.advanceTurn(gs)
  }

  private handleMoveCard(gs: GameState, _player: Player, cardId: string, fromZoneId: string, toZoneId: string): void {
    const fromZone = gs.zones.find(z => z.id === fromZoneId)
    const toZone = gs.zones.find(z => z.id === toZoneId)
    if (!fromZone || !toZone) return

    const idx = fromZone.cards.findIndex(c => c.id === cardId)
    if (idx === -1) return

    const [card] = fromZone.cards.splice(idx, 1)
    toZone.cards.push(card)

    gs.lastAction = { type: 'move', playerId: _player.id, cardIds: [cardId], fromZoneId, toZoneId, timestamp: Date.now() }
  }

  private handleDrawCard(gs: GameState, player: Player, toZoneId: string): void {
    if (this.drawPile.length === 0) return

    const toZone = gs.zones.find(z => z.id === toZoneId)
    if (!toZone) return

    const card = this.drawPile.shift()!
    toZone.cards.push(card)
    gs.drawPileCount = this.drawPile.length

    gs.lastAction = { type: 'draw', playerId: player.id, toZoneId, timestamp: Date.now() }
  }

  private handleFlipCard(gs: GameState, player: Player, cardId: string, zoneId: string): void {
    const zone = gs.zones.find(z => z.id === zoneId)
    if (!zone) return

    const card = zone.cards.find(c => c.id === cardId)
    if (!card) return

    // Toggle face-down tag
    if (card.id.endsWith('__facedown')) {
      card.id = card.id.replace('__facedown', '')
    } else {
      card.id = `${card.id}__facedown`
    }

    gs.lastAction = { type: 'flip', playerId: player.id, cardIds: [cardId], toZoneId: zoneId, timestamp: Date.now() }
  }

  private async handleCallBluff(gs: GameState, player: Player): Promise<void> {
    const bluffZone = gs.zones.find(z => z.isBluffPile)
    if (!bluffZone || bluffZone.cards.length === 0) return
    if (gs.bluffReveal) return  // already awaiting resolution

    const batch = gs.lastBluffBatch
    if (!batch) return

    // Find the actual cards in the last batch (may have shifted if pile was disturbed)
    const revealedCards = bluffZone.cards.filter(c => batch.cardIds.includes(c.id))
    if (revealedCards.length === 0) return

    gs.bluffReveal = {
      cards: revealedCards,        // real values — broadcast to everyone
      submitterId: batch.submitterId,
      callerId: player.id,
    }

    gs.lastAction = {
      type: 'bluff_reveal',
      playerId: player.id,
      cardIds: revealedCards.map(c => c.id),
      toZoneId: bluffZone.id,
      timestamp: Date.now(),
    }

    await this.saveState(gs)
    await this.broadcastState(gs)
  }

  private handleResolveBluff(gs: GameState, bluffSucceeded: boolean): void {
    const reveal = gs.bluffReveal
    if (!reveal) return

    const bluffZone = gs.zones.find(z => z.isBluffPile)
    if (!bluffZone) return

    // bluffSucceeded = the caller was RIGHT (submitter was lying)
    //   → pile goes back to the submitter as punishment
    // bluffSucceeded = false (caller was wrong, submitter was honest)
    //   → caller takes the entire pile
    const recipientId = bluffSucceeded ? reveal.submitterId : reveal.callerId
    const handZone = gs.zones.find(z => z.id === `hand-${recipientId}`)

    if (handZone) {
      handZone.cards.push(...bluffZone.cards)
      bluffZone.cards = []
      bluffZone.claimLabel = null
    }

    gs.bluffReveal = null
    gs.lastBluffBatch = null
    gs.bluffPassCount = 0
    gs.lastAction = {
      type: 'move',
      playerId: gs.hostId,
      toZoneId: `hand-${recipientId}`,
      timestamp: Date.now(),
    }
  }

  private handleBluffPassClear(gs: GameState, passingPlayerId: string): void {
    const bluffZone = gs.zones.find(z => z.isBluffPile)
    if (bluffZone) {
      bluffZone.cards = []
      bluffZone.claimLabel = null
    }
    // Last submitter starts fresh; fall back to first in order if somehow null
    gs.currentTurnPlayerId = gs.lastBluffBatch?.submitterId ?? gs.turnOrder[0] ?? null
    gs.bluffPassCount = 0
    gs.lastBluffBatch = null
    gs.lastAction = { type: 'pass', playerId: passingPlayerId, timestamp: Date.now() }
  }

  private async handleNextRound(gs: GameState): Promise<void> {
    // Accumulate scores
    for (const player of gs.players) {
      player.totalScore += player.roundScore
      player.roundScore = 0
      player.trickCount = 0
      player.isFolded = false
    }
    for (const team of gs.teams) {
      team.totalScore += team.roundScore
      team.roundScore = 0
    }

    gs.phase = 'lobby'
    gs.zones = []
    gs.turnOrder = []
    gs.currentTurnPlayerId = null
    gs.trumpSuit = null
    gs.lastAction = null
    gs.bluffReveal = null
    gs.lastBluffBatch = null
    gs.bluffPassCount = 0

    for (const player of gs.players) {
      player.isReady = false
    }

    await this.saveState(gs)
    await this.broadcastState(gs)
  }

  private handleAssignSeat(gs: GameState, targetPlayerId: string, seatIndex: number): void {
    const target = gs.players.find(p => p.id === targetPlayerId)
    if (!target) return

    // Swap with whoever is in that seat
    const current = gs.players.find(p => p.seatIndex === seatIndex)
    if (current) current.seatIndex = target.seatIndex

    target.seatIndex = seatIndex
    gs.players.sort((a, b) => a.seatIndex - b.seatIndex)
  }

  private handleUpdateScore(gs: GameState, targetId: string, delta: number, targetType: 'player' | 'team'): void {
    if (targetType === 'player') {
      const player = gs.players.find(p => p.id === targetId)
      if (player) player.roundScore += delta
    } else {
      const team = gs.teams.find(t => t.id === targetId)
      if (team) team.roundScore += delta
    }
  }

  private async handlePeekCard(gs: GameState, player: Player, ws: WebSocket, cardId: string, zoneId: string): Promise<void> {
    const zone = gs.zones.find(z => z.id === zoneId)
    if (!zone) return
    if (zone.ownerId !== player.id) return // can only peek own cards in Cambio initial phase

    const card = zone.cards.find(c => c.id === cardId)
    if (!card) return

    // Send peek result only to this player
    this.sendTo(ws, {
      type: 'peek_result',
      cardId,
      zoneId,
      rank: card.rank,
      suit: card.suit,
    })
  }

  private advanceTurn(gs: GameState): void {
    if (gs.turnOrder.length === 0) return
    const idx = gs.turnOrder.indexOf(gs.currentTurnPlayerId ?? '')
    const next = (idx + 1) % gs.turnOrder.length
    gs.currentTurnPlayerId = gs.turnOrder[next]
  }

  private findCardZone(gs: GameState, cardId: string, playerId: string): string | null {
    // Look in player's own zones first
    for (const zone of gs.zones) {
      if (zone.ownerId === playerId && zone.cards.some(c => c.id === cardId)) {
        return zone.id
      }
    }
    // Then shared zones
    for (const zone of gs.zones) {
      if (!zone.ownerId && zone.cards.some(c => c.id === cardId)) {
        return zone.id
      }
    }
    return null
  }

  // Redact card values the given player shouldn't see
  private redactFor(playerId: string): GameState {
    const gs = this.gameState
    if (!gs) return null as unknown as GameState

    const redacted: GameState = {
      ...gs,
      drawPileCount: this.drawPile.length,
      zones: gs.zones.map(zone => {
        const canSee =
          zone.visibility === 'face-up' ||
          (zone.visibility === 'owner-only' && zone.ownerId === playerId)

        if (canSee) return zone

        // Face-down or owner-only of another player — redact card values but keep count
        return {
          ...zone,
          cards: zone.cards.map(c => ({
            id: c.id.includes('__facedown') ? c.id : `hidden_${c.id}`,
            rank: '2' as const,
            suit: 'spades' as const,
          })),
        }
      }),
    }

    return redacted
  }

  private sendTo(ws: WebSocket, event: ServerEvent): void {
    try {
      ws.send(JSON.stringify(event))
    } catch {
      // Connection closed
    }
  }

  private async broadcast(event: ServerEvent, excludePlayerId: string | null): Promise<void> {
    const sockets = this.state.getWebSockets()
    for (const ws of sockets) {
      const tags = this.state.getTags(ws)
      const pid = tags[0]
      if (pid === excludePlayerId) continue
      this.sendTo(ws, event)
    }
  }

  private async broadcastState(gs: GameState, excludePlayerId?: string): Promise<void> {
    const sockets = this.state.getWebSockets()
    for (const ws of sockets) {
      const tags = this.state.getTags(ws)
      const pid = tags[0]
      if (pid === excludePlayerId) continue
      this.sendTo(ws, { type: 'state', state: this.redactFor(pid) })
    }
  }

  private async loadState(): Promise<GameState | null> {
    if (this.gameState) return this.gameState
    const stored = await this.state.storage.get<{ gs: GameState; pile: Card[] }>('room')
    if (stored) {
      this.gameState = stored.gs
      this.drawPile = stored.pile
    }
    return this.gameState
  }

  private async saveState(gs: GameState): Promise<void> {
    this.gameState = gs
    await this.state.storage.put('room', { gs, pile: this.drawPile })
  }
}
