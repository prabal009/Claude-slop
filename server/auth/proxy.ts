import express, { type Request, type Response } from 'express';
import type { Pool } from 'pg';
import type { CloudConfig } from '../config.ts';
import { InviteRedemptionError, redeemShopkeeperInvite } from './invites.ts';
import {
  buildUpstreamCookieHeader,
  clearAuthCookies,
  getSession,
  invalidateSessionCache,
  isAppHttps,
  mapUpstreamSetCookies,
} from './session.ts';

function getAllowedOrigins(config: CloudConfig): Set<string> {
  const appOrigin = new URL(config.appUrl).origin;
  const allowed = new Set<string>([appOrigin]);

  if (!config.isProduction) {
    const parsed = new URL(config.appUrl);
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
      allowed.add('http://localhost:5173');
      allowed.add('http://127.0.0.1:5173');
    }
  }

  return allowed;
}

function verifyOrigin(req: Request, res: Response, allowedOrigins: Set<string>): boolean {
  const originHeader = req.get('origin');
  if (!originHeader || !allowedOrigins.has(originHeader)) {
    res.status(403).json({
      code: 'FORBIDDEN',
      message: 'Invalid request origin.',
    });
    return false;
  }
  return true;
}

function readBoundedString(
  body: unknown,
  key: string,
  minLength: number,
  maxLength: number,
): string | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return null;
  }
  const value = Reflect.get(body, key);
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length < minLength || trimmed.length > maxLength) {
    return null;
  }
  return trimmed;
}

function readPassword(body: unknown, minLength: number, maxLength: number): string | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return null;
  }
  const value = Reflect.get(body, 'password');
  if (typeof value !== 'string') {
    return null;
  }
  if (value.length < minLength || value.length > maxLength) {
    return null;
  }
  return value;
}

function applyMappedCookies(
  upstreamResponse: globalThis.Response,
  res: Response,
  isHttps: boolean,
): void {
  const setCookies = upstreamResponse.headers.getSetCookie();
  if (setCookies.length === 0) {
    return;
  }
  const mapped = mapUpstreamSetCookies(setCookies, isHttps);
  if (mapped.length > 0) {
    res.setHeader('Set-Cookie', mapped);
  }
}

function forwardRateLimitHeaders(upstreamResponse: globalThis.Response, res: Response): void {
  const retryAfter = upstreamResponse.headers.get('retry-after');
  if (retryAfter) {
    res.setHeader('Retry-After', retryAfter);
  }
  const xRetryAfter = upstreamResponse.headers.get('x-retry-after');
  if (xRetryAfter) {
    res.setHeader('x-retry-after', xRetryAfter);
  }
}

function extractSafeErrorMessage(payload: unknown, fallback: string): { code: string; message: string } {
  if (typeof payload === 'object' && payload !== null && !Array.isArray(payload)) {
    const codeVal = Reflect.get(payload, 'code');
    const msgVal = Reflect.get(payload, 'message');
    const code = typeof codeVal === 'string' && codeVal.trim().length > 0 ? codeVal.trim() : 'AUTH_ERROR';
    const message =
      typeof msgVal === 'string' && msgVal.trim().length > 0 && msgVal.length <= 200
        ? msgVal.trim()
        : fallback;
    return { code, message };
  }
  return { code: 'AUTH_ERROR', message: fallback };
}

async function forwardAuthRequest(
  req: Request,
  res: Response,
  config: CloudConfig,
  upstreamPath: string,
  method: 'GET' | 'POST',
  body?: Record<string, unknown>,
): Promise<void> {
  const isHttps = isAppHttps(config);
  const baseUrl = config.neonAuthBaseUrl.replace(/\/+$/, '');
  const upstreamUrl = `${baseUrl}${upstreamPath}`;
  const upstreamCookie = buildUpstreamCookieHeader(req.headers.cookie, isHttps);

  const headers: Record<string, string> = {
    origin: new URL(config.appUrl).origin,
    'cache-control': 'no-store',
  };
  if (upstreamCookie) {
    headers.cookie = upstreamCookie;
  }
  if (method === 'POST') {
    headers['content-type'] = 'application/json';
  }

  let upstreamResponse: globalThis.Response;
  try {
    upstreamResponse = await fetch(upstreamUrl, {
      method,
      headers,
      body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
      redirect: 'manual',
    });
  } catch {
    res.status(503).json({
      code: 'SERVICE_UNAVAILABLE',
      message: 'Authentication service is unavailable.',
    });
    return;
  }

  if (upstreamResponse.status >= 300 && upstreamResponse.status < 400) {
    res.status(503).json({
      code: 'SERVICE_UNAVAILABLE',
      message: 'Authentication service returned an unexpected redirect.',
    });
    return;
  }

  applyMappedCookies(upstreamResponse, res, isHttps);
  forwardRateLimitHeaders(upstreamResponse, res);

  let payload: unknown = null;
  const contentType = upstreamResponse.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      payload = await upstreamResponse.json();
    } catch {
      payload = null;
    }
  }

  if (!upstreamResponse.ok) {
    const safeError = extractSafeErrorMessage(payload, 'Authentication request failed.');
    res.status(upstreamResponse.status).json(safeError);
    return;
  }

  res.status(upstreamResponse.status).json(payload ?? { ok: true });
}

