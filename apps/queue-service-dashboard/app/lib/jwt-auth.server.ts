import { sign, verify } from 'hono/jwt';
import env from '../../env';
import { authenticateUserByEmail } from './auth-registration.server';

const AUTH_COOKIE_NAME = 'bq_dashboard_auth';
const DEFAULT_AUTH_TTL_SECONDS = 60 * 60 * 8;
const REMEMBER_ME_TTL_SECONDS = 60 * 60 * 24 * 30;

function getCookieValue(
  cookieHeader: string | null,
  key: string,
): string | null {
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(';');
  for (const cookie of cookies) {
    const [name, ...valueParts] = cookie.trim().split('=');
    if (name === key) {
      return decodeURIComponent(valueParts.join('='));
    }
  }

  return null;
}

export function isPasswordAuthConfigured(): boolean {
  return Boolean(env.PGBOSS_DASHBOARD_JWT_SECRET);
}

export async function validateLoginCredentials(
  email: string,
  password: string,
): Promise<{ id: string; email: string } | null> {
  const authSchema = env.AUTH_SCHEMA || 'auth';
  return authenticateUserByEmail(env.DATABASE_URL, authSchema, email, password);
}

function getJwtSecret(): string {
  const secret = env.PGBOSS_DASHBOARD_JWT_SECRET;
  if (!secret) {
    throw new Error(
      'PGBOSS_DASHBOARD_JWT_SECRET is required for JWT auth. Add it to your environment.',
    );
  }

  return secret;
}

export async function createJwtToken(
  subject: string,
  rememberMe: boolean,
): Promise<string> {
  const nowInSeconds = Math.floor(Date.now() / 1000);
  const ttl = rememberMe ? REMEMBER_ME_TTL_SECONDS : DEFAULT_AUTH_TTL_SECONDS;

  return sign(
    {
      sub: subject,
      iat: nowInSeconds,
      exp: nowInSeconds + ttl,
    },
    getJwtSecret(),
  );
}

export function createAuthCookie(token: string, rememberMe: boolean): string {
  const maxAge = rememberMe
    ? REMEMBER_ME_TTL_SECONDS
    : DEFAULT_AUTH_TTL_SECONDS;
  return `${AUTH_COOKIE_NAME}=${encodeURIComponent(
    token,
  )}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearAuthCookie(): string {
  return `${AUTH_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export async function isAuthenticatedRequest(
  request: Request,
): Promise<boolean> {
  const cookieHeader = request.headers.get('cookie');
  const token = getCookieValue(cookieHeader, AUTH_COOKIE_NAME);

  if (!token) return false;

  try {
    await verify(token, getJwtSecret(), 'HS256');
    return true;
  } catch {
    return false;
  }
}
