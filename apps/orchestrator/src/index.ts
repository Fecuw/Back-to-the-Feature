import { timingSafeEqual } from 'node:crypto'
import websocket from '@fastify/websocket'
import Docker from 'dockerode'
import Fastify from 'fastify'
import { z } from 'zod'

const config = z.object({
  PORT: z.coerce.number().int().positive().default(8090),
  ORCHESTRATOR_SHARED_SECRET: z.string().min(24).default('orchestrator-local-secret-change-me'),
  SESSION_IMAGE: z.string().default('back-to-the-feature/training-target:local'),
  SESSION_TTL_SECONDS: z.coerce.number().int().min(60).max(7200).default(1800),
}).parse(process.env)

const docker = new Docker({ socketPath: '/var/run/docker.sock' })
const app = Fastify({ logger: true, bodyLimit: 32 * 1024 })
const sessionContainers = new Map<string, string>()
await app.register(websocket, { options: { maxPayload: 16 * 1024 } })

function secretsMatch(candidate: string) {
  const expected = Buffer.from(config.ORCHESTRATOR_SHARED_SECRET)
  const actual = Buffer.from(candidate)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

app.addHook('onRequest', async (request, reply) => {
  if (request.url === '/health') return
  if (!secretsMatch(String(request.headers['x-orchestrator-secret'] ?? ''))) {
    return reply.code(401).send({ error: 'INTERNAL_AUTH_REQUIRED' })
  }
})

const createSchema = z.object({
  sessionId: z.string().uuid(),
  stageId: z.string().regex(/^[a-z0-9-]+$/),
  servers: z.array(z.object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    label: z.string().min(1).max(64),
    settings: z.array(z.object({
      id: z.string().regex(/^[a-z0-9_]+$/),
      label: z.string().min(1).max(100),
      description: z.string().min(1).max(300),
      onLabel: z.string().min(1).max(100),
      offLabel: z.string().min(1).max(100),
      default: z.boolean(),
      configPath: z.string().min(1).max(300),
    })).max(12),
  })).min(1).max(12),
  expiresAt: z.string().datetime(),
})

function sessionLabels(sessionId: string, stageId: string, serverId?: string, expiresAt?: string) {
  return {
    'btf.managed': 'true',
    'btf.session': sessionId,
    'btf.stage': stageId,
    ...(serverId ? { 'btf.server': serverId } : {}),
    ...(expiresAt ? { 'btf.expires_at': expiresAt } : {}),
  }
}

async function containersForSession(sessionId: string) {
  return docker.listContainers({ all: true, filters: { label: [`btf.session=${sessionId}`] } })
}

async function removeSession(sessionId: string) {
  const containers = await containersForSession(sessionId)
  await Promise.all(containers.map(async (info) => {
    const serverId = info.Labels['btf.server']
    if (serverId) sessionContainers.delete(`${sessionId}:${serverId}`)
    const container = docker.getContainer(info.Id)
    try {
      if (info.State === 'running') await container.stop({ t: 2 })
    } catch (error) {
      app.log.warn({ error, container: info.Id }, 'container stop failed')
    }
    await container.remove({ force: true, v: true }).catch((error) => app.log.warn({ error, container: info.Id }, 'container remove failed'))
  }))
  await docker.getNetwork(`btf-session-${sessionId}`).remove().catch(() => undefined)
}

app.get('/health', async () => {
  const info = await docker.info()
  return { status: 'ok', dockerVersion: info.ServerVersion }
})

