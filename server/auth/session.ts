import crypto from 'node:crypto';
import cookie from 'cookie';
import type { NextFunction, Request, Response } from 'express';
import type { Pool } from 'pg';
import setCookieParser from 'set-cookie-parser';
import type { CloudConfig } from '../config.ts';

export type UserRole = 'student' | 'shopkeeper';

export interface AuthenticatedSession {
  id: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
  role: UserRole;
  expiresAt: string;
}

export interface ParsedManagedSession {
  session: {
    id: string;
    userId: string;
    expiresAt: string;
  };
  user: {
    id: string;
    name: string;
    email: string;
  };
}

const HTTPS_COOKIE_PREFIX = '__Host-printq_auth_';
const HTTP_COOKIE_PREFIX = 'printq_auth_';
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;
const SESSION_CACHE_TTL_MS = 4000;

interface CacheEntry {
  expiresAtMs: number;
  session: AuthenticatedSession | null;
}

const sessionCache = new Map<string, CacheEntry>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function isAppHttps(config: Pick<CloudConfig, 'appUrl'>): boolean {
  return new URL(config.appUrl).protocol === 'https:';
}

function getCookiePrefix(isHttps: boolean): string {
  return isHttps ? HTTPS_COOKIE_PREFIX : HTTP_COOKIE_PREFIX;
}

function encodeCookieName(originalName: string, isHttps: boolean): string {
  const encoded = Buffer.from(originalName, 'utf8').toString('base64url');
  return `${getCookiePrefix(isHttps)}${encoded}`;
}

