import { createHash, randomBytes } from 'node:crypto'
import { OAuth2Client } from 'google-auth-library'
import { jwtVerify, SignJWT } from 'jose'
import { config } from './config.js'
import { pool, type UserRow } from './db.js'

const google = new OAuth2Client(config.GOOGLE_CLIENT_ID || undefined)
const jwtKey = new TextEncoder().encode(config.JWT_SECRET)
const issuer = 'back-to-the-feature-api'
const audience = 'back-to-the-feature-browser'

export interface AccessUser {
  id: string
  email: string | null
  displayName: string
}

function publicUser(row: UserRow): AccessUser {
  return { id: row.id, email: row.email, displayName: row.display_name }
}

async function signAccessToken(user: AccessUser) {
  return new SignJWT({ email: user.email, name: user.displayName })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(jwtKey)
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

async function issueTokenPair(row: UserRow) {
  const user = publicUser(row)
  const refreshToken = randomBytes(32).toString('base64url')
  await pool.query(
    `INSERT INTO refresh_tokens(token_hash, user_id, expires_at)
     VALUES ($1, $2, now() + interval '30 days')`,
    [hashToken(refreshToken), user.id],
  )
  return { accessToken: await signAccessToken(user), refreshToken, expiresIn: 900, user }
}

async function upsertUser(sub: string, email: string | null, displayName: string) {
  const result = await pool.query<UserRow>(
    `INSERT INTO users(google_sub, email, display_name)
     VALUES ($1, $2, $3)
     ON CONFLICT (google_sub) DO UPDATE
       SET email = EXCLUDED.email, display_name = EXCLUDED.display_name, updated_at = now()
     RETURNING id, google_sub, email, display_name`,
    [sub, email, displayName],
  )
  return result.rows[0]
}

export async function authenticateGoogleCredential(credential: string) {
  if (!config.GOOGLE_CLIENT_ID) throw new Error('GOOGLE_CLIENT_ID is not configured')
  const ticket = await google.verifyIdToken({ idToken: credential, audience: config.GOOGLE_CLIENT_ID })
  const payload = ticket.getPayload()
  if (!payload?.sub || !payload.email_verified) throw new Error('Google identity is not verified')
  const row = await upsertUser(payload.sub, payload.email ?? null, payload.name ?? payload.email ?? 'Operator')
  return issueTokenPair(row)
}

export async function authenticateDemo() {
  if (!config.ALLOW_DEMO_AUTH) throw new Error('Demo authentication is disabled')
  const row = await upsertUser('demo-local', 'demo@local.invalid', 'Demo Operator')
  return issueTokenPair(row)
}

export async function rotateRefreshToken(refreshToken: string) {
  const tokenHash = hashToken(refreshToken)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await client.query<UserRow>(
      `UPDATE refresh_tokens rt
       SET revoked_at = now()
       FROM users u
       WHERE rt.token_hash = $1 AND rt.user_id = u.id
         AND rt.revoked_at IS NULL AND rt.expires_at > now()
       RETURNING u.id, u.google_sub, u.email, u.display_name`,
      [tokenHash],
    )
    if (!result.rows[0]) throw new Error('Refresh token is invalid or expired')
    await client.query('COMMIT')
    return issueTokenPair(result.rows[0])
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function verifyAccessToken(token: string): Promise<AccessUser> {
  const { payload } = await jwtVerify(token, jwtKey, { issuer, audience })
  if (!payload.sub) throw new Error('JWT subject is missing')
  return {
    id: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : null,
    displayName: typeof payload.name === 'string' ? payload.name : 'Operator',
  }
}
