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
          blackjackDealerId: null,
          cambioDrawn: null,
          cambioPower: null,
          cambioCaller: null,
          cambioFinalRound: false,
          cambioPeekSwapTarget: null,
          cambioJokers: 2,
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
        if (gs.gameType === 'cambio') {
          this.handleCambioDraw(gs, player)
        } else {
          this.handleDrawCard(gs, player, event.toZoneId)
        }
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

      case 'set_dealer':
        if (!player.isHost) return
        gs.blackjackDealerId = event.playerId
        break

      case 'set_cambio_jokers':
        if (!player.isHost) return
        gs.cambioJokers = event.count
        break

      case 'update_score':
        this.handleUpdateScore(gs, event.targetId, event.delta, event.targetType)
        break

      case 'peek_card':
        await this.handlePeekCard(gs, player, ws, event.cardId, event.zoneId)
        return

      case 'cambio_call':
        if (gs.gameType !== 'cambio') return
        this.handleCambioCall(gs, player)
        break

      case 'cambio_swap':
        if (gs.gameType !== 'cambio') return
        this.handleCambioSwap(gs, player, event.targetZoneId)
        break

      case 'cambio_discard_drawn':
        if (gs.gameType !== 'cambio') return
        this.handleCambioDiscardDrawn(gs, player, event.usePower !== false)
        break

      case 'cambio_power_peek':
        if (gs.gameType !== 'cambio') return
        await this.handleCambioPowerPeek(gs, player, ws, event.cardId, event.zoneId)
        return

      case 'cambio_power_swap':
        if (gs.gameType !== 'cambio') return
        this.handleCambioPowerSwap(gs, player, event.zoneId1, event.zoneId2)
        break

      case 'cambio_power_skip':
        if (gs.gameType !== 'cambio') return
        gs.cambioPower = null
        gs.cambioPeekSwapTarget = null
        this.advanceCambioTurn(gs)
        break

      case 'cambio_stick': {
        if (gs.gameType !== 'cambio') return
        const stickFail = this.handleCambioStick(gs, player, event.zoneId)
        await this.saveState(gs)
        await this.broadcastState(gs)
        if (stickFail) {
          // Broadcast the mistake card to all players briefly so everyone sees the error
          await this.broadcast({ type: 'peek_result', cardId: stickFail.cardId, zoneId: stickFail.zoneId, rank: stickFail.rank, suit: stickFail.suit, duration: 2500 }, null)
        }
        return
      }
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
        blackjackDealerId: null,
        cambioDrawn: null,
        cambioPower: null,
        cambioCaller: null,
        cambioFinalRound: false,
        cambioPeekSwapTarget: null,
        cambioJokers: 2,
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

    // Build and shuffle deck (inject joker count for Cambio)
    const deckFilter = gs.gameType === 'cambio'
      ? { ...config.deckFilter, jokerCount: gs.cambioJokers }
      : config.deckFilter
    const deck = shuffle(buildDeck(deckFilter))

    // Build zones from templates
    gs.zones = buildZones(config, gs.players)

    // Deal cards
    const { zones, remaining } = dealCards(deck, gs.zones, config, gs.players, gs.blackjackDealerId)
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
    // Blackjack: dealer plays last; default dealer to host if not assigned
    if (gs.gameType === 'blackjack') {
      const dealerId = gs.blackjackDealerId ?? gs.hostId
      gs.blackjackDealerId = dealerId
      const idx = gs.turnOrder.indexOf(dealerId)
      if (idx > 0) {
        gs.turnOrder.splice(idx, 1)
        gs.turnOrder.push(dealerId)
      }
    }
    gs.currentTurnPlayerId = gs.turnOrder[0]
    gs.roundNumber++
    gs.phase = 'playing'
    gs.lastAction = { type: 'deal', playerId: gs.hostId, timestamp: Date.now() }

    // Reset Cambio state from any prior round
    gs.cambioDrawn = null
    gs.cambioPower = null
    gs.cambioCaller = null
    gs.cambioFinalRound = false
    gs.cambioPeekSwapTarget = null

    await this.saveState(gs)
    await this.broadcastState(gs)

    // Cambio: send initial bottom-2 card peek — client controls the 3s reveal timer
    if (gs.gameType === 'cambio') {
      const sockets = this.state.getWebSockets()
      for (const ws of sockets) {
        const tags = this.state.getTags(ws)
        const pid = tags[0]
        if (!pid) continue
        for (const col of [0, 1]) {
          const zoneId = `pos-${pid}-1-${col}`
          const zone = gs.zones.find(z => z.id === zoneId)
          if (zone?.cards[0]) {
            const card = zone.cards[0]
            this.sendTo(ws, {
              type: 'peek_result',
              cardId: card.id,
              zoneId,
              rank: card.rank,
              suit: card.suit,
              fromInitialDeal: true,
            })
          }
        }
      }
    }
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

    // Blackjack: auto-advance on bust for player hands (not dealer-hand zone)
    if (gs.gameType === 'blackjack' && toZone.ownerId) {
      const value = this.bjHandValue(toZone.cards)
      if (value > 21) {
        player.isFolded = true
        this.advanceTurn(gs)
      }
    }
  }

  private bjHandValue(cards: Card[]): number {
    const visible = cards.filter(c => !c.id.endsWith('__facedown') && !c.id.startsWith('hidden_'))
    let sum = 0, aces = 0
    for (const c of visible) {
      if (c.rank === 'A') { aces++; sum += 11 }
      else if (['J', 'Q', 'K'].includes(c.rank)) sum += 10
      else sum += Number(c.rank)
    }
    while (sum > 21 && aces > 0) { sum -= 10; aces-- }
    return sum
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
      playerId: recipientId,
      fromZoneId: 'bluff-pile',
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
    gs.cambioDrawn = null
    gs.cambioPower = null
    gs.cambioCaller = null
    gs.cambioFinalRound = false
    gs.cambioPeekSwapTarget = null

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

  // ── Cambio mechanics ─────────────────────────────────────────

  private handleCambioDraw(gs: GameState, player: Player): void {
    if (gs.currentTurnPlayerId !== player.id) return
    if (gs.cambioDrawn) return
    if (this.drawPile.length === 0) this.reshuffleDiscardIntoDraw(gs)
    if (this.drawPile.length === 0) return
    const card = this.drawPile.shift()!
    gs.drawPileCount = this.drawPile.length
    gs.cambioDrawn = { card, fromDiscard: false }
    gs.lastAction = { type: 'draw', playerId: player.id, timestamp: Date.now() }
  }

  private handleCambioSwap(gs: GameState, player: Player, targetZoneId: string): void {
    if (gs.currentTurnPlayerId !== player.id) return
    if (!gs.cambioDrawn) return
    const targetZone = gs.zones.find(z => z.id === targetZoneId && z.ownerId === player.id)
    if (!targetZone || targetZone.cards.length === 0) return
    const discard = gs.zones.find(z => z.id === 'discard')
    if (!discard) return
    const oldCard = targetZone.cards.pop()!
    discard.cards.push(oldCard)
    targetZone.cards.push(gs.cambioDrawn.card)
    gs.cambioDrawn = null
    gs.lastAction = { type: 'play', playerId: player.id, toZoneId: targetZoneId, timestamp: Date.now() }
    this.advanceCambioTurn(gs)
  }

  private handleCambioDiscardDrawn(gs: GameState, player: Player, usePower: boolean): void {
    if (gs.currentTurnPlayerId !== player.id) return
    if (!gs.cambioDrawn) return
    const card = gs.cambioDrawn.card
    const discard = gs.zones.find(z => z.id === 'discard')
    if (!discard) return
    discard.cards.push(card)
    gs.cambioDrawn = null
    gs.lastAction = { type: 'play', playerId: player.id, toZoneId: 'discard', timestamp: Date.now() }
    if (!usePower) {
      this.advanceCambioTurn(gs)
      return
    }
    const rank = card.rank
    const suit = card.suit
    if (rank === '7' || rank === '8') {
      gs.cambioPower = 'peek-own'
    } else if (rank === '9' || rank === '10') {
      gs.cambioPower = 'peek-opponent'
    } else if (rank === 'J' || rank === 'Q') {
      gs.cambioPower = 'blind-swap'
    } else if (rank === 'K' && (suit === 'spades' || suit === 'clubs')) {
      gs.cambioPower = 'peek-swap'
    } else {
      this.advanceCambioTurn(gs)
    }
  }

  private async handleCambioPowerPeek(gs: GameState, player: Player, ws: WebSocket, cardId: string, zoneId: string): Promise<void> {
    if (gs.currentTurnPlayerId !== player.id) return
    const power = gs.cambioPower
    if (power !== 'peek-own' && power !== 'peek-opponent' && power !== 'peek-swap') return
    const zone = gs.zones.find(z => z.id === zoneId)
    if (!zone) return
    if (power === 'peek-own' && zone.ownerId !== player.id) return
    if (power === 'peek-opponent' && zone.ownerId === player.id) return
    // peek-swap (Black King): can peek any card — own or opponent, no restriction
    const realCardId = cardId.startsWith('hidden_') ? cardId.slice(7) : cardId
    const card = zone.cards.find(c => c.id === realCardId)
    if (!card) return
    this.sendTo(ws, { type: 'peek_result', cardId: realCardId, zoneId, rank: card.rank, suit: card.suit, duration: 3000 })
    if (power === 'peek-swap') {
      gs.cambioPower = 'peek-swap-ready'
      gs.cambioPeekSwapTarget = { cardId: realCardId, zoneId }
    } else {
      gs.cambioPower = null
      this.advanceCambioTurn(gs)
    }
    await this.saveState(gs)
    await this.broadcastState(gs)
  }

  private handleCambioPowerSwap(gs: GameState, player: Player, zoneId1: string, zoneId2?: string): void {
    if (gs.currentTurnPlayerId !== player.id) return
    const power = gs.cambioPower
    if (power !== 'blind-swap' && power !== 'peek-swap-ready') return

    let zone1Id: string, zone2Id: string

    if (power === 'blind-swap') {
      // J/Q: swap any two zones on the table (no ownership restriction)
      if (!zoneId2) return
      zone1Id = zoneId1
      zone2Id = zoneId2
    } else {
      // Black King peek-swap-ready: zoneId1 must be player's own card
      if (!gs.cambioPeekSwapTarget) return
      zone1Id = zoneId1
      zone2Id = gs.cambioPeekSwapTarget.zoneId
      const z1 = gs.zones.find(z => z.id === zone1Id)
      if (!z1 || z1.ownerId !== player.id) return
    }

    const zone1 = gs.zones.find(z => z.id === zone1Id)
    const zone2 = gs.zones.find(z => z.id === zone2Id)
    if (!zone1 || !zone2 || zone1.cards.length === 0 || zone2.cards.length === 0) return
    if (zone1Id === zone2Id) return

    const card1 = zone1.cards.pop()!
    const card2 = zone2.cards.pop()!
    zone1.cards.push(card2)
    zone2.cards.push(card1)
    gs.cambioPower = null
    gs.cambioPeekSwapTarget = null
    gs.lastAction = { type: 'move', playerId: player.id, fromZoneId: zone2Id, toZoneId: zone1Id, timestamp: Date.now() }
    this.advanceCambioTurn(gs)
  }

  private handleCambioStick(gs: GameState, player: Player, zoneId: string): { cardId: string; zoneId: string; rank: string; suit: string } | null {
    // Stick is always available when the discard pile has a card — anyone, any time
    const discard = gs.zones.find(z => z.id === 'discard')
    if (!discard || discard.cards.length === 0) return null
    const topCard = discard.cards[discard.cards.length - 1]
    const zone = gs.zones.find(z => z.id === zoneId && z.ownerId === player.id)
    if (!zone || zone.cards.length === 0) return null
    const stickerCard = zone.cards[0]

    if (this.cambioCardValue(stickerCard) === this.cambioCardValue(topCard)) {
      // Success: card goes to discard, player loses that slot
      zone.cards = []
      discard.cards.push(stickerCard)
      gs.lastAction = { type: 'stick_success', playerId: player.id, cardIds: [stickerCard.id], fromZoneId: zoneId, toZoneId: 'discard', timestamp: Date.now() }
      return null
    } else {
      // Wrong: player takes a penalty card from the draw pile into a new zone
      if (this.drawPile.length === 0) this.reshuffleDiscardIntoDraw(gs)
      if (this.drawPile.length > 0) {
        const penaltyCard = this.drawPile.shift()!
        gs.drawPileCount = this.drawPile.length
        // Place penalty card in the next grid slot (row 2+ for extras beyond the 2×2 grid)
        const playerPosZones = gs.zones.filter(z => z.ownerId === player.id && z.id.startsWith('pos-'))
        const extraZones = playerPosZones.filter(z => (z.gridPosition?.row ?? 0) >= 2)
        const nextIdx = extraZones.length
        const penaltyRow = 2 + Math.floor(nextIdx / 2)
        const penaltyCol = nextIdx % 2
        const penaltyZone: Zone = {
          id: `pos-${player.id}-${penaltyRow}-${penaltyCol}`,
          name: 'Cards',
          visibility: 'face-down',
          ownerId: player.id,
          cards: [penaltyCard],
          capacity: 1,
          gridPosition: { row: penaltyRow, col: penaltyCol },
          claimLabel: null,
          isBluffPile: false,
        }
        gs.zones.push(penaltyZone)
        gs.lastAction = { type: 'stick_fail', playerId: player.id, fromZoneId: zoneId, cardIds: [stickerCard.id], toZoneId: penaltyZone.id, timestamp: Date.now() }
        return { cardId: stickerCard.id, zoneId, rank: stickerCard.rank, suit: stickerCard.suit }
      }
      return null
    }
  }

  private handleCambioCall(gs: GameState, player: Player): void {
    if (gs.currentTurnPlayerId !== player.id) return
    if (gs.cambioCaller) return
    if (gs.cambioDrawn) return    // must call before drawing
    if (gs.cambioPower) return    // must call before using a power
    gs.cambioCaller = player.id
    gs.cambioFinalRound = true
    gs.lastAction = { type: 'pass', playerId: player.id, timestamp: Date.now() }
    this.advanceCambioTurn(gs)
  }

  private advanceCambioTurn(gs: GameState): void {
    if (gs.turnOrder.length === 0) return
    const idx = gs.turnOrder.indexOf(gs.currentTurnPlayerId ?? '')
    const nextIdx = (idx + 1) % gs.turnOrder.length
    const nextPlayerId = gs.turnOrder[nextIdx]
    if (gs.cambioFinalRound && nextPlayerId === gs.cambioCaller) {
      this.endCambioRound(gs)
      return
    }
    gs.currentTurnPlayerId = nextPlayerId
  }

  private endCambioRound(gs: GameState): void {
    for (const zone of gs.zones) {
      if (zone.id.startsWith('pos-')) zone.visibility = 'face-up'
    }
    for (const player of gs.players) {
      const playerZones = gs.zones.filter(z => z.ownerId === player.id && z.id.startsWith('pos-'))
      player.roundScore = playerZones.reduce((sum, z) => sum + z.cards.reduce((s, c) => s + this.cambioCardValue(c), 0), 0)
    }
    gs.phase = 'round-over'
    gs.cambioCaller = null
    gs.cambioFinalRound = false
    gs.lastAction = { type: 'pass', playerId: gs.hostId, timestamp: Date.now() }
  }

  private cambioCardValue(card: Card): number {
    if (card.rank === 'JKR') return 0
    if (card.rank === 'A') return 1
    if (card.rank === 'J' || card.rank === 'Q') return 10
    if (card.rank === 'K') return (card.suit === 'hearts' || card.suit === 'diamonds') ? -1 : 0
    const n = parseInt(card.rank)
    return isNaN(n) ? 0 : n
  }

  private reshuffleDiscardIntoDraw(gs: GameState): void {
    const discard = gs.zones.find(z => z.id === 'discard')
    if (!discard || discard.cards.length <= 1) return
    const top = discard.cards.pop()!
    this.drawPile = shuffle([...discard.cards])
    discard.cards = [top]
    gs.drawPileCount = this.drawPile.length
  }

  // ── Standard helpers ──────────────────────────────────────────

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
      // Only the current player sees their drawn card
      cambioDrawn: gs.cambioDrawn,
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
