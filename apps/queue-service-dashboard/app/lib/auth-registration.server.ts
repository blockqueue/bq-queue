import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { getPool, queryOne } from './db.server'

function scryptAsync (
  password: string,
  salt: string,
  keyLength: number,
  cost: number,
  blockSize: number,
  parallelization: number
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      keyLength,
      { N: cost, r: blockSize, p: parallelization },
      (error, derivedKey) => {
        if (error) {
          reject(error)
          return
        }
        resolve(derivedKey)
      }
    )
  })
}

const RegisterUserSchema = z.object({
  email: z.email().transform((value) => value.toLowerCase().trim()),
  password: z.string().min(12).max(128),
  isActive: z.boolean().optional(),
})

const RegisterRequestSchema = z.object({
  users: z.array(RegisterUserSchema).min(1),
  mode: z.enum(['partial', 'atomic']).optional().default('partial'),
})

export type RegisterPayload = z.infer<typeof RegisterRequestSchema>

export function parseRegisterPayload (input: unknown): RegisterPayload {
  return RegisterRequestSchema.parse(input)
}

export async function hashPassword (password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const keyLength = 64
  const cost = 16384
  const blockSize = 8
  const parallelization = 1
  const derivedKey = await scryptAsync(
    password,
    salt,
    keyLength,
    cost,
    blockSize,
    parallelization
  )

  return `scrypt$${cost}$${blockSize}$${parallelization}$${salt}$${derivedKey.toString('hex')}`
}

export async function verifyPassword (
  password: string,
  storedHash: string
): Promise<boolean> {
  const [algo, cost, blockSize, parallelization, salt, hash] = storedHash.split('$')
  if (
    algo !== 'scrypt' ||
    !cost ||
    !blockSize ||
    !parallelization ||
    !salt ||
    !hash
  ) {
    return false
  }

  const expectedHash = Buffer.from(hash, 'hex')
  const derivedKey = await scryptAsync(
    password,
    salt,
    expectedHash.length,
    Number(cost),
    Number(blockSize),
    Number(parallelization)
  )

  return timingSafeEqual(derivedKey, expectedHash)
}

export async function ensureAuthTables (
  connectionString: string,
  authSchema: string
): Promise<void> {
  const pool = getPool(connectionString)
  const client = await pool.connect()

  try {
    await client.query('BEGIN')
    await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto')
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${authSchema}"`)
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${authSchema}".users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx
      ON "${authSchema}".users (LOWER(email))
    `)
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

type BulkRegisterResult = {
  createdCount: number
  failedCount: number
  errors: Array<{ index: number; email: string; message: string }>
}

export async function bulkRegisterUsers (
  connectionString: string,
  authSchema: string,
  payload: RegisterPayload
): Promise<BulkRegisterResult> {
  const pool = getPool(connectionString)
  const client = await pool.connect()
  const errors: BulkRegisterResult['errors'] = []
  let createdCount = 0

  try {
    if (payload.mode === 'atomic') {
      await client.query('BEGIN')
    }

    for (const [index, user] of payload.users.entries()) {
      try {
        const passwordHash = await hashPassword(user.password)
        await client.query(
          `
            INSERT INTO "${authSchema}".users (email, password_hash, is_active)
            VALUES ($1, $2, $3)
          `,
          [user.email, passwordHash, user.isActive ?? true]
        )
        createdCount += 1
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to register user'
        errors.push({ index, email: user.email, message })
        if (payload.mode === 'atomic') {
          throw error
        }
      }
    }

    if (payload.mode === 'atomic') {
      await client.query('COMMIT')
    }
  } catch (error) {
    if (payload.mode === 'atomic') {
      await client.query('ROLLBACK')
      throw error
    }
  } finally {
    client.release()
  }

  return {
    createdCount,
    failedCount: errors.length,
    errors,
  }
}

type AuthUserRow = {
  id: string
  email: string
  password_hash: string
  is_active: boolean
}

export async function authenticateUserByEmail (
  connectionString: string,
  authSchema: string,
  email: string,
  password: string
): Promise<{ id: string; email: string } | null> {
  const normalizedEmail = email.toLowerCase().trim()
  const user = await queryOne<AuthUserRow>(
    connectionString,
    `
      SELECT id, email, password_hash, is_active
      FROM "${authSchema}".users
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1
    `,
    [normalizedEmail]
  )

  if (!user || !user.is_active) return null

  const isValidPassword = await verifyPassword(password, user.password_hash)
  if (!isValidPassword) return null

  return {
    id: user.id,
    email: user.email,
  }
}