function decodeCookieName(mappedName: string, isHttps: boolean): string | null {
  const prefix = getCookiePrefix(isHttps);
  if (!mappedName.startsWith(prefix)) {
    return null;
  }
  const encoded = mappedName.slice(prefix.length);
  if (!encoded || !BASE64URL_RE.test(encoded)) {
    return null;
  }
  try {
    const decoded = Buffer.from(encoded, 'base64url').toString('utf8');
    if (!decoded) {
      return null;
    }
    if (Buffer.from(decoded, 'utf8').toString('base64url') !== encoded) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

export function mapUpstreamSetCookies(setCookies: string[], isHttps: boolean): string[] {
  if (setCookies.length === 0) {
    return [];
  }

  const parsed = setCookieParser.parse(setCookies, { decodeValues: false });
  return parsed.map((entry) => {
    const mappedName = encodeCookieName(entry.name, isHttps);
    const options: cookie.SerializeOptions = {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: isHttps,
    };

    if (typeof entry.maxAge === 'number' && Number.isFinite(entry.maxAge)) {
      options.maxAge = entry.maxAge;
    }
    if (entry.expires instanceof Date && Number.isFinite(entry.expires.getTime())) {
      options.expires = entry.expires;
    }

    return cookie.serialize(mappedName, entry.value, options);
  });
}

export function buildUpstreamCookieHeader(
  rawCookieHeader: string | undefined,
  isHttps: boolean,
): string {
  if (!rawCookieHeader) {
    return '';
  }

  const parsed = cookie.parse(rawCookieHeader);
  const pairs: string[] = [];

  for (const [name, value] of Object.entries(parsed)) {
    if (typeof value !== 'string') {
      continue;
    }
    const originalName = decodeCookieName(name, isHttps);
    if (!originalName) {
      continue;
    }
    pairs.push(cookie.serialize(originalName, value));
  }

  return pairs.join('; ');
}

export function clearAuthCookies(isHttps: boolean, rawCookieHeader?: string): string[] {
  const namesToClear = new Set<string>();
  const prefix = getCookiePrefix(isHttps);

  if (rawCookieHeader) {
    const parsed = cookie.parse(rawCookieHeader);
    for (const name of Object.keys(parsed)) {
      if (name.startsWith(prefix) && decodeCookieName(name, isHttps) !== null) {
        namesToClear.add(name);
      }
    }
  }

  const cleared: string[] = [];
  for (const name of namesToClear) {
    cleared.push(
      cookie.serialize(name, '', {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: isHttps,
        maxAge: 0,
        expires: new Date(0),
      }),
    );
  }

  return cleared;
}

export function parseManagedSession(raw: unknown): ParsedManagedSession | null {
  if (!isRecord(raw)) {
    return null;
  }

  let container: Record<string, unknown> = raw;
  if ('data' in raw && raw.data !== undefined) {
    if (!isRecord(raw.data)) {
      return null;
    }
    container = raw.data;
  }

  const rawSession = container.session;
  const rawUser = container.user;
  if (!isRecord(rawSession) || !isRecord(rawUser)) {
    return null;
  }

  const sessionId = asNonEmptyString(rawSession.id);
  const sessionUserId = asNonEmptyString(rawSession.userId);
  const expiresAt = asNonEmptyString(rawSession.expiresAt);
  const userId = asNonEmptyString(rawUser.id);
  const userName = asNonEmptyString(rawUser.name);
  const userEmail = asNonEmptyString(rawUser.email);

  if (!sessionId || !sessionUserId || !expiresAt || !userId || !userName || !userEmail) {
    return null;
  }

  if (sessionUserId !== userId) {
    return null;
  }

  const expiresAtMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
    return null;
  }

  return {
    session: {
      id: sessionId,
      userId: sessionUserId,
      expiresAt,
    },
    user: {
      id: userId,
      name: userName,
      email: userEmail,
    },
  };
}

function hashCookieHeader(upstreamCookieHeader: string): string {
  return crypto.createHash('sha256').update(upstreamCookieHeader, 'utf8').digest('hex');
}

export function invalidateSessionCache(rawCookieHeader?: string, isHttps?: boolean): void {
  if (!rawCookieHeader || isHttps === undefined) {
    sessionCache.clear();
    return;
  }
  const upstreamCookie = buildUpstreamCookieHeader(rawCookieHeader, isHttps);
  if (!upstreamCookie) {
    sessionCache.clear();
    return;
  }
  sessionCache.delete(hashCookieHeader(upstreamCookie));
}

async function resolveAuthoritativeRole(pool: Pool, authUserId: string): Promise<UserRole> {
  await pool.query(
    `
    INSERT INTO printq.users (auth_user_id, role)
    VALUES ($1, 'student')
    ON CONFLICT (auth_user_id) DO NOTHING
    `,
    [authUserId],
  );

  const result = await pool.query<{ role: string }>(
    `
    SELECT role
    FROM printq.users
    WHERE auth_user_id = $1
    `,
    [authUserId],
  );

  return result.rows[0]?.role === 'shopkeeper' ? 'shopkeeper' : 'student';
}

export async function getSession(
  req: Request,
  pool: Pool,
  config: CloudConfig,
  options: { bypassCache?: boolean } = {},
): Promise<AuthenticatedSession | null> {
  const isHttps = isAppHttps(config);
  const upstreamCookie = buildUpstreamCookieHeader(req.headers.cookie, isHttps);
  if (!upstreamCookie) {
    return null;
  }

  const cacheKey = hashCookieHeader(upstreamCookie);
  const now = Date.now();
  if (!options.bypassCache) {
    const cached = sessionCache.get(cacheKey);
    if (cached && cached.expiresAtMs > now) {
      return cached.session;
    }
    sessionCache.delete(cacheKey);
  }

  const baseUrl = config.neonAuthBaseUrl.replace(/\/+$/, '');
  const targetUrl = options.bypassCache
    ? `${baseUrl}/get-session?fresh=1`
    : `${baseUrl}/get-session`;

  const response = await fetch(targetUrl, {
    method: 'GET',
    headers: {
      cookie: upstreamCookie,
      origin: new URL(config.appUrl).origin,
      'cache-control': 'no-store',
    },
    redirect: 'manual',
  });

  if (!response.ok) {
    if (!options.bypassCache && response.status === 401) {
      sessionCache.set(cacheKey, {
        expiresAtMs: now + SESSION_CACHE_TTL_MS,
        session: null,
      });
    }
    return null;
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return null;
  }

  const parsed = parseManagedSession(payload);
  if (!parsed) {
    if (!options.bypassCache) {
      sessionCache.set(cacheKey, {
        expiresAtMs: now + SESSION_CACHE_TTL_MS,
        session: null,
      });
    }
    return null;
  }

  const role = await resolveAuthoritativeRole(pool, parsed.user.id);
  const authenticated: AuthenticatedSession = {
    id: parsed.session.id,
    user: parsed.user,
    role,
    expiresAt: parsed.session.expiresAt,
  };

  if (!options.bypassCache) {
    sessionCache.set(cacheKey, {
      expiresAtMs: now + SESSION_CACHE_TTL_MS,
      session: authenticated,
    });
  }

  return authenticated;
}

export function requireSession(pool: Pool, config: CloudConfig) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const session = await getSession(req, pool, config);
      if (!session) {
        res.status(401).json({
          code: 'UNAUTHENTICATED',
          message: 'Sign in required.',
        });
        return;
      }

      res.locals.session = session;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireShopkeeper(pool: Pool, config: CloudConfig) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const session = await getSession(req, pool, config, { bypassCache: true });
      if (!session) {
        res.status(401).json({
          code: 'UNAUTHENTICATED',
          message: 'Sign in required.',
        });
        return;
      }

      if (session.role !== 'shopkeeper') {
        res.status(403).json({
          code: 'FORBIDDEN',
          message: 'Shopkeeper role is required.',
        });
        return;
      }

      res.locals.session = session;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function createSessionHandler(pool: Pool, config: CloudConfig) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const session = await getSession(req, pool, config);
      if (!session) {
        res.status(401).json({
          code: 'UNAUTHENTICATED',
          message: 'Not signed in.',
        });
        return;
      }

      res.status(200).json({
        user: session.user,
        role: session.role,
        expiresAt: session.expiresAt,
      });
    } catch (error) {
      next(error);
    }
  };
}