app.post('/internal/sessions', async (request, reply) => {
  const parsed = createSchema.safeParse(request.body)
  if (!parsed.success) return reply.code(400).send({ error: 'INVALID_SESSION_SPEC', issues: parsed.error.issues })
  const { sessionId, stageId, servers, expiresAt } = parsed.data
  const networkName = `btf-session-${sessionId}`

  const existing = await containersForSession(sessionId)
  if (existing.length) return reply.code(409).send({ error: 'SESSION_ALREADY_EXISTS' })

  try {
    await docker.getImage(config.SESSION_IMAGE).inspect()
  } catch {
    return reply.code(503).send({ error: 'SESSION_IMAGE_MISSING', image: config.SESSION_IMAGE })
  }

  await docker.createNetwork({
    Name: networkName,
    Driver: 'bridge',
    Internal: true,
    Attachable: false,
    CheckDuplicate: true,
    Labels: sessionLabels(sessionId, stageId, undefined, expiresAt),
  })

  const created: string[] = []
  try {
    for (const server of servers) {
      const container = await docker.createContainer({
        name: `btf-${sessionId.slice(0, 8)}-${server.id}`,
        Image: config.SESSION_IMAGE,
        User: '10001:10001',
        WorkingDir: '/workspace',
        Env: [
          `BTF_SESSION_ID=${sessionId}`,
          `BTF_STAGE_ID=${stageId}`,
          `BTF_SERVER_ID=${server.id}`,
          `BTF_SERVER_LABEL=${server.label}`,
          `BTF_SETTINGS_B64=${Buffer.from(JSON.stringify(server.settings)).toString('base64')}`,
        ],
        Labels: sessionLabels(sessionId, stageId, server.id, expiresAt),
        HostConfig: {
          NetworkMode: networkName,
          ReadonlyRootfs: true,
          CapDrop: ['ALL'],
          SecurityOpt: ['no-new-privileges:true'],
          Memory: 256 * 1024 * 1024,
          MemorySwap: 256 * 1024 * 1024,
          NanoCpus: 500_000_000,
          PidsLimit: 128,
          AutoRemove: false,
          Tmpfs: {
            '/workspace': 'rw,nosuid,nodev,size=64m,uid=10001,gid=10001',
            '/tmp': 'rw,nosuid,nodev,noexec,size=32m,uid=10001,gid=10001',
            '/run': 'rw,nosuid,nodev,noexec,size=8m,uid=10001,gid=10001',
          },
        },
      })
      created.push(container.id)
      await container.start()
      await new Promise((resolve) => setTimeout(resolve, 500))
      sessionContainers.set(`${sessionId}:${server.id}`, container.id)
      const state = await container.inspect()
      if (!state.State.Running) {
        const output = await container.logs({ stdout: true, stderr: true, tail: 20 })
        throw new Error(`${server.id} exited during startup: ${output.toString().slice(-1000)}`)
      }
    }
    return reply.code(201).send({ sessionId, network: networkName, containers: created, expiresAt })
  } catch (error) {
    app.log.error({ err: error, sessionId }, 'session creation failed')
    await removeSession(sessionId)
    return reply.code(500).send({ error: 'SESSION_CREATE_FAILED' })
  }
})

app.get('/internal/sessions/:id', async (request, reply) => {
  const { id } = request.params as { id: string }
  if (!z.string().uuid().safeParse(id).success) return reply.code(400).send({ error: 'INVALID_SESSION_ID' })
  const containers = await containersForSession(id)
  return { id, containers: containers.map((container) => ({
    id: container.Id,
    server: container.Labels['btf.server'],
    state: container.State,
    status: container.Status,
  })) }
})

app.delete('/internal/sessions/:id', async (request, reply) => {
  const { id } = request.params as { id: string }
  if (!z.string().uuid().safeParse(id).success) return reply.code(400).send({ error: 'INVALID_SESSION_ID' })
  await removeSession(id)
  return reply.code(204).send()
})

