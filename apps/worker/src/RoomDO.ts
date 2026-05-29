import type {
  GameState, GamePhase, Player, Team, Zone, Card, Suit,
  ClientEvent, ServerEvent, GameAction
} from '@playing-cards/shared'
import { rankName, checkRummyGoOut } from '@playing-cards/shared'
import { buildDeck, shuffle } from './game/deck'
import { buildZones, dealCards } from './game/deal'
import { getConfig } from './game/zones'
import {
  biddingOrder, findPartner, isTrump, effectiveSuit,
  determineTrickWinner, isLeftBower,
} from './game/euchre'
import {
  parseCombo, comboBeats, isBurn, assignRoles, sortBest, PRESIDENT_RANK_VALUE,
} from './game/president'
import { bestHand } from './game/poker'

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

function makeInitialState(roomCode: string, hostId = ''): GameState {
  return {
    roomCode,
    hostId,
    gameType: null,
    phase: 'lobby',
    players: [],
    pendingPlayers: [],
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
    bluffActiveRank: null,
    bluffHistory: [],
    bluffPassCount: 0,
    bluffPassedPlayerIds: [],
    euchrePhase: null,
    euchreTopCard: null,
    euchreDealerPlayerId: null,
    euchreMakerPlayerId: null,
    euchreGoingAlone: false,
    euchreBidPassCount: 0,
    euchreCurrentTrickLedSuit: null,
    blackjackDealerId: null,
    blackjackStartingChips: 1000,
    blackjackBetAmount: 100,
    blackjackChips: {},
    blackjackBets: {},
    blackjackStood: [],
    blackjackResults: null,
    blackjackSplits: [],
    blackjackMainHandDone: [],
    blackjackSplitBets: {},
    blackjackSplitResults: null,
    cambioDrawn: null,
    cambioPower: null,
    cambioCaller: null,
    cambioFinalRound: false,
    cambioPeekSwapTarget: null,
    cambioJokers: 2,
    bluffJokers: 0,
    presidentDoubleDeck: false,
    presidentCombo: null,
    presidentFinishOrder: [],
    presidentPassedIds: [],
    presidentRoles: {},
    presidentRunPlays: [],
    presidentDiscardPhase: null,
    presidentRunExtension: null,
    presidentExchangePhase: null,
    pokerStartingChips: 1000,
    pokerSmallBlind: 10,
    pokerChips: {},
    pokerPot: 0,
    pokerCurrentBet: 0,
    pokerPlayerBets: {},
    pokerDealerPlayerId: null,
    pokerPhase: null,
    pokerActedThisRound: [],
    pokerAllIn: [],
    pokerWinners: null,
    goFishBooks: {},
    goFishLastAsk: null,
    rummyMaxScore: 100,
    rummyMelds: {},
    rummyHasDrawn: false,
    rummyBustedPlayerIds: [],
    crazy8sMaxScore: 200,
    crazy8sDeclaredSuit: null,
    crazy8sBustedPlayerIds: [],
  }
}

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
      await this.setRoomExpiry()

      return new Response(null, { status: 101, webSocket: client })
    }

    // Called by POST /api/rooms immediately after room code is generated —
    // creates empty lobby state so the room "exists" before Player 1 connects via WS.
    if (url.pathname.endsWith('/init') && request.method === 'POST') {
      const code = url.searchParams.get('code') || generateRoomCode()
      if (!this.gameState) {
        await this.saveState(makeInitialState(code))
        await this.setRoomExpiry()
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
      ?? gs.pendingPlayers.find(p => p.id === playerId)
    if (!player) return

    // Mark disconnected immediately so the UI reflects it, but don't destroy
    // game state yet — give the player a grace window to reconnect.
    player.isConnected = false
    player.disconnectedAt = Date.now()
    await this.saveState(gs)
    await this.broadcastState(gs)

    // Schedule a durable leave: overwrite any existing entry (handles rapid reconnect-disconnect).
    // Using storage + alarm rather than setTimeout so it survives DO hibernation.
    const leaves = (await this.state.storage.get<Record<string, number>>('pendingLeaves')) ?? {}
    leaves[playerId] = Date.now() + 15_000
    await this.state.storage.put('pendingLeaves', leaves)
    await this.scheduleNextAlarm()
  }

  private async cancelLeaveTimer(playerId: string): Promise<void> {
    const leaves = (await this.state.storage.get<Record<string, number>>('pendingLeaves')) ?? {}
    if (leaves[playerId] !== undefined) {
      delete leaves[playerId]
      await this.state.storage.put('pendingLeaves', leaves)
      await this.scheduleNextAlarm()
    }
  }

  private async setRoomExpiry(): Promise<void> {
    const expiresAt = Date.now() + ROOM_TTL_MS
    await this.state.storage.put('roomExpiresAt', expiresAt)
    await this.scheduleNextAlarm()
  }

  private async scheduleNextAlarm(): Promise<void> {
    const [leaves, roomExpiresAt] = await Promise.all([
      this.state.storage.get<Record<string, number>>('pendingLeaves'),
      this.state.storage.get<number>('roomExpiresAt'),
    ])
    const times: number[] = []
    if (roomExpiresAt) times.push(roomExpiresAt)
    if (leaves) times.push(...Object.values(leaves))
    if (times.length > 0) {
      await this.state.storage.setAlarm(Math.min(...times))
    }
  }

  private async applyPlayerLeave(playerId: string): Promise<void> {
    const gs = await this.loadState()
    if (!gs) return

    const player = gs.players.find(p => p.id === playerId)
      ?? gs.pendingPlayers.find(p => p.id === playerId)
    // If they reconnected in the meantime, nothing to do
    if (!player || player.isConnected) return

    // Pending player left — just drop them from the queue, no game impact
    if (gs.pendingPlayers.some(p => p.id === playerId)) {
      gs.pendingPlayers = gs.pendingPlayers.filter(p => p.id !== playerId)
      await this.saveState(gs)
      await this.broadcastState(gs)
      return
    }

    // Host leaves → pass host to the next connected player; terminate only if no one remains
    if (player.isHost) {
      const successor = gs.players.find(p => p.id !== playerId && p.isConnected)
        ?? gs.pendingPlayers.find(p => p.isConnected)
      if (!successor) {
        await this.broadcast({ type: 'kicked', reason: 'All players have left — room closed' }, null)
        await this.state.storage.deleteAll()
        return
      }
      player.isHost = false
      successor.isHost = true
      gs.hostId = successor.id
      // Fall through to normal leave handling below
    }

    // In lobby: remove the player entirely so others see them leave immediately
    if (gs.phase === 'lobby') {
      gs.players = gs.players.filter(p => p.id !== playerId)
      await this.saveState(gs)
      await this.broadcastState(gs)
      return
    }

    // Not in an active game — persist any host transfer that happened above, then stop
    if (gs.phase !== 'playing' && gs.phase !== 'round-over') {
      await this.saveState(gs)
      await this.broadcastState(gs)
      return
    }

    // In an active game: pull the player out of the turn order
    const wasTheirTurn = gs.phase === 'playing' && gs.currentTurnPlayerId === playerId
    const oldTurnIdx   = gs.turnOrder.indexOf(playerId)
    gs.turnOrder = gs.turnOrder.filter(id => id !== playerId)

    // Game-specific state cleanup (may advance gs.phase to 'round-over')
    this.handlePlayerLeave(gs, player)

    // Check whether enough connected players remain for the next round
    const remainingConnected = gs.players.filter(p => p.isConnected).length
    // Euchre needs exactly 4 (teams); Blackjack works with 1 (vs computer); others need ≥ 2
    const minContinue = gs.gameType === 'euchre' ? 4 : gs.gameType === 'blackjack' ? 1 : 2
    if (remainingConnected < minContinue) {
      await this.broadcast(
        { type: 'kicked', reason: `${player.name} left — not enough players to continue` },
        null,
      )
      await this.state.storage.deleteAll()
      return
    }

    // Advance turn if it was their turn and the game is still running
    if (wasTheirTurn && gs.phase === 'playing' && gs.turnOrder.length > 0) {
      if (gs.gameType === 'blackjack') {
        if (this.allBlackjackPlayersDone(gs)) {
          gs.players = gs.players.filter(p => p.id !== playerId)
          await this.saveState(gs)
          await this.broadcastState(gs)
          await this.handleBlackjackDealerPlay(gs)
          return
        }
        this.advanceTurnBlackjack(gs)
      } else {
        // Player already removed from turnOrder; whoever was next is now at oldTurnIdx.
        const nextIdx = oldTurnIdx % gs.turnOrder.length
        gs.currentTurnPlayerId = gs.turnOrder[nextIdx] ?? null
      }
    }

    // All game-specific cleanup (handlePlayerLeave) is done — now drop the player from the
    // visible roster so the UI stops showing them as "leaving 0s".
    gs.players = gs.players.filter(p => p.id !== playerId)

    await this.saveState(gs)
    await this.broadcastState(gs)
  }

  private handlePlayerLeave(gs: GameState, player: Player, redistributeCards = true): void {
    const pid = player.id

    if (gs.gameType === 'president') {
      gs.presidentPassedIds = gs.presidentPassedIds.filter(id => id !== pid)

      // Leavers/disconnects are assigned neutral directly — they do not enter the
      // finish-order race, so early disconnects can never earn President or VP.
      // Kicked players (redistributeCards=false) get no role entry at all.
      if (redistributeCards && !gs.presidentFinishOrder.includes(pid) && !gs.presidentRoles[pid]) {
        gs.presidentRoles[pid] = 'neutral'
      }

      // Auto-complete any pending exchange entry they owe
      if (gs.presidentExchangePhase) {
        const entry = gs.presidentExchangePhase.find(e => e.playerId === pid && !e.done)
        if (entry) {
          entry.done = true
          if (gs.presidentExchangePhase.every(e => e.done)) gs.presidentExchangePhase = null
        }
      }

      // Auto-complete any pending discard entry
      if (gs.presidentDiscardPhase) {
        const entry = gs.presidentDiscardPhase.find(d => d.playerId === pid && !d.done)
        if (entry) {
          entry.done = true
          if (gs.presidentDiscardPhase.every(d => d.done)) gs.presidentDiscardPhase = null
        }
      }

      // If only one (or zero) active players remain, end the round
      if (gs.turnOrder.length <= 1 && gs.phase === 'playing') {
        for (const p of gs.players) {
          // Skip players who already left (have a manually-set neutral role) — they
          // don't get a finish position and can't accidentally earn a good title.
          if (!gs.presidentFinishOrder.includes(p.id) && !gs.presidentRoles[p.id]) {
            gs.presidentFinishOrder.push(p.id)
          }
        }
        // Merge so manually-set neutral entries (leavers) survive the role assignment.
        const assigned = assignRoles(gs.presidentFinishOrder, gs.players.length)
        gs.presidentRoles = { ...gs.presidentRoles, ...assigned }
        gs.phase = 'round-over'
      }

    } else if (gs.gameType === 'bluff') {
      // Keep pass-count accurate
      if (gs.bluffPassedPlayerIds.includes(pid)) {
        gs.bluffPassedPlayerIds = gs.bluffPassedPlayerIds.filter(id => id !== pid)
        gs.bluffPassCount = gs.bluffPassedPlayerIds.length
      }

      // If all remaining players (other than the last submitter) have now passed, clear the pile
      if (gs.lastBluffBatch) {
        const submitterId = gs.lastBluffBatch.submitterId
        const others = gs.turnOrder.filter(id => id !== submitterId)
        const allPassed = others.length === 0 || others.every(id => gs.bluffPassedPlayerIds.includes(id))
        if (allPassed) this.handleBluffPassClear(gs, pid)
      }

    } else if (gs.gameType === 'blackjack') {
      if (!gs.blackjackStood.includes(pid)) gs.blackjackStood.push(pid)
      if (gs.blackjackSplits.includes(pid) && !gs.blackjackMainHandDone.includes(pid)) {
        gs.blackjackMainHandDone.push(pid)
      }

    } else if (gs.gameType === 'poker') {
      player.isFolded = true
    } else if (gs.gameType === 'go-fish') {
      if (redistributeCards) {
        const handZone = gs.zones.find(z => z.id === `hand-${player.id}`)
        if (handZone && handZone.cards.length > 0) {
          this.drawPile.push(...handZone.cards)
          handZone.cards = []
          this.drawPile = shuffle(this.drawPile)
          gs.drawPileCount = this.drawPile.length
        }
      }
    } else if (gs.gameType === 'rummy') {
      if (redistributeCards) {
        const handZone = gs.zones.find(z => z.id === `hand-${player.id}`)
        if (handZone && handZone.cards.length > 0) {
          this.drawPile.push(...handZone.cards)
          handZone.cards = []
          this.drawPile = shuffle(this.drawPile)
          gs.drawPileCount = this.drawPile.length
        }
      }
      gs.rummyHasDrawn = false
    } else if (gs.gameType === 'crazy-eights') {
      if (redistributeCards) {
        const handZone = gs.zones.find(z => z.id === `hand-${player.id}`)
        if (handZone && handZone.cards.length > 0) {
          this.drawPile.push(...handZone.cards)
          handZone.cards = []
          this.drawPile = shuffle(this.drawPile)
          gs.drawPileCount = this.drawPile.length
        }
      }
    }
  }

  async alarm(): Promise<void> {
    const now = Date.now()

    // Process any leave timers that have come due
    const leaves = (await this.state.storage.get<Record<string, number>>('pendingLeaves')) ?? {}
    const due = Object.entries(leaves).filter(([, fireAt]) => fireAt <= now)
    if (due.length > 0) {
      for (const [pid] of due) delete leaves[pid]
      await this.state.storage.put('pendingLeaves', leaves)
      for (const [pid] of due) {
        await this.applyPlayerLeave(pid).catch(() => {})
      }
    }

    // Check room expiry
    const roomExpiresAt = await this.state.storage.get<number>('roomExpiresAt')
    if (roomExpiresAt && now >= roomExpiresAt) {
      await this.broadcast({ type: 'kicked', reason: 'Room expired' }, null)
      await this.state.storage.deleteAll()
      return
    }

    // Reschedule for any remaining pending items
    await this.scheduleNextAlarm()
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

    // Pending players can only update their own spectator preference
    if (event.type === 'set_spectator_preference') {
      const pending = gs.pendingPlayers.find(p => p.id === playerId)
      if (!pending) return
      pending.staySpectator = event.staySpectator
      await this.saveState(gs)
      await this.broadcastState(gs)
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
        if (gs.gameType === 'euchre' && gs.euchrePhase === 'playing') {
          this.handleEuchreTrickPlay(gs, player, event.cardIds[0], ws)
        } else if (gs.gameType === 'president') {
          const presidentPlayResult = this.handlePresidentPlay(gs, player, event.cardIds, ws, event.wildRank)
          if (presidentPlayResult === null) {
            // Game over: show final state so players see the finishing title before results
            await this.saveState(gs)
            await this.broadcastState(gs)
            await new Promise<void>(r => setTimeout(r, 4000))
            const playPile = gs.zones.find(z => z.id === 'play-pile')
            const cleared  = gs.zones.find(z => z.id === 'cleared')
            if (playPile && cleared && playPile.cards.length > 0) {
              cleared.cards.push(...playPile.cards)
              playPile.cards = []
            }
            gs.presidentCombo    = null
            gs.presidentRunPlays = []
            gs.phase = 'round-over'
            await this.saveState(gs)
            await this.broadcastState(gs)
            return
          }
          if (presidentPlayResult !== undefined) {
            // Two-phase burn: show cards on table first, then clear after delay
            await this.saveState(gs)
            await this.broadcastState(gs)
            await new Promise<void>(r => setTimeout(r, 2200))
            const playPile = gs.zones.find(z => z.id === 'play-pile')
            const cleared  = gs.zones.find(z => z.id === 'cleared')
            if (playPile && cleared) { cleared.cards.push(...playPile.cards); playPile.cards = [] }
            this.endPresidentRound(gs, presidentPlayResult)
            await this.saveState(gs)
            await this.broadcastState(gs)
            return
          }
        } else {
          this.handlePlayCards(gs, player, event.cardIds, event.toZoneId, event.bluffClaim)
        }
        break

      case 'move_card':
        this.handleMoveCard(gs, player, event.cardId, event.fromZoneId, event.toZoneId)
        break

      case 'draw_card':
        if (gs.gameType === 'cambio') {
          this.handleCambioDraw(gs, player)
        } else if (gs.gameType === 'blackjack') {
          await this.handleBlackjackHit(gs, player, event.toZoneId)
          return
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
        this.handleResolveBluff(gs)
        break

      case 'president_run_discard':
        if (gs.gameType === 'president') {
          const runDiscardGameOver = this.handlePresidentRunDiscard(gs, player, event.cardIds, ws)
          if (runDiscardGameOver) {
            await this.saveState(gs)
            await this.broadcastState(gs)
            await new Promise<void>(r => setTimeout(r, 4000))
            gs.phase = 'round-over'
            await this.saveState(gs)
            await this.broadcastState(gs)
            return
          }
        }
        break

      case 'president_exchange_return':
        if (gs.gameType === 'president') {
          const exchangeAllDone = this.handlePresidentExchangeReturn(gs, player, event.cardIds, ws)
          if (exchangeAllDone) {
            // Broadcast with returnedCardIds still populated so clients can read which
            // cards the bum/VB received.  A short pause ensures the two messages arrive
            // as separate browser events — React 18 batching would otherwise merge them
            // into one render and the client would never see the intermediate done state.
            await this.saveState(gs)
            await this.broadcastState(gs)
            await new Promise<void>(r => setTimeout(r, 150))
            gs.presidentExchangePhase = null
          }
        }
        break

      case 'pass_turn':
        if (gs.gameType === 'blackjack') {
          await this.handleBlackjackStand(gs, player)
          return
        }
        if (gs.gameType === 'president') {
          this.handlePresidentPass(gs, player, ws)
          break
        }
        if (gs.gameType === 'bluff') {
          const bluffZone = gs.zones.find(z => z.isBluffPile)
          if (bluffZone && bluffZone.cards.length > 0 && gs.lastBluffBatch) {
            if (!gs.bluffPassedPlayerIds.includes(playerId)) {
              gs.bluffPassedPlayerIds.push(playerId)
              gs.bluffPassCount++
            }
            // Everyone except the last submitter has passed → fresh round
            const lastSubmitter = gs.lastBluffBatch.submitterId
            const activePlayers = gs.turnOrder.filter(id => id !== lastSubmitter)
            const allPassed = activePlayers.every(id => gs.bluffPassedPlayerIds.includes(id))
            if (allPassed) {
              this.handleBluffPassClear(gs, playerId)
              break
            }
            // Advance turn, skipping already-passed players
            this.advanceTurnSkipPassed(gs)
            gs.lastAction = { type: 'pass', playerId, timestamp: Date.now() }
            break
          }
        }
        this.advanceTurn(gs)
        gs.lastAction = { type: 'pass', playerId, timestamp: Date.now() }
        break

      case 'fold':
        if (gs.gameType === 'poker') {
          await this.handlePokerFold(gs, player)
          return
        }
        player.isFolded = true
        gs.lastAction = { type: 'fold', playerId, timestamp: Date.now() }
        break

      case 'next_round':
        if (!player.isHost) return
        await this.handleNextRound(gs)
        return

      case 'kick_player':
        if (!player.isHost) return
        if (event.playerId === playerId) return  // can't kick yourself
        await this.handleKickPlayer(gs, event.playerId)
        return

      case 'restart_round':
        if (!player.isHost) return
        if (gs.phase === 'lobby' || gs.phase === 'game-over') return
        await this.handleRestartRound(gs)
        return

      case 'end_game':
        if (!player.isHost) return
        if (gs.phase === 'lobby') {
          // End Room from lobby → terminate entirely
          await this.broadcast({ type: 'kicked', reason: 'Room closed by host' }, null)
          await this.state.storage.deleteAll()
          return
        }
        // End Game from active game → return to lobby, keep all players
        this.resetToLobby(gs)
        break

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

      case 'set_bluff_jokers':
        if (!player.isHost) return
        gs.bluffJokers = event.count
        break

      case 'blackjack_split':
        if (gs.gameType !== 'blackjack') return
        await this.handleBlackjackSplit(gs, player)
        return

      case 'set_blackjack_config':
        if (!player.isHost) return
        gs.blackjackStartingChips = Math.max(10, event.startingChips)
        gs.blackjackBetAmount = Math.max(1, event.betAmount)
        break

      case 'set_poker_config':
        if (!player.isHost) return
        gs.pokerStartingChips = Math.max(10, event.startingChips)
        gs.pokerSmallBlind = Math.max(1, event.smallBlind)
        break

      case 'poker_check':
        if (gs.gameType !== 'poker' || gs.currentTurnPlayerId !== playerId) return
        await this.handlePokerCheck(gs, player, ws)
        return

      case 'poker_call':
        if (gs.gameType !== 'poker' || gs.currentTurnPlayerId !== playerId) return
        await this.handlePokerCall(gs, player)
        return

      case 'poker_bet':
        if (gs.gameType !== 'poker' || gs.currentTurnPlayerId !== playerId) return
        await this.handlePokerBet(gs, player, event.amount)
        return

      case 'poker_all_in':
        if (gs.gameType !== 'poker' || gs.currentTurnPlayerId !== playerId) return
        await this.handlePokerAllIn(gs, player)
        return

      case 'set_rummy_config':
        if (!player.isHost) return
        gs.rummyMaxScore = Math.max(10, event.maxScore)
        break

      case 'set_crazy8s_config':
        if (!player.isHost) return
        gs.crazy8sMaxScore = Math.max(10, event.maxScore)
        break

      case 'crazy8s_play':
        if (gs.gameType !== 'crazy-eights' || gs.currentTurnPlayerId !== playerId) return
        await this.handleCrazy8sPlay(gs, player, event.cardId, event.declaredSuit)
        return

      case 'crazy8s_draw':
        if (gs.gameType !== 'crazy-eights' || gs.currentTurnPlayerId !== playerId) return
        this.handleCrazy8sDraw(gs, player)
        break

      case 'rummy_draw':
        if (gs.gameType !== 'rummy' || gs.currentTurnPlayerId !== playerId) return
        this.handleRummyDraw(gs, player, event.fromDiscard)
        break

      case 'rummy_discard':
        if (gs.gameType !== 'rummy' || gs.currentTurnPlayerId !== playerId) return
        await this.handleRummyDiscard(gs, player, event.cardId, event.faceDown ?? false)
        return

      case 'gofish_ask':
        if (gs.gameType !== 'go-fish' || gs.currentTurnPlayerId !== playerId) return
        await this.handleGoFishAsk(gs, player, event.targetPlayerId, event.rank)
        return

      case 'euchre_order_up':
        this.handleEuchreOrderUp(gs, player, event.goAlone ?? false)
        break

      case 'euchre_pass':
        this.handleEuchrePass(gs, player)
        break

      case 'euchre_call_suit':
        this.handleEuchreCallSuit(gs, player, event.suit, event.goAlone ?? false)
        break

      case 'euchre_discard':
        this.handleEuchreDiscard(gs, player, event.cardId)
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
    // Register session and cancel any pending leave timer for this player
    this.sessions.set(playerId, { ws, playerId })
    await this.cancelLeaveTimer(playerId)

    let gs = await this.loadState()

    if (!gs) {
      // First player — create room
      const roomCode = await this.state.storage.get<string>('roomCode') || generateRoomCode()
      await this.state.storage.put('roomCode', roomCode)
      gs = makeInitialState(roomCode, playerId)
    }

    // First real player — claim host slot that /init left blank
    if (gs.players.length === 0 && !gs.hostId) {
      gs.hostId = playerId
    }

    // Check if reconnecting (present in players or pendingPlayers)
    let player = gs.players.find(p => p.id === playerId)
      ?? gs.pendingPlayers.find(p => p.id === playerId)

    if (!player) {
      // Hard room cap of 12 regardless of game type
      const ROOM_MAX = 12
      if (gs.players.length + gs.pendingPlayers.length >= ROOM_MAX) {
        this.sendTo(ws, { type: 'kicked', reason: `This room is full (max ${ROOM_MAX} people allowed).` })
        return
      }

      player = {
        id: playerId,
        name,
        seatIndex: gs.players.length + gs.pendingPlayers.length,
        teamId: null,
        isHost: gs.hostId === playerId,
        isConnected: true,
        isReady: false,
        isFolded: false,
        trickCount: 0,
        roundScore: 0,
        totalScore: 0,
      }

      if (gs.phase !== 'lobby') {
        // Game in progress — hold in pending queue; promoted at next deal up to game's max
        gs.pendingPlayers.push(player)
      } else {
        gs.players.push(player)
      }
    } else {
      player.isConnected = true
      player.disconnectedAt = undefined
      player.name = name
      // If reconnecting into a live Cambio game before everyone has dismissed their initial peek,
      // auto-mark ready — the server won't resend peek results, so they can't block the first player.
      if (gs.gameType === 'cambio' && gs.phase === 'playing' && !player.isReady) {
        player.isReady = true
      }
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

    // Promote connected pending players who want to play, up to the game's max player count
    const slotsAvailable = Math.max(0, config.maxPlayers - gs.players.filter(p => p.isConnected).length)
    const toPromote = gs.pendingPlayers.filter(p => p.isConnected && !p.staySpectator).slice(0, slotsAvailable)
    const promotedIds = new Set(toPromote.map(p => p.id))
    for (const p of toPromote) {
      p.staySpectator = undefined  // clear flag now they're active
      gs.players.push(p)
    }
    gs.pendingPlayers = gs.pendingPlayers.filter(p => !promotedIds.has(p.id))

    // Permanently remove any player who left — they won't participate in this round
    gs.players = gs.players.filter(p => p.isConnected)
    // Re-index seats so downstream logic sees a clean 0-based sequence
    gs.players.forEach((p, i) => { p.seatIndex = i })

    gs.phase = 'dealing'

    // Build and shuffle deck (inject joker count for Cambio and Bluff; double deck for President 5+)
    const useDoubleDeck = gs.gameType === 'president' && gs.players.length > 4
    gs.presidentDoubleDeck = useDoubleDeck
    const deckFilter = gs.gameType === 'cambio'
      ? { ...config.deckFilter, jokerCount: gs.cambioJokers }
      : gs.gameType === 'bluff'
        ? { ...config.deckFilter, jokerCount: gs.bluffJokers }
        : gs.gameType === 'president'
          ? { ...config.deckFilter, copies: useDoubleDeck ? 2 : 1, jokerCount: useDoubleDeck ? 4 : 2 }
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
    // Blackjack: computer is dealer — init chips, deduct bets, build turn order, return early
    if (gs.gameType === 'blackjack') {
      // Init chips on first hand
      if (Object.keys(gs.blackjackChips).length === 0) {
        for (const p of gs.players) gs.blackjackChips[p.id] = gs.blackjackStartingChips
      } else {
        for (const p of gs.players) {
          if (!(p.id in gs.blackjackChips)) gs.blackjackChips[p.id] = gs.blackjackStartingChips
        }
      }
      // Reset per-hand state
      for (const p of gs.players) p.isFolded = false
      gs.blackjackStood = []
      gs.blackjackResults = null
      gs.blackjackBets = {}
      gs.blackjackSplits = []
      gs.blackjackMainHandDone = []
      gs.blackjackSplitBets = {}
      gs.blackjackSplitResults = null
      // Deduct bet from each player (capped at their chips)
      for (const p of gs.players) {
        const bet = Math.min(gs.blackjackBetAmount, gs.blackjackChips[p.id])
        gs.blackjackBets[p.id] = bet
        gs.blackjackChips[p.id] -= bet
      }
      // Turn order: only players who placed a bet
      gs.blackjackDealerId = null
      gs.turnOrder = gs.players
        .filter(p => gs.blackjackBets[p.id] > 0)
        .map(p => p.id)

      // Auto-stand players with natural blackjack (21 on initial 2 cards)
      for (const pid of gs.turnOrder) {
        const zone = gs.zones.find(z => z.id === `hand-${pid}`)
        if (zone && this.bjHandValue(zone.cards) === 21 && zone.cards.length === 2) {
          if (!gs.blackjackStood.includes(pid)) gs.blackjackStood.push(pid)
        }
      }

      // Set turn to first active (non-stood) player
      gs.currentTurnPlayerId = gs.turnOrder.find(pid => !gs.blackjackStood.includes(pid)) ?? null
      gs.roundNumber++
      gs.phase = 'playing'
      gs.lastAction = { type: 'deal', playerId: gs.hostId, timestamp: Date.now() }
      await this.saveState(gs)
      await this.broadcastState(gs)

      // If all players already stood (e.g. everyone got natural BJ), run dealer immediately
      if (this.allBlackjackPlayersDone(gs)) {
        await this.handleBlackjackDealerPlay(gs)
      }
      return
    }
    // President: card exchange then start
    if (gs.gameType === 'president') {
      const n = gs.players.length
      const exchangeCount = n <= 3 ? 1 : 2
      const roles = gs.presidentRoles

      const getHand = (pid: string) => gs.zones.find(z => z.id === `hand-${pid}`)

      const presId = Object.keys(roles).find(id => roles[id] === 'president')
      const bumId  = Object.keys(roles).find(id => roles[id] === 'bum')
      const vpId   = Object.keys(roles).find(id => roles[id] === 'vp')
      const vbId   = Object.keys(roles).find(id => roles[id] === 'vb')

      const exchangeEntries: NonNullable<GameState['presidentExchangePhase']> = []

      if (presId && bumId) {
        const bumHand = getHand(bumId), presHand = getHand(presId)
        if (bumHand && presHand) {
          const best = sortBest(bumHand.cards).slice(0, exchangeCount)
          const receivedCardIds = best.map(c => c.id)
          for (const card of best) {
            const idx = bumHand.cards.findIndex(c => c.id === card.id)
            if (idx !== -1) { bumHand.cards.splice(idx, 1); presHand.cards.push(card) }
          }
          exchangeEntries.push({ playerId: presId, recipientId: bumId, cardsOwed: exchangeCount, done: false, receivedCardIds, returnedCardIds: [], giverRole: 'bum' })
        }
      }
      if (vpId && vbId) {
        const vbHand = getHand(vbId), vpHand = getHand(vpId)
        if (vbHand && vpHand) {
          const best = sortBest(vbHand.cards).slice(0, 1)
          const receivedCardIds = best.map(c => c.id)
          for (const card of best) {
            const idx = vbHand.cards.findIndex(c => c.id === card.id)
            if (idx !== -1) { vbHand.cards.splice(idx, 1); vpHand.cards.push(card) }
          }
          exchangeEntries.push({ playerId: vpId, recipientId: vbId, cardsOwed: 1, done: false, receivedCardIds, returnedCardIds: [], giverRole: 'vb' })
        }
      }

      // Bum from last round starts; first-ever round picks a random player
      if (bumId && gs.turnOrder.includes(bumId)) {
        gs.currentTurnPlayerId = bumId
      } else {
        const randomIdx = Math.floor(Math.random() * gs.turnOrder.length)
        gs.currentTurnPlayerId = gs.turnOrder[randomIdx]
      }
      gs.presidentCombo         = null
      gs.presidentFinishOrder   = []
      gs.presidentPassedIds     = []
      gs.presidentRunPlays      = []
      gs.presidentDiscardPhase  = null
      gs.presidentRunExtension  = null
      gs.presidentExchangePhase = exchangeEntries.length > 0 ? exchangeEntries : null
      // presidentRoles intentionally kept from previous round so titles remain visible during gameplay
      gs.roundNumber++
      gs.phase = 'playing'
      gs.lastAction = { type: 'deal', playerId: gs.hostId, timestamp: Date.now() }
      await this.saveState(gs)
      await this.broadcastState(gs)
      return
    }

    // Poker: initialize chips, post blinds, deal hole cards
    if (gs.gameType === 'poker') {
      // Init chips on first hand
      if (Object.keys(gs.pokerChips).length === 0) {
        for (const p of gs.players) gs.pokerChips[p.id] = gs.pokerStartingChips
      } else {
        // New players joining next round get starting chips
        for (const p of gs.players) {
          if (!(p.id in gs.pokerChips)) gs.pokerChips[p.id] = gs.pokerStartingChips
        }
      }

      // Reset per-hand state
      for (const p of gs.players) p.isFolded = false
      gs.pokerWinners = null
      gs.pokerPot = 0
      gs.pokerCurrentBet = 0
      gs.pokerPlayerBets = {}
      gs.pokerActedThisRound = []
      gs.pokerAllIn = []

      // Active players (have chips)
      const sorted = [...gs.players]
        .filter(p => (gs.pokerChips[p.id] ?? 0) > 0)
        .sort((a, b) => a.seatIndex - b.seatIndex)

      if (sorted.length < 2) return  // not enough players

      // Bust players observe but don't receive hole cards
      for (const p of gs.players) {
        if ((gs.pokerChips[p.id] ?? 0) === 0) {
          const zone = gs.zones.find(z => z.id === `hole-cards-${p.id}`)
          if (zone) zone.cards = []
        }
      }

      // Rotate dealer
      const curDealerPos = gs.pokerDealerPlayerId
        ? sorted.findIndex(p => p.id === gs.pokerDealerPlayerId)
        : -1
      const nextDealerPos = (curDealerPos + 1) % sorted.length
      gs.pokerDealerPlayerId = sorted[nextDealerPos].id

      const n = sorted.length
      // Heads-up (2 players): dealer = SB, other = BB, dealer acts first pre-flop
      // 3+ players: SB left of dealer, BB next, UTG acts first pre-flop
      let sbPos: number, bbPos: number, utgPos: number
      if (n === 2) {
        sbPos = nextDealerPos
        bbPos = (nextDealerPos + 1) % n
        utgPos = nextDealerPos  // dealer/SB acts first heads-up
      } else {
        sbPos = (nextDealerPos + 1) % n
        bbPos = (nextDealerPos + 2) % n
        utgPos = (nextDealerPos + 3) % n
      }

      const sbPlayer = sorted[sbPos]
      const bbPlayer = sorted[bbPos]

      // Post blinds
      const sbAmt = Math.min(gs.pokerSmallBlind, gs.pokerChips[sbPlayer.id])
      const bbAmt = Math.min(gs.pokerSmallBlind * 2, gs.pokerChips[bbPlayer.id])
      gs.pokerChips[sbPlayer.id] -= sbAmt
      gs.pokerChips[bbPlayer.id] -= bbAmt
      gs.pokerPlayerBets[sbPlayer.id] = sbAmt
      gs.pokerPlayerBets[bbPlayer.id] = bbAmt
      gs.pokerPot = sbAmt + bbAmt
      gs.pokerCurrentBet = bbAmt
      if (gs.pokerChips[sbPlayer.id] === 0) gs.pokerAllIn.push(sbPlayer.id)
      if (gs.pokerChips[bbPlayer.id] === 0 && !gs.pokerAllIn.includes(bbPlayer.id)) {
        gs.pokerAllIn.push(bbPlayer.id)
      }

      // Pre-flop turn order: UTG first, BB last
      const turnOrder: string[] = []
      for (let i = 0; i < n; i++) turnOrder.push(sorted[(utgPos + i) % n].id)
      gs.turnOrder = turnOrder
      gs.currentTurnPlayerId = turnOrder[0]
      gs.pokerPhase = 'pre-flop'
      gs.roundNumber++
      gs.phase = 'playing'
      gs.lastAction = { type: 'deal', playerId: gs.hostId, timestamp: Date.now() }
      await this.saveState(gs)
      await this.broadcastState(gs)
      return
    }

    // Euchre: pick/rotate dealer, set up bidding
    if (gs.gameType === 'euchre') {
      const prevDealerSeat = gs.euchreDealerPlayerId
        ? (gs.players.find(p => p.id === gs.euchreDealerPlayerId)?.seatIndex ?? -1)
        : -1
      const sorted = [...gs.players].sort((a, b) => a.seatIndex - b.seatIndex)
      const dealerId = prevDealerSeat === -1
        ? sorted[Math.floor(Math.random() * sorted.length)].id
        : sorted[(sorted.findIndex(p => p.seatIndex === prevDealerSeat) + 1) % sorted.length].id
      gs.euchreDealerPlayerId = dealerId
      gs.euchreTopCard = gs.zones.find(z => z.id === 'kitty')?.cards.at(-1) ?? null
      gs.euchrePhase = 'bidding1'
      gs.euchreBidPassCount = 0
      gs.euchreMakerPlayerId = null
      gs.euchreGoingAlone = false
      gs.euchreCurrentTrickLedSuit = null
      gs.trumpSuit = null
      const order = biddingOrder(gs.players, dealerId)
      gs.turnOrder = order
      gs.currentTurnPlayerId = order[0]
      gs.roundNumber++
      gs.phase = 'playing'
      gs.lastAction = { type: 'deal', playerId: gs.hostId, timestamp: Date.now() }
      await this.saveState(gs)
      await this.broadcastState(gs)
      return
    }

    // Go Fish: initialize books, pick random first player
    if (gs.gameType === 'go-fish') {
      gs.goFishBooks = {}
      gs.goFishLastAsk = null
      for (const p of gs.players) gs.goFishBooks[p.id] = []
      const randomIdx = Math.floor(Math.random() * gs.turnOrder.length)
      gs.currentTurnPlayerId = gs.turnOrder[randomIdx]
      // Check if any player was dealt a book immediately
      for (const p of gs.players) {
        this.goFishCheckBooks(gs, p.id)
      }
      gs.roundNumber++
      gs.phase = 'playing'
      gs.lastAction = { type: 'deal', playerId: gs.hostId, timestamp: Date.now() }
      await this.saveState(gs)
      await this.broadcastState(gs)
      return
    }

    // Rummy: init melds, clear busted players' hands, set active turn order
    if (gs.gameType === 'rummy') {
      gs.rummyMelds = {}
      gs.rummyHasDrawn = false
      for (const p of gs.players) {
        gs.rummyMelds[p.id] = []
        p.isFolded = false
      }
      // Clear cards from busted players' hands and return them to draw pile
      for (const pid of gs.rummyBustedPlayerIds) {
        const handZone = gs.zones.find(z => z.id === `hand-${pid}`)
        if (handZone && handZone.cards.length > 0) {
          this.drawPile.push(...handZone.cards)
          handZone.cards = []
        }
      }
      // Reshuffle returned cards back into draw pile
      if (gs.rummyBustedPlayerIds.length > 0) {
        this.drawPile = shuffle(this.drawPile)
        gs.drawPileCount = this.drawPile.length
      }
      // Only non-busted players participate in turns
      const activePlayers = gs.players.filter(p => !gs.rummyBustedPlayerIds.includes(p.id))
      gs.turnOrder = activePlayers.map(p => p.id)
      const randomIdx = Math.floor(Math.random() * gs.turnOrder.length)
      gs.currentTurnPlayerId = gs.turnOrder[randomIdx]
      gs.roundNumber++
      gs.phase = 'playing'
      gs.lastAction = { type: 'deal', playerId: gs.hostId, timestamp: Date.now() }
      await this.saveState(gs)
      await this.broadcastState(gs)
      return
    }

    // Crazy Eights: reset state, pick random start player
    if (gs.gameType === 'crazy-eights') {
      gs.crazy8sDeclaredSuit = null
      for (const p of gs.players) p.isFolded = false
      const activePlayers = gs.players.filter(p => !gs.crazy8sBustedPlayerIds.includes(p.id))
      gs.turnOrder = activePlayers.map(p => p.id)
      const randomIdx = Math.floor(Math.random() * gs.turnOrder.length)
      gs.currentTurnPlayerId = gs.turnOrder[randomIdx]
      gs.roundNumber++
      gs.phase = 'playing'
      gs.lastAction = { type: 'deal', playerId: gs.hostId, timestamp: Date.now() }
      await this.saveState(gs)
      await this.broadcastState(gs)
      return
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

    // Cambio: reset ready flags then send initial bottom-2 card peek to each player.
    // The first player cannot draw until everyone has dismissed their peek (client sends 'ready').
    if (gs.gameType === 'cambio') {
      for (const p of gs.players) p.isReady = false
      await this.saveState(gs)
      await this.broadcastState(gs)

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

  private handlePlayCards(gs: GameState, player: Player, cardIds: string[], toZoneId: string, bluffClaim?: { rank: string }): void {
    const fromZoneId = this.findCardZone(gs, cardIds[0], player.id)
    if (!fromZoneId) return

    const fromZone = gs.zones.find(z => z.id === fromZoneId)
    const toZone = gs.zones.find(z => z.id === toZoneId)
    if (!fromZone || !toZone) return

    // Block play if this player has already passed in the current bluff round
    if (gs.gameType === 'bluff' && toZone.isBluffPile && gs.bluffPassedPlayerIds.includes(player.id)) return

    const cards: Card[] = []
    for (const cardId of cardIds) {
      const idx = fromZone.cards.findIndex(c => c.id === cardId)
      if (idx === -1) continue
      cards.push(...fromZone.cards.splice(idx, 1))
    }

    toZone.cards.push(...cards)

    if (toZone.isBluffPile) {
      // First play of a cycle: use the declared rank; subsequent plays: use active rank
      const claimRank = gs.bluffActiveRank ?? bluffClaim?.rank ?? ''
      if (!gs.bluffActiveRank && claimRank) gs.bluffActiveRank = claimRank
      const claimCount = cards.length
      toZone.claimLabel = `${claimCount} ${rankName(claimRank, claimCount)}`
      gs.lastBluffBatch = { cardIds: cards.map(c => c.id), submitterId: player.id, claimRank, claimCount }
      gs.bluffHistory.push({ submitterId: player.id, claimRank, claimCount })
      gs.bluffPassCount = 0
      gs.bluffPassedPlayerIds = []
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
    if (player.id === batch.submitterId) return  // can't call bluff on yourself

    const revealedCards = bluffZone.cards.filter(c => batch.cardIds.includes(c.id))
    if (revealedCards.length === 0) return

    // Jokers are wildcards — only rank mismatch matters (count is always truthful)
    const bluffSucceeded = revealedCards.some(c => c.rank !== 'JKR' && c.rank !== batch.claimRank)

    const recipientId = bluffSucceeded ? batch.submitterId : player.id

    gs.bluffReveal = {
      cards: revealedCards,
      submitterId: batch.submitterId,
      callerId: player.id,
      claimRank: batch.claimRank,
      claimCount: batch.claimCount,
      bluffSucceeded,
      recipientId,
    }

    gs.lastBluffBatch = null
    gs.bluffPassCount = 0
    gs.bluffPassedPlayerIds = []

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

  private handleResolveBluff(gs: GameState): void {
    const reveal = gs.bluffReveal
    if (!reveal) return

    const bluffZone = gs.zones.find(z => z.isBluffPile)
    const recipientId = reveal.recipientId
    const handZone = gs.zones.find(z => z.id === `hand-${recipientId}`)

    if (bluffZone && handZone) {
      handZone.cards.push(...bluffZone.cards)
      bluffZone.cards = []
      bluffZone.claimLabel = null
    }

    gs.bluffReveal = null
    gs.bluffActiveRank = null
    gs.bluffHistory = []
    // Winner of the challenge starts the next round:
    //   bluff succeeded → caller was right → caller goes next
    //   bluff failed    → submitter was right → submitter goes next
    gs.currentTurnPlayerId = reveal.bluffSucceeded ? reveal.callerId : reveal.submitterId
    gs.lastAction = {
      type: 'move',
      playerId: recipientId,
      fromZoneId: 'bluff-pile',
      toZoneId: `hand-${recipientId}`,
      timestamp: Date.now(),
    }
  }

  // ── Euchre handlers ──────────────────────────────────────────────────────

  private handleEuchreOrderUp(gs: GameState, player: Player, goAlone: boolean): void {
    if (gs.euchrePhase !== 'bidding1' || gs.currentTurnPlayerId !== player.id) return
    if (!gs.euchreTopCard) return
    gs.trumpSuit = gs.euchreTopCard.suit
    gs.euchreMakerPlayerId = player.id
    gs.euchreGoingAlone = goAlone
    // Give top card to dealer
    const kitty = gs.zones.find(z => z.id === 'kitty')
    const dealerHand = gs.zones.find(z => z.id === `hand-${gs.euchreDealerPlayerId}`)
    if (kitty && dealerHand && gs.euchreTopCard) {
      const idx = kitty.cards.findIndex(c => c.id === gs.euchreTopCard!.id)
      if (idx !== -1) dealerHand.cards.push(...kitty.cards.splice(idx, 1))
    }
    gs.euchrePhase = 'discard'
    gs.currentTurnPlayerId = gs.euchreDealerPlayerId
    gs.lastAction = { type: 'play', playerId: player.id, timestamp: Date.now() }
  }

  private handleEuchrePass(gs: GameState, player: Player): void {
    if (gs.currentTurnPlayerId !== player.id) return
    if (gs.euchrePhase === 'bidding1') {
      gs.euchreBidPassCount++
      if (gs.euchreBidPassCount >= gs.turnOrder.length) {
        gs.euchrePhase = 'bidding2'
        gs.euchreBidPassCount = 0
        gs.currentTurnPlayerId = gs.turnOrder[0]
      } else {
        this.advanceTurn(gs)
      }
    } else if (gs.euchrePhase === 'bidding2') {
      if (player.id === gs.euchreDealerPlayerId) return // stick the dealer — cannot pass
      gs.euchreBidPassCount++
      this.advanceTurn(gs)
    }
    gs.lastAction = { type: 'pass', playerId: player.id, timestamp: Date.now() }
  }

  private handleEuchreCallSuit(gs: GameState, player: Player, suit: Suit, goAlone: boolean): void {
    if (gs.euchrePhase !== 'bidding2' || gs.currentTurnPlayerId !== player.id) return
    gs.trumpSuit = suit
    gs.euchreMakerPlayerId = player.id
    gs.euchreGoingAlone = goAlone
    this.startEuchrePlaying(gs)
    gs.lastAction = { type: 'play', playerId: player.id, timestamp: Date.now() }
  }

  private handleEuchreDiscard(gs: GameState, player: Player, cardId: string): void {
    if (gs.euchrePhase !== 'discard' || player.id !== gs.euchreDealerPlayerId) return
    const hand = gs.zones.find(z => z.id === `hand-${player.id}`)
    const kitty = gs.zones.find(z => z.id === 'kitty')
    if (!hand || !kitty) return
    const idx = hand.cards.findIndex(c => c.id === cardId)
    if (idx === -1) return
    kitty.cards.push(...hand.cards.splice(idx, 1))
    gs.euchreTopCard = null
    this.startEuchrePlaying(gs)
    gs.lastAction = { type: 'play', playerId: player.id, timestamp: Date.now() }
  }

  private startEuchrePlaying(gs: GameState): void {
    gs.euchrePhase = 'playing'
    gs.euchreCurrentTrickLedSuit = null
    const dealerId = gs.euchreDealerPlayerId!
    let order = biddingOrder(gs.players, dealerId) // [left-of-dealer, ..., dealer]
    if (gs.euchreGoingAlone && gs.euchreMakerPlayerId) {
      const partner = findPartner(gs.players, gs.euchreMakerPlayerId)
      if (partner) order = order.filter(id => id !== partner.id)
    }
    gs.turnOrder = order
    gs.currentTurnPlayerId = order[0]
    // Reset trick counts for new hand
    for (const p of gs.players) p.trickCount = 0
  }

  private handleEuchreTrickPlay(gs: GameState, player: Player, cardId: string, ws: WebSocket): void {
    if (gs.currentTurnPlayerId !== player.id) {
      this.sendTo(ws, { type: 'error', message: "It's not your turn" })
      return
    }
    const hand = gs.zones.find(z => z.id === `hand-${player.id}`)
    if (!hand) return
    const cardIdx = hand.cards.findIndex(c => c.id === cardId)
    if (cardIdx === -1) return
    const card = hand.cards[cardIdx]
    const trump = gs.trumpSuit!

    // Follow-suit enforcement: if a card of the led suit was led, player must follow if able
    if (gs.euchreCurrentTrickLedSuit !== null) {
      const canFollow = hand.cards.some(
        c => effectiveSuit(c, trump) === gs.euchreCurrentTrickLedSuit
      )
      if (canFollow && effectiveSuit(card, trump) !== gs.euchreCurrentTrickLedSuit) {
        this.sendTo(ws, { type: 'error', message: 'You must follow suit' })
        return
      }
    }

    // Move card to trick zone
    hand.cards.splice(cardIdx, 1)
    const trickZone = gs.zones.find(z => z.id === `trick-${player.id}`)
    if (!trickZone) return
    trickZone.cards.push(card)

    // Set led suit from first card played
    if (gs.euchreCurrentTrickLedSuit === null) {
      gs.euchreCurrentTrickLedSuit = effectiveSuit(card, trump)
    }

    gs.lastAction = { type: 'play', playerId: player.id, cardIds: [cardId], toZoneId: `trick-${player.id}`, timestamp: Date.now() }

    // Check if trick complete
    const allPlayed = gs.turnOrder.every(pid => {
      const tz = gs.zones.find(z => z.id === `trick-${pid}`)
      return (tz?.cards.length ?? 0) > 0
    })
    if (allPlayed) {
      this.resolveEuchreTrick(gs)
    } else {
      this.advanceTurn(gs)
    }
  }

  private resolveEuchreTrick(gs: GameState): void {
    const trump = gs.trumpSuit!
    const ledSuit = gs.euchreCurrentTrickLedSuit!

    const plays = gs.turnOrder.map(pid => {
      const tz = gs.zones.find(z => z.id === `trick-${pid}`)!
      return { playerId: pid, card: tz.cards[0] }
    })

    const winnerId = determineTrickWinner(plays, trump, ledSuit)
    const winner = gs.players.find(p => p.id === winnerId)!
    winner.trickCount++

    // Move trick cards to winning team's pile
    const tricksZoneId = winner.teamId === 'team-a' ? 'tricks-a' : 'tricks-b'
    const tricksZone = gs.zones.find(z => z.id === tricksZoneId)!
    for (const play of plays) {
      const tz = gs.zones.find(z => z.id === `trick-${play.playerId}`)!
      tricksZone.cards.push(...tz.cards)
      tz.cards = []
    }
    gs.euchreCurrentTrickLedSuit = null

    const totalTricks = gs.players.reduce((s, p) => s + p.trickCount, 0)
    if (totalTricks >= 5) {
      this.scoreEuchreHand(gs)
    } else {
      gs.currentTurnPlayerId = winnerId
    }
  }

  private scoreEuchreHand(gs: GameState): void {
    const maker = gs.players.find(p => p.id === gs.euchreMakerPlayerId)!
    const makerTeam   = gs.teams.find(t => t.id === maker.teamId)!
    const defenderTeam = gs.teams.find(t => t.id !== maker.teamId)!

    const makerTricks = gs.players
      .filter(p => p.teamId === makerTeam.id)
      .reduce((s, p) => s + p.trickCount, 0)

    if (makerTricks >= 3) {
      const allFive = makerTricks === 5
      makerTeam.roundScore = allFive ? (gs.euchreGoingAlone ? 4 : 2) : 1
      defenderTeam.roundScore = 0
    } else {
      makerTeam.roundScore = 0
      defenderTeam.roundScore = 2 // euchred
    }

    gs.euchrePhase = null
    gs.phase = 'round-over'
  }

  // ── End Euchre handlers ───────────────────────────────────────────────────

  private handleBluffPassClear(gs: GameState, passingPlayerId: string): void {
    const bluffZone = gs.zones.find(z => z.isBluffPile)
    if (bluffZone) {
      bluffZone.cards = []
      bluffZone.claimLabel = null
    }
    // Last submitter starts fresh; fall back to first in order if somehow null
    gs.currentTurnPlayerId = gs.lastBluffBatch?.submitterId ?? gs.turnOrder[0] ?? null
    gs.bluffPassCount = 0
    gs.bluffPassedPlayerIds = []
    gs.lastBluffBatch = null
    gs.bluffActiveRank = null
    gs.bluffHistory = []
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

    // President: redeal immediately (roles carry over for card exchange)
    if (gs.gameType === 'president') {
      await this.handleDeal(gs)
      return
    }

    // Poker: chips carry over, rotate dealer, redeal; check for game over
    if (gs.gameType === 'poker') {
      const active = gs.players.filter(p => (gs.pokerChips[p.id] ?? 0) > 0)
      if (active.length <= 1) {
        for (const p of gs.players) p.totalScore = gs.pokerChips[p.id] ?? 0
        gs.phase = 'game-over'
        await this.saveState(gs); await this.broadcastState(gs)
        return
      }
      await this.handleDeal(gs)
      return
    }

    // Blackjack: chips carry over, redeal; check for game over (all players at 0)
    if (gs.gameType === 'blackjack') {
      const active = gs.players.filter(p => (gs.blackjackChips[p.id] ?? 0) > 0)
      if (active.length === 0) {
        gs.phase = 'game-over'
        await this.saveState(gs); await this.broadcastState(gs)
        return
      }
      await this.handleDeal(gs)
      return
    }

    // Go Fish: redeal for another game
    if (gs.gameType === 'go-fish') {
      gs.goFishBooks = {}
      gs.goFishLastAsk = null
      await this.handleDeal(gs)
      return
    }

    // Rummy: bust check, then redeal
    if (gs.gameType === 'rummy') {
      for (const p of gs.players) {
        if (p.totalScore >= gs.rummyMaxScore && !gs.rummyBustedPlayerIds.includes(p.id)) {
          gs.rummyBustedPlayerIds.push(p.id)
        }
      }
      const active = gs.players.filter(p => !gs.rummyBustedPlayerIds.includes(p.id))
      if (active.length <= 1) {
        gs.phase = 'game-over'
        await this.saveState(gs)
        await this.broadcastState(gs)
        return
      }
      gs.rummyMelds = {}
      gs.rummyHasDrawn = false
      await this.handleDeal(gs)
      return
    }

    // Crazy Eights: bust check, then redeal
    if (gs.gameType === 'crazy-eights') {
      for (const p of gs.players) {
        if (p.totalScore >= gs.crazy8sMaxScore && !gs.crazy8sBustedPlayerIds.includes(p.id)) {
          gs.crazy8sBustedPlayerIds.push(p.id)
        }
      }
      const active = gs.players.filter(p => !gs.crazy8sBustedPlayerIds.includes(p.id))
      if (active.length <= 1) {
        gs.phase = 'game-over'
        await this.saveState(gs)
        await this.broadcastState(gs)
        return
      }
      gs.crazy8sDeclaredSuit = null
      await this.handleDeal(gs)
      return
    }

    // Euchre: reset bidding state, check for game over (10 pts), then redeal
    if (gs.gameType === 'euchre') {
      gs.euchrePhase = null
      gs.euchreTopCard = null
      gs.euchreMakerPlayerId = null
      gs.euchreGoingAlone = false
      gs.euchreBidPassCount = 0
      gs.euchreCurrentTrickLedSuit = null
      const winner = gs.teams.find(t => t.totalScore >= 10)
      if (winner) {
        gs.phase = 'game-over'
        await this.saveState(gs)
        await this.broadcastState(gs)
        return
      }
      await this.handleDeal(gs)
      return
    }

    gs.phase = 'lobby'
    gs.zones = []
    gs.turnOrder = []
    gs.currentTurnPlayerId = null
    gs.trumpSuit = null
    gs.lastAction = null
    gs.bluffReveal = null
    gs.lastBluffBatch = null
    gs.bluffActiveRank = null
    gs.bluffHistory = []
    gs.bluffPassCount = 0
    gs.bluffPassedPlayerIds = []
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

  private resetToLobby(gs: GameState): void {
    gs.phase = 'lobby'
    gs.zones = []
    gs.turnOrder = []
    gs.currentTurnPlayerId = null
    gs.trumpSuit = null
    gs.lastAction = null
    gs.roundNumber = 0
    gs.drawPileCount = 0
    this.drawPile = []
    // Bluff
    gs.bluffReveal = null
    gs.lastBluffBatch = null
    gs.bluffActiveRank = null
    gs.bluffHistory = []
    gs.bluffPassCount = 0
    gs.bluffPassedPlayerIds = []
    // Euchre
    gs.euchrePhase = null
    gs.euchreTopCard = null
    gs.euchreDealerPlayerId = null
    gs.euchreMakerPlayerId = null
    gs.euchreGoingAlone = false
    gs.euchreBidPassCount = 0
    gs.euchreCurrentTrickLedSuit = null
    // Blackjack
    gs.blackjackResults = null
    gs.blackjackStood = []
    gs.blackjackSplits = []
    gs.blackjackMainHandDone = []
    gs.blackjackSplitBets = {}
    gs.blackjackSplitResults = null
    gs.blackjackBets = {}
    // Cambio
    gs.cambioDrawn = null
    gs.cambioPower = null
    gs.cambioCaller = null
    gs.cambioFinalRound = false
    gs.cambioPeekSwapTarget = null
    // President
    gs.presidentCombo = null
    gs.presidentFinishOrder = []
    gs.presidentPassedIds = []
    gs.presidentRunPlays = []
    gs.presidentDiscardPhase = null
    gs.presidentRunExtension = null
    gs.presidentExchangePhase = null
    gs.presidentRoles = {}
    // Poker
    gs.pokerPhase = null
    gs.pokerWinners = null
    gs.pokerPot = 0
    gs.pokerCurrentBet = 0
    gs.pokerPlayerBets = {}
    gs.pokerActedThisRound = []
    gs.pokerAllIn = []
    // Go Fish
    gs.goFishBooks = {}
    gs.goFishLastAsk = null
    // Rummy
    gs.rummyMelds = {}
    gs.rummyHasDrawn = false
    gs.rummyBustedPlayerIds = []
    // Crazy Eights
    gs.crazy8sDeclaredSuit = null
    gs.crazy8sBustedPlayerIds = []
    // Players
    for (const p of gs.players) {
      p.isReady = false
      p.isFolded = false
      p.trickCount = 0
      p.roundScore = 0
    }
    for (const t of gs.teams) {
      t.roundScore = 0
    }
  }

  private async handleKickPlayer(gs: GameState, targetPlayerId: string): Promise<void> {
    await this.cancelLeaveTimer(targetPlayerId)

    // Tell the kicked player they've been removed, then close their connection so
    // they cannot receive the subsequent broadcastState (which would overwrite the
    // kicked event on their client before navigation completes).
    const targetSession = this.sessions.get(targetPlayerId)
    if (targetSession) {
      this.sendTo(targetSession.ws, { type: 'kicked', reason: 'You were removed from the room by the host' })
      targetSession.ws.close(1000, 'kicked')
      this.sessions.delete(targetPlayerId)
    }

    // Spectating / pending player — just drop from queue, no game impact
    if (gs.pendingPlayers.some(p => p.id === targetPlayerId)) {
      gs.pendingPlayers = gs.pendingPlayers.filter(p => p.id !== targetPlayerId)
      await this.saveState(gs)
      await this.broadcastState(gs)
      return
    }

    const target = gs.players.find(p => p.id === targetPlayerId)
    if (!target) return

    if (gs.phase === 'lobby') {
      gs.players = gs.players.filter(p => p.id !== targetPlayerId)
      gs.players.forEach((p, i) => { p.seatIndex = i })
    } else {
      // Mid-game: orphan the player's cards; advance turn if needed
      const wasTheirTurn = gs.currentTurnPlayerId === targetPlayerId
      const oldTurnIdx = gs.turnOrder.indexOf(targetPlayerId)

      // Remove from both arrays before cleanup so any end-of-round checks see correct counts
      gs.turnOrder = gs.turnOrder.filter(id => id !== targetPlayerId)
      gs.players = gs.players.filter(p => p.id !== targetPlayerId)

      // Game-specific cleanup; cards stay orphaned (redistributeCards = false)
      this.handlePlayerLeave(gs, target, false)

      // Advance turn if it was their turn and the round is still running
      if (wasTheirTurn && gs.phase === 'playing' && gs.turnOrder.length > 0) {
        if (gs.gameType === 'blackjack') {
          if (this.allBlackjackPlayersDone(gs)) {
            await this.saveState(gs)
            await this.broadcastState(gs)
            await this.handleBlackjackDealerPlay(gs)
            return
          }
          this.advanceTurnBlackjack(gs)
        } else {
          const nextIdx = oldTurnIdx % gs.turnOrder.length
          gs.currentTurnPlayerId = gs.turnOrder[nextIdx] ?? null
        }
      }
    }

    await this.saveState(gs)
    await this.broadcastState(gs)
  }

  private async handleRestartRound(gs: GameState): Promise<void> {
    if (!gs.gameType) return

    // Notify all players before the new deal state arrives so they see the popup
    const host = gs.players.find(p => p.id === gs.hostId)
    await this.broadcast({ type: 'round_restarted', hostName: host?.name ?? 'Host' }, null)

    // Reset per-player round state without accumulating into totals
    for (const player of gs.players) {
      player.trickCount = 0
      player.isFolded = false
      player.roundScore = 0
    }
    for (const team of gs.teams) {
      team.roundScore = 0
    }

    // Reset all per-round state that handleDeal doesn't clear itself
    gs.trumpSuit = null
    gs.lastAction = null
    gs.bluffReveal = null
    gs.lastBluffBatch = null
    gs.bluffActiveRank = null
    gs.bluffHistory = []
    gs.bluffPassCount = 0
    gs.bluffPassedPlayerIds = []
    gs.cambioDrawn = null
    gs.cambioPower = null
    gs.cambioCaller = null
    gs.cambioFinalRound = false
    gs.cambioPeekSwapTarget = null

    // Decrement roundNumber so handleDeal's ++ lands on the same round number
    gs.roundNumber = Math.max(0, gs.roundNumber - 1)

    await this.handleDeal(gs)
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
    if (!gs.players.every(p => p.isReady)) return  // wait for all initial peeks to be dismissed
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
    const topCard = discard.cards.at(-1)!
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

  // ── President handlers ────────────────────────────────────────

  private handlePresidentPlay(gs: GameState, player: Player, cardIds: string[], ws: WebSocket, wildRank?: string): string | null | undefined {
    if (gs.presidentExchangePhase) {
      this.sendTo(ws, { type: 'error', message: 'Complete the card exchange first' })
      return
    }
    if (gs.presidentDiscardPhase) {
      this.sendTo(ws, { type: 'error', message: 'Wait for run discards to complete' })
      return
    }
    if (gs.currentTurnPlayerId !== player.id) {
      this.sendTo(ws, { type: 'error', message: "It's not your turn" })
      return
    }
    if (gs.presidentPassedIds.includes(player.id)) {
      this.sendTo(ws, { type: 'error', message: "You've already passed this round" })
      return
    }
    if (gs.presidentFinishOrder.includes(player.id)) return

    const hand = gs.zones.find(z => z.id === `hand-${player.id}`)
    if (!hand) return

    const cards: Card[] = []
    for (const cardId of cardIds) {
      const idx = hand.cards.findIndex(c => c.id === cardId)
      if (idx === -1) return
      cards.push(hand.cards[idx])
    }
    if (cards.length === 0) return

    // Validate wildRank if provided (must be 4–Ace; 3, 2, and joker are excluded)
    if (wildRank && (wildRank === '3' || wildRank === '2' || wildRank === 'JKR' || !(wildRank in PRESIDENT_RANK_VALUE))) {
      this.sendTo(ws, { type: 'error', message: 'Invalid wild rank' })
      return
    }

    const combo = parseCombo(cards, wildRank)
    if (!combo) {
      this.sendTo(ws, { type: 'error', message: 'Select cards of the same rank' })
      return
    }

    const stored = gs.presidentCombo
    const tableCombo = stored ? {
      rank: stored.rank,
      maxSuit: stored.suit as Suit,
      count: stored.count,
      maxSuitIsWild: stored.maxSuitIsWild,
    } : null

    if (!comboBeats(combo, tableCombo)) {
      this.sendTo(ws, { type: 'error', message: "Doesn't beat the table — play higher" })
      return
    }

    const burn = isBurn(combo, tableCombo)
    const burnerIdxInOrder = gs.turnOrder.indexOf(player.id)

    for (const card of cards) {
      const idx = hand.cards.findIndex(c => c.id === card.id)
      if (idx !== -1) hand.cards.splice(idx, 1)
    }

    const playPile = gs.zones.find(z => z.id === 'play-pile')
    if (playPile) playPile.cards.push(...cards)

    gs.presidentCombo = { rank: combo.rank, suit: combo.maxSuit, count: combo.count, maxSuitIsWild: combo.maxSuitIsWild }

    gs.lastAction = {
      type: 'play',
      playerId: player.id,
      cardIds,
      fromZoneId: `hand-${player.id}`,
      toZoneId: 'play-pile',
      claim: burn ? 'burn' : undefined,
      timestamp: Date.now(),
    }

    const playerFinished = hand.cards.length === 0
    if (playerFinished) {
      gs.presidentFinishOrder.push(player.id)
      gs.turnOrder = gs.turnOrder.filter(id => id !== player.id)
      gs.presidentPassedIds = gs.presidentPassedIds.filter(id => id !== player.id)
    }

    if (gs.turnOrder.length <= 1) {
      for (const p of gs.players) {
        if (!gs.presidentFinishOrder.includes(p.id)) gs.presidentFinishOrder.push(p.id)
      }
      gs.presidentRoles = assignRoles(gs.presidentFinishOrder, gs.players.length)
      // Return null to signal game over — caller will broadcast state, wait for players
      // to see the final title, then set round-over.
      return null
    }

    if (burn) {
      // Return nextPlayerId — caller clears pile after showing the burn animation
      const nextPlayerId = playerFinished
        ? gs.turnOrder[burnerIdxInOrder % gs.turnOrder.length]
        : player.id
      return nextPlayerId
    }

    // ── Run tracking (non-burn plays only) ───────────────────────
    // burnerIdxInOrder was captured before any removal, so it's the correct
    // pre-removal seat position for the finished-player correction in advanceTurnPresident.
    const removedIdx = playerFinished ? burnerIdxInOrder : undefined

    // 2s and jokers always break any run
    if (combo.rank === '2' || combo.rank === 'JKR') {
      gs.presidentRunPlays = []
      gs.presidentRunExtension = null
      this.advanceTurnPresident(gs, removedIdx)
      return
    }

    const rv = PRESIDENT_RANK_VALUE[combo.rank] ?? -1

    // ── Extension mode: a run already triggered a discard; each consecutive
    //    new-player extension grants that player an immediate individual discard.
    //    Resets when the run loops back to a prior participant.
    if (gs.presidentRunExtension !== null) {
      const ext = gs.presidentRunExtension
      const lastRv = PRESIDENT_RANK_VALUE[ext.lastRank] ?? -1
      const consecutive = ext.lastPlayerId !== player.id
        && rv === lastRv + 1
        && combo.count === ext.lastCount

      if (!consecutive || ext.participants.includes(player.id)) {
        // Run broken or looped back — exit extension, start fresh run from this play
        gs.presidentRunExtension = null
        gs.presidentRunPlays = [{ playerId: player.id, rank: combo.rank, count: combo.count }]
        this.advanceTurnPresident(gs, removedIdx)
        return
      }

      // Valid extension by a new participant — immediate individual discard
      gs.presidentRunExtension = {
        lastRank: combo.rank,
        lastCount: combo.count,
        lastPlayerId: player.id,
        participants: [...ext.participants, player.id],
      }
      gs.presidentRunPlays = []
      this.advanceTurnPresident(gs, removedIdx)
      const extHand = gs.zones.find(z => z.id === `hand-${player.id}`)
      if ((extHand?.cards.length ?? 0) > 0) {
        gs.presidentDiscardPhase = [{ playerId: player.id, cardsNeeded: combo.count, done: false }]
      }
      return
    }

    // ── Normal run-building mode ─────────────────────────────────
    const last = gs.presidentRunPlays.at(-1)
    const lastRv = last ? (PRESIDENT_RANK_VALUE[last.rank] ?? -1) : -1
    const extendsRun = !last || (
      last.playerId !== player.id &&
      rv === lastRv + 1 &&
      combo.count === last.count
    )
    if (extendsRun) {
      gs.presidentRunPlays.push({ playerId: player.id, rank: combo.rank, count: combo.count })
    } else {
      gs.presidentRunPlays = [{ playerId: player.id, rank: combo.rank, count: combo.count }]
    }

    if (gs.presidentRunPlays.length >= 3) {
      // Run of 3+ detected — advance turn, open discard, enter extension mode
      this.advanceTurnPresident(gs, removedIdx)
      // Deduplicate by playerId (2-player games can produce P1→P2→P1 runs)
      const seen = new Set<string>()
      const runParticipants = [...gs.presidentRunPlays].reverse().filter(rp => {
        const h = gs.zones.find(z => z.id === `hand-${rp.playerId}`)
        if ((h?.cards.length ?? 0) === 0) return false
        if (seen.has(rp.playerId)) return false
        seen.add(rp.playerId)
        return true
      }).reverse()
      if (runParticipants.length > 0) {
        gs.presidentDiscardPhase = runParticipants.map(rp => ({
          playerId: rp.playerId,
          cardsNeeded: rp.count,
          done: false,
        }))
      }
      const lastPlay = gs.presidentRunPlays.at(-1)!
      gs.presidentRunExtension = {
        lastRank: lastPlay.rank,
        lastCount: lastPlay.count,
        lastPlayerId: lastPlay.playerId,
        participants: gs.presidentRunPlays.map(rp => rp.playerId),
      }
      gs.presidentRunPlays = []
    } else {
      this.advanceTurnPresident(gs, removedIdx)
    }
  }

  private handlePresidentPass(gs: GameState, player: Player, ws: WebSocket): void {
    if (gs.presidentExchangePhase) return
    if (gs.presidentDiscardPhase) return
    if (gs.currentTurnPlayerId !== player.id) {
      this.sendTo(ws, { type: 'error', message: "It's not your turn" })
      return
    }
    if (gs.presidentPassedIds.includes(player.id)) return
    if (gs.presidentFinishOrder.includes(player.id)) return

    gs.presidentPassedIds.push(player.id)
    gs.lastAction = { type: 'pass', playerId: player.id, timestamp: Date.now() }

    this.advanceTurnPresident(gs)
  }

  private advanceTurnPresident(gs: GameState, removedIdx?: number): void {
    const order = gs.turnOrder
    if (order.length === 0) return

    const passed = new Set(gs.presidentPassedIds)
    const active = order.filter(id => !passed.has(id))

    if (active.length <= 1) {
      // Round ends: last remaining active player starts next
      const nextId = active.length === 1 ? active[0] : (gs.currentTurnPlayerId ?? order[0])
      const playPile = gs.zones.find(z => z.id === 'play-pile')
      const cleared = gs.zones.find(z => z.id === 'cleared')
      if (playPile && cleared) { cleared.cards.push(...playPile.cards); playPile.cards = [] }
      this.endPresidentRound(gs, nextId)
      return
    }

    let curIdx = order.indexOf(gs.currentTurnPlayerId ?? '')
    if (curIdx === -1 && removedIdx !== undefined) {
      // The current player was just removed from turnOrder; reconstruct their effective
      // prior position so the search starts from the correct next slot.
      curIdx = (removedIdx - 1 + order.length) % order.length
    }
    for (let i = 1; i <= order.length; i++) {
      const candidate = order[(curIdx + i) % order.length]
      if (!passed.has(candidate)) {
        gs.currentTurnPlayerId = candidate
        return
      }
    }
  }

  private endPresidentRound(gs: GameState, nextPlayerId: string): void {
    gs.presidentCombo = null
    gs.presidentPassedIds = []
    gs.presidentRunPlays = []
    gs.presidentRunExtension = null
    gs.currentTurnPlayerId = nextPlayerId
  }

  private handlePresidentRunDiscard(gs: GameState, player: Player, cardIds: string[], ws: WebSocket): boolean {
    const phase = gs.presidentDiscardPhase
    if (!phase) return false
    const entry = phase.find(d => d.playerId === player.id && !d.done)
    if (!entry) return false

    if (cardIds.length > 0) {
      if (cardIds.length > entry.cardsNeeded) {
        this.sendTo(ws, { type: 'error', message: `Discard at most ${entry.cardsNeeded} card${entry.cardsNeeded !== 1 ? 's' : ''}` })
        return false
      }
      const hand = gs.zones.find(z => z.id === `hand-${player.id}`)
      if (!hand) { entry.done = true; return false }
      for (const cardId of cardIds) {
        const idx = hand.cards.findIndex(c => c.id === cardId)
        if (idx === -1) {
          this.sendTo(ws, { type: 'error', message: 'Card not found in your hand' })
          return false
        }
      }
      const discarded: string[] = []
      for (const cardId of cardIds) {
        const idx = hand.cards.findIndex(c => c.id === cardId)
        if (idx !== -1) { hand.cards.splice(idx, 1); discarded.push(cardId) }
      }
      // If player emptied their hand, mark them as finished
      if (hand.cards.length === 0 && !gs.presidentFinishOrder.includes(player.id)) {
        gs.presidentFinishOrder.push(player.id)
        gs.turnOrder = gs.turnOrder.filter(id => id !== player.id)
        gs.presidentPassedIds = gs.presidentPassedIds.filter(id => id !== player.id)
      }
    }

    entry.done = true

    // Close phase when all participants are done
    if (phase.every(d => d.done)) {
      gs.presidentDiscardPhase = null
      // Check if game should end (≤1 players with cards)
      if (gs.turnOrder.length <= 1) {
        for (const p of gs.players) {
          if (!gs.presidentFinishOrder.includes(p.id)) gs.presidentFinishOrder.push(p.id)
        }
        gs.presidentRoles = assignRoles(gs.presidentFinishOrder, gs.players.length)
        return true  // caller will delay before setting round-over
      }
    }
    return false
  }

  private handlePresidentExchangeReturn(gs: GameState, player: Player, cardIds: string[], ws: WebSocket): boolean {
    const phase = gs.presidentExchangePhase
    if (!phase) return false
    const entry = phase.find(e => e.playerId === player.id && !e.done)
    if (!entry) {
      this.sendTo(ws, { type: 'error', message: 'Not your turn to return cards' })
      return false
    }
    if (cardIds.length !== entry.cardsOwed) {
      this.sendTo(ws, { type: 'error', message: `Must return exactly ${entry.cardsOwed} card${entry.cardsOwed !== 1 ? 's' : ''}` })
      return false
    }

    const myHand = gs.zones.find(z => z.id === `hand-${player.id}`)
    const recipientHand = gs.zones.find(z => z.id === `hand-${entry.recipientId}`)
    if (!myHand || !recipientHand) return false

    for (const cardId of cardIds) {
      if (!myHand.cards.find(c => c.id === cardId)) {
        this.sendTo(ws, { type: 'error', message: 'Card not in your hand' })
        return false
      }
    }

    for (const cardId of cardIds) {
      const idx = myHand.cards.findIndex(c => c.id === cardId)
      if (idx !== -1) {
        const [card] = myHand.cards.splice(idx, 1)
        recipientHand.cards.push(card)
        entry.returnedCardIds.push(card.id)
      }
    }

    entry.done = true
    return phase.every(e => e.done)
    // Caller is responsible for nulling presidentExchangePhase when this returns true,
    // after doing an intermediate broadcast so clients can read returnedCardIds first.
  }

  // ── End President handlers ────────────────────────────────────

  // ── Go Fish handlers ─────────────────────────────────────────

  private async handleGoFishAsk(gs: GameState, asker: Player, targetPlayerId: string, rank: string): Promise<void> {
    // Validate asker holds at least one card of the requested rank
    const askerHand = gs.zones.find(z => z.id === `hand-${asker.id}`)
    if (!askerHand || !askerHand.cards.some(c => c.rank === rank)) return

    const targetPlayer = gs.players.find(p => p.id === targetPlayerId)
    if (!targetPlayer || targetPlayerId === asker.id) return

    const targetHand = gs.zones.find(z => z.id === `hand-${targetPlayerId}`)
    if (!targetHand) return

    const matchingCards = targetHand.cards.filter(c => c.rank === rank)
    const success = matchingCards.length > 0
    let luckyFish = false
    let drewCard = false

    if (success) {
      // Transfer all matching cards from target to asker
      for (const card of matchingCards) {
        const idx = targetHand.cards.findIndex(c => c.id === card.id)
        if (idx !== -1) {
          targetHand.cards.splice(idx, 1)
          askerHand.cards.push(card)
        }
      }
      gs.goFishLastAsk = { askerId: asker.id, targetId: targetPlayerId, rank, success: true, luckyFish: false, drewCard: false }
    } else if (this.drawPile.length > 0) {
      // Go Fish with cards remaining: notify all players first, then draw after a pause
      gs.goFishLastAsk = { askerId: asker.id, targetId: targetPlayerId, rank, success: false, luckyFish: false, drewCard: false }
      await this.saveState(gs)
      await this.broadcastState(gs)
      await new Promise<void>(r => setTimeout(r, 1500))

      const drawn = this.drawPile.shift()!
      gs.drawPileCount = this.drawPile.length
      askerHand.cards.push(drawn)
      luckyFish = drawn.rank === rank
      drewCard = true
      gs.goFishLastAsk = { askerId: asker.id, targetId: targetPlayerId, rank, success: false, luckyFish, drewCard: true }
    } else {
      // Pile is empty — no draw
      gs.goFishLastAsk = { askerId: asker.id, targetId: targetPlayerId, rank, success: false, luckyFish: false, drewCard: false }
    }

    // Check if asker formed any books after receiving cards
    this.goFishCheckBooks(gs, asker.id)

    // If target now has empty hand, draw 1 card
    if (targetHand.cards.length === 0 && this.drawPile.length > 0) {
      const drawn = this.drawPile.shift()!
      gs.drawPileCount = this.drawPile.length
      targetHand.cards.push(drawn)
      this.goFishCheckBooks(gs, targetPlayerId)
    }

    // Check game over
    if (this.goFishIsGameOver(gs)) {
      for (const p of gs.players) {
        p.roundScore = gs.goFishBooks[p.id]?.length ?? 0
      }
      gs.phase = 'round-over'
      await this.saveState(gs)
      await this.broadcastState(gs)
      return
    }

    // Keep turn if success or lucky fish; otherwise advance
    if (!success && !luckyFish) {
      this.advanceTurnGoFish(gs)
    }
    // If asker now has empty hand, draw a card so they can continue
    else if (askerHand.cards.length === 0 && this.drawPile.length > 0) {
      const drawn = this.drawPile.shift()!
      gs.drawPileCount = this.drawPile.length
      askerHand.cards.push(drawn)
      this.goFishCheckBooks(gs, asker.id)
    }

    await this.saveState(gs)
    await this.broadcastState(gs)
  }

  private goFishCheckBooks(gs: GameState, playerId: string): void {
    const handZone = gs.zones.find(z => z.id === `hand-${playerId}`)
    const booksZone = gs.zones.find(z => z.id === `books-${playerId}`)
    if (!handZone || !booksZone) return

    const rankCounts: Record<string, number> = {}
    for (const card of handZone.cards) {
      rankCounts[card.rank] = (rankCounts[card.rank] ?? 0) + 1
    }

    for (const [rank, count] of Object.entries(rankCounts)) {
      if (count >= 4) {
        // Remove all 4 from hand and place in books zone
        const bookCards: typeof handZone.cards = []
        let remaining = 4
        handZone.cards = handZone.cards.filter(c => {
          if (c.rank === rank && remaining > 0) {
            bookCards.push(c)
            remaining--
            return false
          }
          return true
        })
        booksZone.cards.push(...bookCards)
        if (!gs.goFishBooks[playerId]) gs.goFishBooks[playerId] = []
        gs.goFishBooks[playerId].push(rank)
      }
    }
  }

  private goFishIsGameOver(gs: GameState): boolean {
    const totalBooks = Object.values(gs.goFishBooks).reduce((sum, b) => sum + b.length, 0)
    if (totalBooks >= 13) return true
    if (this.drawPile.length > 0) return false
    return gs.players.every(p => {
      const hand = gs.zones.find(z => z.id === `hand-${p.id}`)
      return !hand || hand.cards.length === 0
    })
  }

  private advanceTurnGoFish(gs: GameState): void {
    if (gs.turnOrder.length === 0) return
    let idx = gs.turnOrder.indexOf(gs.currentTurnPlayerId ?? '')
    for (let i = 0; i < gs.turnOrder.length; i++) {
      idx = (idx + 1) % gs.turnOrder.length
      const nextId = gs.turnOrder[idx]
      const nextHand = gs.zones.find(z => z.id === `hand-${nextId}`)
      // Skip players with no cards AND no draw pile to refill from
      if (nextHand && (nextHand.cards.length > 0 || this.drawPile.length > 0)) {
        // If their hand is empty, draw one before it becomes their turn
        if (nextHand.cards.length === 0 && this.drawPile.length > 0) {
          const drawn = this.drawPile.shift()!
          gs.drawPileCount = this.drawPile.length
          nextHand.cards.push(drawn)
          this.goFishCheckBooks(gs, nextId)
        }
        gs.currentTurnPlayerId = nextId
        return
      }
    }
    gs.currentTurnPlayerId = null
  }

  // ── End Go Fish handlers ──────────────────────────────────────

  // ── Rummy handlers ────────────────────────────────────────────

  private handleRummyDraw(gs: GameState, player: Player, fromDiscard: boolean): void {
    if (gs.rummyHasDrawn) return

    const handZone = gs.zones.find(z => z.id === `hand-${player.id}`)
    if (!handZone) return

    if (fromDiscard) {
      const discardZone = gs.zones.find(z => z.id === 'discard')
      if (!discardZone || discardZone.cards.length === 0) return
      const card = discardZone.cards.pop()!
      handZone.cards.push(card)
      gs.rummyHasDrawn = true
      gs.lastAction = { type: 'draw', playerId: player.id, fromZoneId: 'discard', toZoneId: `hand-${player.id}`, timestamp: Date.now() }
    } else {
      if (this.drawPile.length === 0) this.reshuffleRummyDiscard(gs)
      if (this.drawPile.length === 0) {
        // Both piles empty — allow hasDrawn so player can still discard
        gs.rummyHasDrawn = true
        return
      }
      const card = this.drawPile.shift()!
      gs.drawPileCount = this.drawPile.length
      handZone.cards.push(card)
      gs.rummyHasDrawn = true
      gs.lastAction = { type: 'draw', playerId: player.id, toZoneId: `hand-${player.id}`, timestamp: Date.now() }
    }
  }

  private async handleRummyDiscard(gs: GameState, player: Player, cardId: string, faceDown: boolean): Promise<void> {
    if (!gs.rummyHasDrawn) return

    const handZone = gs.zones.find(z => z.id === `hand-${player.id}`)
    if (!handZone) return

    const idx = handZone.cards.findIndex(c => c.id === cardId)
    if (idx === -1) return

    if (faceDown) {
      // Going out: all remaining cards must meld AND at least one meld must be a pure run
      const remaining = handZone.cards.filter(c => c.id !== cardId)
      if (checkRummyGoOut(remaining) !== 'ok') return
      const [card] = handZone.cards.splice(idx, 1)
      const discardZone = gs.zones.find(z => z.id === 'discard')
      if (discardZone) discardZone.cards.push(card)
      gs.rummyHasDrawn = false
      gs.lastAction = { type: 'play', playerId: player.id, cardIds: [cardId], toZoneId: 'discard', timestamp: Date.now() }
      await this.endRummyRound(gs, player.id)
      return
    }

    // Normal face-up discard
    const [card] = handZone.cards.splice(idx, 1)
    const discardZone = gs.zones.find(z => z.id === 'discard')
    if (discardZone) discardZone.cards.push(card)

    gs.rummyHasDrawn = false
    gs.lastAction = { type: 'play', playerId: player.id, cardIds: [cardId], toZoneId: 'discard', timestamp: Date.now() }

    this.advanceTurn(gs)
    await this.saveState(gs)
    await this.broadcastState(gs)
  }

  private async endRummyRound(gs: GameState, winnerPlayerId: string): Promise<void> {
    for (const p of gs.players) {
      if (p.id === winnerPlayerId) {
        p.roundScore = 0
        continue
      }
      const handZone = gs.zones.find(z => z.id === `hand-${p.id}`)
      p.roundScore = (handZone?.cards ?? []).reduce((sum, c) => sum + this.rummyCardScore(c), 0)
    }
    gs.phase = 'round-over'
    await this.saveState(gs)
    await this.broadcastState(gs)
  }

  private rummyCardScore(card: Card): number {
    if (card.rank === 'JKR') return 25
    if (['J', 'Q', 'K'].includes(card.rank)) return 10
    if (card.rank === 'A') return 1
    return Number(card.rank)
  }

  private reshuffleRummyDiscard(gs: GameState): void {
    const discardZone = gs.zones.find(z => z.id === 'discard')
    if (!discardZone || discardZone.cards.length <= 1) return

    const topCard = discardZone.cards.at(-1)!
    const toReshuffle = discardZone.cards.slice(0, -1)
    discardZone.cards = [topCard]

    this.drawPile.push(...toReshuffle)
    this.drawPile = shuffle(this.drawPile)
    gs.drawPileCount = this.drawPile.length
  }

  // ── End Rummy handlers ────────────────────────────────────────

  // ── Crazy Eights handlers ─────────────────────────────────────

  private async handleCrazy8sPlay(gs: GameState, player: Player, cardId: string, declaredSuit?: Suit): Promise<void> {
    const handZone = gs.zones.find(z => z.id === `hand-${player.id}`)
    const discardZone = gs.zones.find(z => z.id === 'discard')
    if (!handZone || !discardZone) return

    const cardIdx = handZone.cards.findIndex(c => c.id === cardId)
    if (cardIdx === -1) return

    const card = handZone.cards[cardIdx]
    const topCard = discardZone.cards.at(-1)
    if (!topCard) return

    const effectiveSuit = gs.crazy8sDeclaredSuit ?? topCard.suit
    const canPlay = card.rank === '8' || card.rank === topCard.rank || card.suit === effectiveSuit
    if (!canPlay) return

    handZone.cards.splice(cardIdx, 1)
    discardZone.cards.push(card)

    if (card.rank === '8') {
      gs.crazy8sDeclaredSuit = declaredSuit ?? 'spades'
    } else {
      gs.crazy8sDeclaredSuit = null
    }

    gs.lastAction = {
      type: 'play',
      playerId: player.id,
      cardIds: [cardId],
      fromZoneId: `hand-${player.id}`,
      toZoneId: 'discard',
      timestamp: Date.now(),
    }

    if (handZone.cards.length === 0) {
      await this.endCrazy8sRound(gs, player.id)
      return
    }

    this.advanceTurn(gs)
    await this.saveState(gs)
    await this.broadcastState(gs)
  }

  private handleCrazy8sDraw(gs: GameState, player: Player): void {
    if (this.drawPile.length === 0) this.reshuffleDiscardIntoDraw(gs)
    if (this.drawPile.length === 0) {
      // Deck is empty, nothing to draw — pass turn
      this.advanceTurn(gs)
      gs.lastAction = { type: 'pass', playerId: player.id, timestamp: Date.now() }
      return
    }

    const handZone = gs.zones.find(z => z.id === `hand-${player.id}`)
    if (!handZone) return

    const card = this.drawPile.shift()!
    handZone.cards.push(card)
    gs.drawPileCount = this.drawPile.length

    gs.lastAction = { type: 'draw', playerId: player.id, toZoneId: `hand-${player.id}`, timestamp: Date.now() }
  }

  private async endCrazy8sRound(gs: GameState, winnerId: string): Promise<void> {
    for (const p of gs.players) {
      const handZone = gs.zones.find(z => z.id === `hand-${p.id}`)
      if (!handZone) continue
      p.roundScore = handZone.cards.reduce((sum, c) => sum + this.crazy8sCardScore(c), 0)
      // Reveal all hands so the round-over screen can show remaining cards
      handZone.visibility = 'face-up'
    }
    gs.phase = 'round-over'
    gs.lastAction = { type: 'play', playerId: winnerId, timestamp: Date.now() }
    await this.saveState(gs)
    await this.broadcastState(gs)
  }

  private crazy8sCardScore(card: Card): number {
    if (card.rank === '8') return 50
    if (['J', 'Q', 'K'].includes(card.rank)) return 10
    if (card.rank === 'A') return 1
    const n = parseInt(card.rank)
    return isNaN(n) ? 0 : n
  }

  // ── End Crazy Eights handlers ─────────────────────────────────

  // ── Standard helpers ──────────────────────────────────────────

  private advanceTurn(gs: GameState): void {
    if (gs.turnOrder.length === 0) return
    const idx = gs.turnOrder.indexOf(gs.currentTurnPlayerId ?? '')
    const next = (idx + 1) % gs.turnOrder.length
    gs.currentTurnPlayerId = gs.turnOrder[next]
  }

  private isBlackjackPlayerDone(gs: GameState, pid: string): boolean {
    const p = gs.players.find(q => q.id === pid)
    if (gs.blackjackSplits.includes(pid)) {
      return gs.blackjackMainHandDone.includes(pid) && gs.blackjackStood.includes(pid)
    }
    return (p?.isFolded ?? false) || gs.blackjackStood.includes(pid)
  }

  private advanceTurnBlackjack(gs: GameState): void {
    if (gs.turnOrder.length === 0) return
    let idx = gs.turnOrder.indexOf(gs.currentTurnPlayerId ?? '')
    for (let i = 0; i < gs.turnOrder.length; i++) {
      idx = (idx + 1) % gs.turnOrder.length
      if (!this.isBlackjackPlayerDone(gs, gs.turnOrder[idx])) {
        gs.currentTurnPlayerId = gs.turnOrder[idx]
        return
      }
    }
    gs.currentTurnPlayerId = null
  }

  private advanceTurnSkipPassed(gs: GameState): void {
    if (gs.turnOrder.length === 0) return
    const passed = new Set(gs.bluffPassedPlayerIds)
    let idx = gs.turnOrder.indexOf(gs.currentTurnPlayerId ?? '')
    for (let i = 0; i < gs.turnOrder.length; i++) {
      idx = (idx + 1) % gs.turnOrder.length
      if (!passed.has(gs.turnOrder[idx])) {
        gs.currentTurnPlayerId = gs.turnOrder[idx]
        return
      }
    }
    // All passed (shouldn't happen if caller checks first), just advance normally
    gs.currentTurnPlayerId = gs.turnOrder[(idx + 1) % gs.turnOrder.length]
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

  // ── Poker handlers ──────────────────────────────────────────────────────

  private async handlePokerCheck(gs: GameState, player: Player, ws: WebSocket): Promise<void> {
    const playerBet = gs.pokerPlayerBets[player.id] ?? 0
    if (playerBet < gs.pokerCurrentBet) {
      this.sendTo(ws, { type: 'error', message: 'You must call or raise' })
      return
    }
    if (!gs.pokerActedThisRound.includes(player.id)) gs.pokerActedThisRound.push(player.id)
    gs.lastAction = { type: 'pass', playerId: player.id, timestamp: Date.now() }
    await this.afterPokerAction(gs)
  }

  private async handlePokerCall(gs: GameState, player: Player): Promise<void> {
    const playerBet = gs.pokerPlayerBets[player.id] ?? 0
    const chips = gs.pokerChips[player.id] ?? 0
    const needed = gs.pokerCurrentBet - playerBet
    const paying = Math.min(needed, chips)

    gs.pokerChips[player.id] = chips - paying
    gs.pokerPlayerBets[player.id] = playerBet + paying
    gs.pokerPot += paying

    if (gs.pokerChips[player.id] === 0 && !gs.pokerAllIn.includes(player.id)) {
      gs.pokerAllIn.push(player.id)
    }
    if (!gs.pokerActedThisRound.includes(player.id)) gs.pokerActedThisRound.push(player.id)
    gs.lastAction = { type: 'play', playerId: player.id, timestamp: Date.now() }
    await this.afterPokerAction(gs)
  }

  private async handlePokerBet(gs: GameState, player: Player, amount: number): Promise<void> {
    const playerBet = gs.pokerPlayerBets[player.id] ?? 0
    const chips = gs.pokerChips[player.id] ?? 0
    const bigBlind = gs.pokerSmallBlind * 2
    const minRaiseTo = gs.pokerCurrentBet + bigBlind
    const raiseTo = Math.max(minRaiseTo, Math.min(amount, playerBet + chips))
    const toAdd = Math.min(raiseTo - playerBet, chips)

    gs.pokerChips[player.id] = chips - toAdd
    gs.pokerPlayerBets[player.id] = playerBet + toAdd
    gs.pokerPot += toAdd
    gs.pokerCurrentBet = gs.pokerPlayerBets[player.id]

    if (gs.pokerChips[player.id] === 0 && !gs.pokerAllIn.includes(player.id)) {
      gs.pokerAllIn.push(player.id)
    }
    // Reset acted — everyone else must respond to the raise
    gs.pokerActedThisRound = [player.id]
    gs.lastAction = { type: 'play', playerId: player.id, timestamp: Date.now() }
    await this.afterPokerAction(gs)
  }

  private async handlePokerAllIn(gs: GameState, player: Player): Promise<void> {
    const playerBet = gs.pokerPlayerBets[player.id] ?? 0
    const chips = gs.pokerChips[player.id] ?? 0
    if (chips === 0) return

    const newTotal = playerBet + chips
    gs.pokerPot += chips
    gs.pokerPlayerBets[player.id] = newTotal
    gs.pokerChips[player.id] = 0

    if (!gs.pokerAllIn.includes(player.id)) gs.pokerAllIn.push(player.id)

    if (newTotal > gs.pokerCurrentBet) {
      gs.pokerCurrentBet = newTotal
      gs.pokerActedThisRound = [player.id]  // raise — others must respond
    } else {
      if (!gs.pokerActedThisRound.includes(player.id)) gs.pokerActedThisRound.push(player.id)
    }
    gs.lastAction = { type: 'play', playerId: player.id, timestamp: Date.now() }
    await this.afterPokerAction(gs)
  }

  private async handlePokerFold(gs: GameState, player: Player): Promise<void> {
    player.isFolded = true
    gs.lastAction = { type: 'fold', playerId: player.id, timestamp: Date.now() }
    await this.afterPokerAction(gs)
  }

  private async afterPokerAction(gs: GameState): Promise<void> {
    const nonFolded = gs.players.filter(p => !p.isFolded)

    if (nonFolded.length <= 1) {
      if (nonFolded.length === 1) {
        const winner = nonFolded[0]
        gs.pokerChips[winner.id] = (gs.pokerChips[winner.id] ?? 0) + gs.pokerPot
        gs.pokerWinners = [{ playerId: winner.id, amount: gs.pokerPot, handName: '' }]
        gs.pokerPot = 0
      }
      gs.phase = 'round-over'
      gs.pokerPhase = 'showdown'
      await this.saveState(gs); await this.broadcastState(gs)
      return
    }

    if (this.isPokerBettingRoundComplete(gs)) {
      await this.advancePokerPhase(gs)
    } else {
      this.advancePokerTurn(gs)
      await this.saveState(gs); await this.broadcastState(gs)
    }
  }

  private isPokerBettingRoundComplete(gs: GameState): boolean {
    const nonFolded = gs.players.filter(p => !p.isFolded)
    if (nonFolded.length <= 1) return true

    const active = nonFolded.filter(p => !gs.pokerAllIn.includes(p.id))
    if (active.length === 0) return true  // everyone all-in

    return active.every(p =>
      gs.pokerActedThisRound.includes(p.id) &&
      (gs.pokerPlayerBets[p.id] ?? 0) >= gs.pokerCurrentBet
    )
  }

  private advancePokerTurn(gs: GameState): void {
    const order = gs.turnOrder
    if (!order.length) return

    const curIdx = order.indexOf(gs.currentTurnPlayerId ?? '')
    for (let i = 1; i <= order.length; i++) {
      const pid = order[(curIdx + i) % order.length]
      const p = gs.players.find(x => x.id === pid)
      if (!p || p.isFolded || gs.pokerAllIn.includes(pid)) continue
      gs.currentTurnPlayerId = pid
      return
    }
    gs.currentTurnPlayerId = null
  }

  private setPokerPostFlopOrder(gs: GameState): void {
    const allSorted = [...gs.players].sort((a, b) => a.seatIndex - b.seatIndex)
    const n = allSorted.length
    const dealerPos = allSorted.findIndex(p => p.id === gs.pokerDealerPlayerId)

    const order: string[] = []
    for (let i = 1; i <= n; i++) order.push(allSorted[(dealerPos + i) % n].id)
    gs.turnOrder = order

    const firstActive = order.find(id => {
      const p = gs.players.find(x => x.id === id)
      return p && !p.isFolded && !gs.pokerAllIn.includes(id)
    })
    gs.currentTurnPlayerId = firstActive ?? null
  }

  private async advancePokerPhase(gs: GameState): Promise<void> {
    gs.pokerCurrentBet = 0
    gs.pokerPlayerBets = {}
    gs.pokerActedThisRound = []

    const phaseMap: Record<string, string> = {
      'pre-flop': 'flop', 'flop': 'turn', 'turn': 'river', 'river': 'showdown',
    }
    const nextPhase = phaseMap[gs.pokerPhase ?? '']

    if (!nextPhase || nextPhase === 'showdown') {
      gs.pokerPhase = 'showdown'
      this.resolvePokerShowdown(gs)
      await this.saveState(gs); await this.broadcastState(gs)
      return
    }

    gs.pokerPhase = nextPhase as GameState['pokerPhase']

    // Burn a card and deal community cards for this phase
    const burnZone = gs.zones.find(z => z.id === 'burn')
    if (this.drawPile.length > 0 && burnZone) burnZone.cards.push(this.drawPile.shift()!)

    if (nextPhase === 'flop') {
      const flopZone = gs.zones.find(z => z.id === 'flop')
      for (let i = 0; i < 3 && this.drawPile.length > 0; i++) {
        flopZone?.cards.push(this.drawPile.shift()!)
      }
    } else {
      const zone = gs.zones.find(z => z.id === nextPhase)
      if (this.drawPile.length > 0) zone?.cards.push(this.drawPile.shift()!)
    }
    gs.drawPileCount = this.drawPile.length

    // If everyone is all-in, auto-run out remaining streets with short delays
    const nonFolded = gs.players.filter(p => !p.isFolded)
    const activeNotAllIn = nonFolded.filter(p => !gs.pokerAllIn.includes(p.id))

    if (activeNotAllIn.length === 0) {
      await this.saveState(gs); await this.broadcastState(gs)
      await new Promise<void>(r => setTimeout(r, 1500))
      await this.advancePokerPhase(gs)
      return
    }

    this.setPokerPostFlopOrder(gs)
    await this.saveState(gs); await this.broadcastState(gs)
  }

  private resolvePokerShowdown(gs: GameState): void {
    // Reveal non-folded players' hole cards
    for (const zone of gs.zones) {
      if (!zone.id.startsWith('hole-cards-')) continue
      const pid = zone.id.slice('hole-cards-'.length)
      const p = gs.players.find(x => x.id === pid)
      if (p && !p.isFolded) zone.visibility = 'face-up'
    }

    // Gather community cards
    const community = [
      ...(gs.zones.find(z => z.id === 'flop')?.cards ?? []),
      ...(gs.zones.find(z => z.id === 'turn')?.cards ?? []),
      ...(gs.zones.find(z => z.id === 'river')?.cards ?? []),
    ]

    const nonFolded = gs.players.filter(p => !p.isFolded)

    if (nonFolded.length === 1) {
      const winner = nonFolded[0]
      gs.pokerChips[winner.id] = (gs.pokerChips[winner.id] ?? 0) + gs.pokerPot
      gs.pokerWinners = [{ playerId: winner.id, amount: gs.pokerPot, handName: '' }]
      gs.pokerPot = 0
      gs.phase = 'round-over'
      return
    }

    // Evaluate each remaining player's best 5-card hand
    const results = nonFolded.map(p => {
      const holeZone = gs.zones.find(z => z.id === `hole-cards-${p.id}`)
      const cards = [...(holeZone?.cards ?? []), ...community]
      const hand = cards.length >= 5 ? bestHand(cards) : { score: -1, name: 'Not enough cards' }
      return { player: p, hand }
    })

    const maxScore = Math.max(...results.map(r => r.hand.score))
    const winners = results.filter(r => r.hand.score === maxScore)

    const share = Math.floor(gs.pokerPot / winners.length)
    const remainder = gs.pokerPot - share * winners.length

    gs.pokerWinners = winners.map((w, i) => {
      const amount = share + (i === 0 ? remainder : 0)
      gs.pokerChips[w.player.id] = (gs.pokerChips[w.player.id] ?? 0) + amount
      return { playerId: w.player.id, amount, handName: w.hand.name }
    })

    gs.pokerPot = 0
    gs.phase = 'round-over'
  }

  // ── Blackjack handlers ───────────────────────────────────────────────────

  private bjSplitValue(rank: string): number {
    if (['J', 'Q', 'K'].includes(rank)) return 10
    if (rank === 'A') return 11
    return Number(rank)
  }

  private async handleBlackjackSplit(gs: GameState, player: Player): Promise<void> {
    if (gs.currentTurnPlayerId !== player.id) return
    const pid = player.id
    if (gs.blackjackSplits.includes(pid)) return       // already split
    if (gs.blackjackMainHandDone.includes(pid)) return  // past the split window

    const mainZone = gs.zones.find(z => z.id === `hand-${pid}`)
    if (!mainZone || mainZone.cards.length !== 2) return

    const [c1, c2] = mainZone.cards
    if (this.bjSplitValue(c1.rank) !== this.bjSplitValue(c2.rank)) return

    // Split bet is equal to the original bet, capped at remaining chips
    const splitBet = Math.min(gs.blackjackBets[pid] ?? 0, gs.blackjackChips[pid] ?? 0)
    if (splitBet <= 0) return

    gs.blackjackChips[pid] = (gs.blackjackChips[pid] ?? 0) - splitBet
    gs.blackjackSplitBets[pid] = splitBet

    // Second card moves to the split zone
    const splitCard = mainZone.cards.pop()!
    const splitZone: Zone = {
      id: `hand-${pid}-b`,
      name: 'Split Hand',
      visibility: 'face-up',
      ownerId: pid,
      cards: [splitCard],
      capacity: null,
      gridPosition: null,
      claimLabel: null,
      isBluffPile: false,
    }
    gs.zones.push(splitZone)

    // Each hand gets one fresh card
    if (this.drawPile.length > 0) {
      mainZone.cards.push(this.drawPile.shift()!)
      gs.drawPileCount = this.drawPile.length
    }
    if (this.drawPile.length > 0) {
      splitZone.cards.push(this.drawPile.shift()!)
      gs.drawPileCount = this.drawPile.length
    }

    gs.blackjackSplits.push(pid)
    gs.lastAction = { type: 'deal', playerId: pid, timestamp: Date.now() }

    // Auto-advance if main hand landed on 21
    if (this.bjHandValue(mainZone.cards) === 21) {
      gs.blackjackMainHandDone.push(pid)
      if (this.bjHandValue(splitZone.cards) === 21) {
        if (!gs.blackjackStood.includes(pid)) gs.blackjackStood.push(pid)
        this.advanceTurnBlackjack(gs)
      }
    }

    if (this.allBlackjackPlayersDone(gs)) {
      await this.saveState(gs)
      await this.broadcastState(gs)
      await this.handleBlackjackDealerPlay(gs)
      return
    }
    await this.saveState(gs)
    await this.broadcastState(gs)
  }

  private allBlackjackPlayersDone(gs: GameState): boolean {
    return gs.turnOrder.every(pid => {
      const p = gs.players.find(q => q.id === pid)
      if (gs.blackjackSplits.includes(pid)) {
        return gs.blackjackMainHandDone.includes(pid) && gs.blackjackStood.includes(pid)
      }
      return p?.isFolded || gs.blackjackStood.includes(pid)
    })
  }

  private async handleBlackjackStand(gs: GameState, player: Player): Promise<void> {
    if (gs.currentTurnPlayerId !== player.id) return
    const pid = player.id
    const hasSplit = gs.blackjackSplits.includes(pid)
    const mainDone = gs.blackjackMainHandDone.includes(pid)

    if (hasSplit && !mainDone) {
      // Standing on main hand — switch to split hand (keep same turn player)
      gs.blackjackMainHandDone.push(pid)
    } else {
      // Standing on split hand, or no split — fully done
      if (!gs.blackjackStood.includes(pid)) gs.blackjackStood.push(pid)
      this.advanceTurnBlackjack(gs)
    }
    gs.lastAction = { type: 'pass', playerId: pid, timestamp: Date.now() }

    if (this.allBlackjackPlayersDone(gs)) {
      await this.saveState(gs)
      await this.broadcastState(gs)
      await this.handleBlackjackDealerPlay(gs)
      return
    }
    await this.saveState(gs)
    await this.broadcastState(gs)
  }

  private async handleBlackjackHit(gs: GameState, player: Player, _toZoneId: string): Promise<void> {
    if (gs.currentTurnPlayerId !== player.id) return
    const pid = player.id
    const hasSplit = gs.blackjackSplits.includes(pid)
    const mainDone = gs.blackjackMainHandDone.includes(pid)

    // Always derive the active zone from split state (ignore client-supplied toZoneId)
    const activeZoneId = (hasSplit && mainDone) ? `hand-${pid}-b` : `hand-${pid}`
    const zone = gs.zones.find(z => z.id === activeZoneId)
    if (!zone || this.drawPile.length === 0) return

    const card = this.drawPile.shift()!
    zone.cards.push(card)
    gs.drawPileCount = this.drawPile.length
    gs.lastAction = { type: 'draw', playerId: pid, toZoneId: activeZoneId, timestamp: Date.now() }

    const value = this.bjHandValue(zone.cards)
    if (value >= 21) {
      // Broadcast the 21 / bust so the client can show it briefly before advancing
      await this.saveState(gs)
      await this.broadcastState(gs)
      await new Promise<void>(r => setTimeout(r, 1500))

      if (value > 21) {
        if (hasSplit && !mainDone) {
          gs.blackjackMainHandDone.push(pid)
        } else if (hasSplit && mainDone) {
          if (!gs.blackjackStood.includes(pid)) gs.blackjackStood.push(pid)
          this.advanceTurnBlackjack(gs)
        } else {
          player.isFolded = true
          if (!gs.blackjackStood.includes(pid)) gs.blackjackStood.push(pid)
          this.advanceTurnBlackjack(gs)
        }
      } else {
        // Hit 21 exactly — auto-stand
        if (hasSplit && !mainDone) {
          gs.blackjackMainHandDone.push(pid)
        } else {
          if (!gs.blackjackStood.includes(pid)) gs.blackjackStood.push(pid)
          this.advanceTurnBlackjack(gs)
        }
      }

      if (this.allBlackjackPlayersDone(gs)) {
        await this.saveState(gs)
        await this.broadcastState(gs)
        await this.handleBlackjackDealerPlay(gs)
        return
      }
      await this.saveState(gs)
      await this.broadcastState(gs)
      return
    }

    if (this.allBlackjackPlayersDone(gs)) {
      await this.saveState(gs)
      await this.broadcastState(gs)
      await this.handleBlackjackDealerPlay(gs)
      return
    }
    await this.saveState(gs)
    await this.broadcastState(gs)
  }

  private async handleBlackjackDealerPlay(gs: GameState): Promise<void> {
    const dealerZone = gs.zones.find(z => z.id === 'dealer-hand')
    if (!dealerZone) return

    // Reveal face-down card
    for (const card of dealerZone.cards) {
      if (card.id.endsWith('__facedown')) {
        card.id = card.id.replace('__facedown', '')
      }
    }
    gs.currentTurnPlayerId = null
    await this.saveState(gs)
    await this.broadcastState(gs)
    await new Promise<void>(r => setTimeout(r, 900))

    // Hit until dealer value >= 17
    while (this.bjHandValue(dealerZone.cards) < 17 && this.drawPile.length > 0) {
      const card = this.drawPile.shift()!
      dealerZone.cards.push(card)
      gs.drawPileCount = this.drawPile.length
      await this.saveState(gs)
      await this.broadcastState(gs)
      await new Promise<void>(r => setTimeout(r, 900))
    }

    const dealerValue = this.bjHandValue(dealerZone.cards)
    const dealerBust = dealerValue > 21
    const dealerBJ = dealerZone.cards.length === 2 && dealerValue === 21

    const settle = (val: number, isNatural: boolean, bet: number, pid: string): 'win' | 'blackjack' | 'push' | 'lose' => {
      if (val > 21) return 'lose'
      if (isNatural && dealerBJ) {
        gs.blackjackChips[pid] = (gs.blackjackChips[pid] ?? 0) + bet
        return 'push'
      }
      if (isNatural) {
        gs.blackjackChips[pid] = (gs.blackjackChips[pid] ?? 0) + Math.floor(bet * 2.5)
        return 'blackjack'
      }
      if (dealerBust || val > dealerValue) {
        gs.blackjackChips[pid] = (gs.blackjackChips[pid] ?? 0) + bet * 2
        return 'win'
      }
      if (val === dealerValue) {
        gs.blackjackChips[pid] = (gs.blackjackChips[pid] ?? 0) + bet
        return 'push'
      }
      return 'lose'
    }

    const results: Record<string, 'win' | 'blackjack' | 'push' | 'lose'> = {}
    const splitResults: Record<string, 'win' | 'blackjack' | 'push' | 'lose'> = {}
    for (const pid of gs.turnOrder) {
      const bet = gs.blackjackBets[pid] ?? 0
      const hasSplit = gs.blackjackSplits.includes(pid)
      const mainZone = gs.zones.find(z => z.id === `hand-${pid}`)
      const mainVal = this.bjHandValue(mainZone?.cards ?? [])
      // Natural blackjack only counts on an unsplit hand of exactly 2 cards
      const mainBJ = !hasSplit && (mainZone?.cards.length ?? 0) === 2 && mainVal === 21
      results[pid] = settle(mainVal, mainBJ, bet, pid)

      if (hasSplit) {
        const splitBet = gs.blackjackSplitBets[pid] ?? 0
        const splitZone = gs.zones.find(z => z.id === `hand-${pid}-b`)
        const splitVal = this.bjHandValue(splitZone?.cards ?? [])
        splitResults[pid] = settle(splitVal, false, splitBet, pid)
      }
    }

    gs.blackjackResults = results
    gs.blackjackSplitResults = gs.blackjackSplits.length > 0 ? splitResults : null
    gs.phase = 'round-over'
    await this.saveState(gs)
    await this.broadcastState(gs)
  }
}
