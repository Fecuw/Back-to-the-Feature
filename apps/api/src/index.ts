import { randomUUID } from 'node:crypto'
import cors from '@fastify/cors'
import websocket from '@fastify/websocket'
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify'
import { Redis } from 'ioredis'
import WebSocket from 'ws'
import { z } from 'zod'
import {
  authenticateDemo,
  authenticateGoogleCredential,
  rotateRefreshToken,
  verifyAccessToken,
  type AccessUser,
} from './auth.js'
import { config } from './config.js'
import { initializeDatabase, pool } from './db.js'
import { loadStage, loadStages } from './stages.js'

const app = Fastify({ logger: true, bodyLimit: 64 * 1024 })
const redis = new Redis(config.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 2 })

await app.register(cors, {
  origin: (origin, callback) => callback(null, !origin || config.CORS_ORIGINS.includes(origin)),
  methods: ['GET', 'HEAD', 'POST', 'DELETE', 'OPTIONS'],
  credentials: true,
})
await app.register(websocket, { options: { maxPayload: 16 * 1024 } })

async function requireUser(request: FastifyRequest, reply: FastifyReply): Promise<AccessUser | null> {
  const authorization = request.headers.authorization
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : ''
  try {
    return await verifyAccessToken(token)
  } catch {
    await reply.code(401).send({ error: 'UNAUTHORIZED' })
    return null
  }
}