app.get('/internal/sessions/:id/terminal', { websocket: true }, async (socket, request) => {
  const { id } = request.params as { id: string }
  const { server } = request.query as { server?: string }
  if (!z.string().uuid().safeParse(id).success || !server || !/^[a-z0-9-]+$/.test(server)) return socket.close(4400, 'invalid terminal target')

  const pending: { data: Buffer; isBinary: boolean }[] = []
  let processInput: ((data: Buffer, isBinary: boolean) => Promise<void>) | undefined
  let terminalStream: NodeJS.ReadWriteStream | undefined
  socket.on('message', (data, isBinary) => {
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer)
    if (processInput) void processInput(buffer, isBinary)
    else pending.push({ data: buffer, isBinary })
  })
  socket.on('close', () => terminalStream?.end())

  const containerId = sessionContainers.get(`${id}:${server}`)
  if (!containerId) return socket.close(4404, 'container not found')

  app.log.info({ sessionId: id, server, containerId: containerId.slice(0, 12) }, 'terminal exec creating')
  const container = docker.getContainer(containerId)
  const exec = await container.exec({
    Cmd: ['/bin/bash', '--login'],
    User: '10001:10001',
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    Tty: true,
    WorkingDir: '/workspace',
    Env: ['TERM=xterm-256color'],
  })
  app.log.info({ sessionId: id, server }, 'terminal exec starting')
  const stream = await exec.start({ hijack: true, stdin: true })
  terminalStream = stream
  app.log.info({ sessionId: id, server }, 'terminal pty ready')

  let outputBuffer = Buffer.alloc(0)
  stream.on('data', (chunk: Buffer) => {
    outputBuffer = Buffer.concat([outputBuffer, chunk])
    while (outputBuffer.length) {
      const framed = outputBuffer.length >= 8
        && (outputBuffer[0] === 1 || outputBuffer[0] === 2)
        && outputBuffer[1] === 0 && outputBuffer[2] === 0 && outputBuffer[3] === 0
      if (!framed) {
        if (socket.readyState === socket.OPEN) socket.send(outputBuffer)
        outputBuffer = Buffer.alloc(0)
        break
      }
      const length = outputBuffer.readUInt32BE(4)
      if (outputBuffer.length < 8 + length) break
      if (socket.readyState === socket.OPEN) socket.send(outputBuffer.subarray(8, 8 + length))
      outputBuffer = outputBuffer.subarray(8 + length)
    }
  })
  stream.on('end', () => socket.close(1000, 'shell ended'))
  stream.on('error', (error: Error) => {
    app.log.warn({ error, sessionId: id, server }, 'terminal stream failed')
    socket.close(1011, 'shell stream failed')
  })
  processInput = async (data, isBinary) => {
    const text = isBinary ? '' : data.toString()
    if (text.startsWith('{"type":"resize"')) {
      try {
        const parsed = z.object({ type: z.literal('resize'), cols: z.number().int().min(20).max(300), rows: z.number().int().min(5).max(120) }).safeParse(JSON.parse(text))
        if (parsed.success) await exec.resize({ w: parsed.data.cols, h: parsed.data.rows })
      } catch {
        socket.close(4400, 'invalid resize message')
      }
      return
    }
    stream.write(data)
  }
  pending.splice(0).forEach(({ data, isBinary }) => void processInput?.(data, isBinary))
  if (socket.readyState === socket.OPEN) socket.send('\r\n\x1b[32mORCHESTRATOR PTY READY\x1b[0m\r\n')
})

async function cleanupExpiredSessions() {
  const containers = await docker.listContainers({ all: true, filters: { label: ['btf.managed=true'] } })
  const expiredSessionIds = new Set<string>()
  const now = Date.now()
  for (const container of containers) {
    const expiresAt = Date.parse(container.Labels['btf.expires_at'] ?? '')
    if (Number.isFinite(expiresAt) && expiresAt <= now) expiredSessionIds.add(container.Labels['btf.session'])
  }
  await Promise.all([...expiredSessionIds].filter(Boolean).map(removeSession))
}

await app.listen({ host: '0.0.0.0', port: config.PORT })
const cleanupTimer = setInterval(() => {
  void cleanupExpiredSessions().catch((error) => app.log.error({ error }, 'expired session cleanup failed'))
}, 60_000)
cleanupTimer.unref()

const shutdown = async () => {
  clearInterval(cleanupTimer)
  await app.close()
  process.exit(0)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
