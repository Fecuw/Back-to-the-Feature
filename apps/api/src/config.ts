import { z } from 'zod'

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(8080),
  DATABASE_URL: z.string().default('postgresql://btf:btf-local-password@127.0.0.1:5432/btf'),
  REDIS_URL: z.string().default('redis://:redis-local-password@127.0.0.1:6379/0'),
  JWT_SECRET: z.string().min(32).default('development-jwt-secret-must-be-changed'),
  GOOGLE_CLIENT_ID: z.string().default(''),
  ORCHESTRATOR_URL: z.string().url().default('http://127.0.0.1:8090'),
  ORCHESTRATOR_SHARED_SECRET: z.string().min(24).default('orchestrator-local-secret-change-me'),
  CORS_ORIGIN: z.string().default('http://127.0.0.1:5173,http://127.0.0.1:4173'),
  ALLOW_DEMO_AUTH: z.enum(['true', 'false']).default('true'),
  STAGE_ROOT: z.string().default('../../src/stages'),
})

const parsed = schema.parse(process.env)

export const config = {
  ...parsed,
  ALLOW_DEMO_AUTH: parsed.ALLOW_DEMO_AUTH === 'true',
  CORS_ORIGINS: parsed.CORS_ORIGIN.split(',').map((value) => value.trim()).filter(Boolean),
}