async function callOrchestrator(path: string, init: RequestInit = {}) {
  const response = await fetch(`${config.ORCHESTRATOR_URL}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      'x-orchestrator-secret': config.ORCHESTRATOR_SHARED_SECRET,
      ...init.headers,
    },
  })
  if (!response.ok) throw new Error(`Orchestrator ${response.status}: ${await response.text()}`)
  return response.status === 204 ? null : response.json()
}

app.get('/health', async () => {
  await Promise.all([pool.query('SELECT 1'), redis.ping()])
  return { status: 'ok', services: { postgres: 'ok', redis: 'ok', api: 'ok' } }
})

app.post('/api/v1/auth/google', async (request, reply) => {
  const parsed = z.object({ credential: z.string().min(20) }).safeParse(request.body)
  if (!parsed.success) return reply.code(400).send({ error: 'INVALID_CREDENTIAL' })
  try {
    return await authenticateGoogleCredential(parsed.data.credential)
  } catch (error) {
    request.log.warn(error)
    return reply.code(401).send({ error: 'GOOGLE_AUTH_FAILED' })
  }
})

app.post('/api/v1/auth/demo', async (request, reply) => {
  try {
    return await authenticateDemo()
  } catch {
    return reply.code(403).send({ error: 'DEMO_AUTH_DISABLED' })
  }
})

app.post('/api/v1/auth/refresh', async (request, reply) => {
  const parsed = z.object({ refreshToken: z.string().min(20) }).safeParse(request.body)
  if (!parsed.success) return reply.code(400).send({ error: 'INVALID_REFRESH_TOKEN' })
  try {
    return await rotateRefreshToken(parsed.data.refreshToken)
  } catch {
    return reply.code(401).send({ error: 'REFRESH_REJECTED' })
  }
})

app.get('/api/v1/stages', async () => loadStages())

app.post('/api/v1/sessions', async (request, reply) => {
  const user = await requireUser(request, reply)
  if (!user) return
  const parsed = z.object({ stageId: z.string().regex(/^[a-z0-9-]+$/) }).safeParse(request.body)
  if (!parsed.success) return reply.code(400).send({ error: 'INVALID_STAGE' })
  const stage = await loadStage(parsed.data.stageId)
  if (!stage) return reply.code(404).send({ error: 'STAGE_NOT_FOUND' })

  const activeKey = `user:${user.id}:active-sessions`
  if ((await redis.scard(activeKey)) >= 2) return reply.code(429).send({ error: 'SESSION_LIMIT_REACHED' })

  const sessionId = randomUUID()
  const expiresAt = new Date(Date.now() + 30 * 60_000)
  const servers = stage.infra.servers.filter((server) => server.shell).map((server) => ({ id: server.id, label: server.label }))
  const orchestratorServers = servers.map((server) => ({
    ...server,
    settings: stage.defenses.filter((defense) => defense.serverId === server.id).map((defense) => ({
      id: defense.id,
      label: defense.label,
      description: defense.description,
      onLabel: defense.onLabel,
      offLabel: defense.offLabel,
      default: defense.default,
      configPath: defense.configPath,
    })),
  }))
  try {
    await callOrchestrator('/internal/sessions', {
      method: 'POST',
      body: JSON.stringify({ sessionId, stageId: stage.id, servers: orchestratorServers, expiresAt: expiresAt.toISOString() }),
    })
    await pool.query(
      `INSERT INTO sessions(id, user_id, stage_id, state, expires_at) VALUES ($1, $2, $3, 'OBSERVING', $4)`,
      [sessionId, user.id, stage.id, expiresAt],
    )
    await redis.multi().sadd(activeKey, sessionId).expire(activeKey, 1800).setex(`session:${sessionId}:owner`, 1800, user.id).exec()
    await pool.query(`INSERT INTO audit_logs(user_id, session_id, kind, payload) VALUES ($1, $2, 'session', $3)`, [user.id, sessionId, { action: 'created', stageId: stage.id }])
    return reply.code(201).send({ id: sessionId, stageId: stage.id, state: 'OBSERVING', expiresAt, servers })
  } catch (error) {
    request.log.error(error)
    await callOrchestrator(`/internal/sessions/${sessionId}`, { method: 'DELETE' }).catch(() => undefined)
    return reply.code(503).send({ error: 'SESSION_START_FAILED' })
  }
})

app.get('/api/v1/sessions/:id', async (request, reply) => {
  const user = await requireUser(request, reply)
  if (!user) return
  const { id } = request.params as { id: string }
  const result = await pool.query(`SELECT id, stage_id, state, current_checkpoint, created_at, expires_at FROM sessions WHERE id = $1 AND user_id = $2 AND ended_at IS NULL`, [id, user.id])
  if (!result.rows[0]) return reply.code(404).send({ error: 'SESSION_NOT_FOUND' })
  return result.rows[0]
})

app.delete('/api/v1/sessions/:id', async (request, reply) => {
  const user = await requireUser(request, reply)
  if (!user) return
  const { id } = request.params as { id: string }
  const result = await pool.query(`UPDATE sessions SET state = 'ENDED', ended_at = now() WHERE id = $1 AND user_id = $2 AND ended_at IS NULL RETURNING id`, [id, user.id])
  if (!result.rows[0]) return reply.code(404).send({ error: 'SESSION_NOT_FOUND' })
  await callOrchestrator(`/internal/sessions/${id}`, { method: 'DELETE' })
  await redis.srem(`user:${user.id}:active-sessions`, id)
  await redis.del(`session:${id}:owner`)
  return reply.code(204).send()
})

app.get('/api/v1/me/progress', async (request, reply) => {
  const user = await requireUser(request, reply)
  if (!user) return
  const result = await pool.query(`SELECT stage_id, cleared_at, best_time_seconds, hints_used, attempts FROM progress WHERE user_id = $1 ORDER BY stage_id`, [user.id])
  return result.rows
})

app.get('/ws/sessions/:id/terminal', { websocket: true }, async (socket, request) => {
  const { id } = request.params as { id: string }
  const query = request.query as { server?: string }
  const protocols = String(request.headers['sec-websocket-protocol'] ?? '').split(',').map((value) => value.trim())
  const token = protocols[0] === 'btf-terminal' ? protocols[1] : ''
  if (!token || !query.server || !/^[a-z0-9-]+$/.test(query.server)) return socket.close(4400, 'invalid request')

  let user: AccessUser
  try {
    user = await verifyAccessToken(token)
  } catch {
    return socket.close(4401, 'unauthorized')
  }
  const owned = await pool.query(`SELECT id FROM sessions WHERE id = $1 AND user_id = $2 AND ended_at IS NULL AND expires_at > now()`, [id, user.id])
  if (!owned.rows[0]) return socket.close(4403, 'session ownership rejected')

  const upstreamUrl = new URL(`/internal/sessions/${id}/terminal?server=${encodeURIComponent(query.server)}`, config.ORCHESTRATOR_URL)
  upstreamUrl.protocol = upstreamUrl.protocol === 'https:' ? 'wss:' : 'ws:'
  const upstream = new WebSocket(upstreamUrl, { headers: { 'x-orchestrator-secret': config.ORCHESTRATOR_SHARED_SECRET } })
  const pendingInput: { data: Buffer; isBinary: boolean }[] = []
  let clientClosed = false
  let commandBuffer = ''

  upstream.on('open', () => {
    if (clientClosed) return upstream.close(1000, 'client closed')
    socket.send('\r\n\x1b[32mLIVE DOCKER SESSION CONNECTED\x1b[0m\r\n\r\n')
    for (const input of pendingInput.splice(0)) upstream.send(input.data, { binary: input.isBinary })
  })
  upstream.on('message', (data, isBinary) => socket.readyState === WebSocket.OPEN && socket.send(data, { binary: isBinary }))
  upstream.on('close', (code, reason) => {
    const invalidCodes = new Set([1004, 1005, 1006, 1015])
    const safeCode = code >= 1000 && code <= 4999 && !invalidCodes.has(code) ? code : 1011
    socket.close(safeCode, reason.toString().slice(0, 120))
  })
  upstream.on('error', (error) => {
    request.log.error(error)
    if (socket.readyState === WebSocket.OPEN) socket.close(1011, 'terminal upstream failed')
  })
  socket.on('message', (data, isBinary) => {
    const payload = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer)
    if (upstream.readyState === WebSocket.OPEN) upstream.send(payload, { binary: isBinary })
    else if (upstream.readyState === WebSocket.CONNECTING && pendingInput.length < 128) pendingInput.push({ data: payload, isBinary })
    const text = isBinary ? '' : payload.toString()
    if (!text.startsWith('{"type":"resize"')) {
      commandBuffer = (commandBuffer + text).slice(-2048)
      if (text.includes('\r')) {
        const command = commandBuffer.replace(/[\r\n]/g, '').slice(0, 512)
        commandBuffer = ''
        void pool.query(`INSERT INTO audit_logs(user_id, session_id, kind, payload) VALUES ($1, $2, 'shell', $3)`, [user.id, id, { server: query.server, command }])
      }
    }
  })
  socket.on('close', () => {
    clientClosed = true
    if (upstream.readyState === WebSocket.OPEN) upstream.close()
  })
})

await initializeDatabase()
await redis.connect()
await app.listen({ host: '0.0.0.0', port: config.PORT })

const shutdown = async () => {
  await app.close()
  await redis.quit()
  await pool.end()
  process.exit(0)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