export function createAuthRouter(pool: Pool, config: CloudConfig): express.Router {
  const router = express.Router();
  const allowedOrigins = getAllowedOrigins(config);
  const isHttps = isAppHttps(config);

  router.post('/sign-up/email', async (req, res) => {
    if (!verifyOrigin(req, res, allowedOrigins)) {
      return;
    }

    const email = readBoundedString(req.body, 'email', 3, 254);
    const password = readPassword(req.body, 8, 128);
    const name = readBoundedString(req.body, 'name', 1, 100);

    if (!email || !password || !name) {
      res.status(400).json({
        code: 'INVALID_INPUT',
        message: 'Valid email, name, and password (8-128 characters) are required.',
      });
      return;
    }

    invalidateSessionCache(req.headers.cookie, isHttps);
    await forwardAuthRequest(req, res, config, '/sign-up/email', 'POST', {
      email,
      password,
      name,
    });
  });

  router.post('/sign-in/email', async (req, res) => {
    if (!verifyOrigin(req, res, allowedOrigins)) {
      return;
    }

    const email = readBoundedString(req.body, 'email', 3, 254);
    const password = readPassword(req.body, 1, 128);

    if (!email || !password) {
      res.status(400).json({
        code: 'INVALID_INPUT',
        message: 'Valid email and password are required.',
      });
      return;
    }

    invalidateSessionCache(req.headers.cookie, isHttps);
    await forwardAuthRequest(req, res, config, '/sign-in/email', 'POST', {
      email,
      password,
    });
  });

  router.post('/sign-out', async (req, res) => {
    if (!verifyOrigin(req, res, allowedOrigins)) {
      return;
    }

    invalidateSessionCache(req.headers.cookie, isHttps);
    const baseUrl = config.neonAuthBaseUrl.replace(/\/+$/, '');
    const upstreamCookie = buildUpstreamCookieHeader(req.headers.cookie, isHttps);
    const clearedCookies = clearAuthCookies(isHttps, req.headers.cookie);

    if (upstreamCookie) {
      try {
        const upstreamResponse = await fetch(`${baseUrl}/sign-out`, {
          method: 'POST',
          headers: {
            origin: new URL(config.appUrl).origin,
            cookie: upstreamCookie,
            'content-type': 'application/json',
            'cache-control': 'no-store',
          },
          body: JSON.stringify({}),
          redirect: 'manual',
        });

        const upstreamCleared = mapUpstreamSetCookies(
          upstreamResponse.headers.getSetCookie(),
          isHttps,
        );
        const allCleared = [...clearedCookies, ...upstreamCleared];
        if (allCleared.length > 0) {
          res.setHeader('Set-Cookie', allCleared);
        }
        res.status(200).json({ ok: true });
        return;
      } catch {
        // Fall through and clear local mapped cookies anyway.
      }
    }

    if (clearedCookies.length > 0) {
      res.setHeader('Set-Cookie', clearedCookies);
    }
    res.status(200).json({ ok: true });
  });

  router.get('/get-session', async (req, res) => {
    await forwardAuthRequest(req, res, config, '/get-session', 'GET');
  });

  router.post('/accept-invite', async (req, res, next) => {
    if (!verifyOrigin(req, res, allowedOrigins)) {
      return;
    }

    try {
      const session = await getSession(req, pool, config, { bypassCache: true });
      if (!session) {
        res.status(401).json({
          code: 'UNAUTHENTICATED',
          message: 'Sign in required.',
        });
        return;
      }

      const code = readBoundedString(req.body, 'code', 1, 256);
      if (!code) {
        res.status(400).json({
          code: 'INVALID_INVITE_CODE',
          message: 'Invite code is required.',
        });
        return;
      }

      await redeemShopkeeperInvite(pool, session.user.id, code);
      invalidateSessionCache(req.headers.cookie, isHttps);

      res.status(200).json({
        ok: true,
        role: 'shopkeeper',
      });
    } catch (error) {
      if (error instanceof InviteRedemptionError) {
        res.status(error.status).json({
          code: error.code,
          message: error.message,
        });
        return;
      }
      next(error);
    }
  });

  router.use((_req, res) => {
    res.status(404).json({
      code: 'NOT_FOUND',
      message: 'Unknown auth endpoint.',
    });
  });

  return router;
}
