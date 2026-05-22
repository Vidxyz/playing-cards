import { Hono } from 'hono'
import { cors } from 'hono/cors'

export { RoomDO } from './RoomDO'

type Env = {
  ROOMS: DurableObjectNamespace
  ALLOWED_ORIGINS: string
}

const app = new Hono<{ Bindings: Env }>()

app.use('*', async (c, next) => {
  const origins = c.env.ALLOWED_ORIGINS
    ? c.env.ALLOWED_ORIGINS.split(',')
    : ['http://localhost:3000']

  return cors({
    origin: origins,
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
  })(c, next)
})

// Create a new room
app.post('/api/rooms', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { hostName?: string }
  const hostName = body.hostName?.trim() || 'Host'

  const roomCode = Math.random().toString(36).slice(2, 8).toUpperCase()
  const playerId = Math.random().toString(36).slice(2, 11)

  const id = c.env.ROOMS.idFromName(roomCode)
  const stub = c.env.ROOMS.get(id)

  // Initialise empty room state immediately so the room "exists" before
  // Player 1's WebSocket fires — otherwise Player 2 would see "Room not found".
  await stub.fetch(new Request(`https://do/init?code=${roomCode}`, { method: 'POST' }))

  return c.json({ roomCode, playerId })
})

// Check room existence
app.get('/api/rooms/:code', async (c) => {
  const code = c.req.param('code').toUpperCase()
  const id = c.env.ROOMS.idFromName(code)
  const stub = c.env.ROOMS.get(id)

  const res = await stub.fetch(new Request('https://do/state'))
  if (!res.ok) return c.json({ exists: false }, 404)

  const state = await res.json<{ phase?: string; players?: unknown[] }>()
  if (!state || !state.phase) return c.json({ exists: false }, 404)

  return c.json({
    exists: true,
    playerCount: Array.isArray(state.players) ? state.players.length : 0,
    phase: state.phase,
  })
})

// WebSocket upgrade — proxy to Durable Object
app.get('/api/rooms/:code/ws', async (c) => {
  const upgrade = c.req.header('Upgrade')
  if (upgrade !== 'websocket') {
    return c.text('Expected WebSocket upgrade', 426)
  }

  const code = c.req.param('code').toUpperCase()
  const playerId = new URL(c.req.url).searchParams.get('playerId') || undefined

  const id = c.env.ROOMS.idFromName(code)
  const stub = c.env.ROOMS.get(id)

  const wsUrl = new URL(c.req.url)
  wsUrl.pathname = '/ws'
  if (playerId) wsUrl.searchParams.set('playerId', playerId)

  return stub.fetch(new Request(wsUrl.toString(), {
    headers: c.req.raw.headers,
  }))
})

app.get('/api/health', (c) => c.json({ status: 'ok' }))

app.onError((err, c) => {
  console.error(err)
  return c.json({ error: err.message }, 500)
})

export default app
