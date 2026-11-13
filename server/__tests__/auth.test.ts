import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import type { CloudConfig } from '../config.ts';
import {
  generateInviteCode,
  hashInviteCode,
  InviteRedemptionError,
  redeemShopkeeperInvite,
} from '../auth/invites.ts';
import { createAuthRouter } from '../auth/proxy.ts';
import {
  buildUpstreamCookieHeader,
  clearAuthCookies,
  mapUpstreamSetCookies,
  parseManagedSession,
} from '../auth/session.ts';

function makeTestConfig(overrides: Partial<CloudConfig> = {}): CloudConfig {
  return {
    mode: 'cloud',
    isProduction: false,
    host: '127.0.0.1',
    port: 3001,
    appUrl: 'http://127.0.0.1:5173',
    databaseUrl: 'postgres://localhost:5432/printq_test',
    neonAuthBaseUrl: 'https://auth.example.test/neondb/auth',
    sessionSecret: 'test-secret-1234567890',
    s3: {
      endpoint: 'https://s3.example.test',
      region: 'us-east-1',
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
      bucket: 'test-bucket',
    },
    ...overrides,
  };
}

describe('parseManagedSession', () => {
  const futureIso = new Date(Date.now() + 60_000).toISOString();
  const pastIso = new Date(Date.now() - 60_000).toISOString();

  it('parses standard { session, user } payload', () => {
    const parsed = parseManagedSession({
      session: { id: 'sess_1', userId: 'user_1', expiresAt: futureIso },
      user: { id: 'user_1', name: 'Asha', email: 'asha@campus.edu', role: 'admin' },
    });

    expect(parsed).toEqual({
      session: { id: 'sess_1', userId: 'user_1', expiresAt: futureIso },
      user: { id: 'user_1', name: 'Asha', email: 'asha@campus.edu' },
    });
  });

  it('parses data-wrapped { data: { session, user } } payload', () => {
    const parsed = parseManagedSession({
      data: {
        session: { id: 'sess_2', userId: 'user_2', expiresAt: futureIso },
        user: { id: 'user_2', name: 'Vikram', email: 'vikram@campus.edu' },
      },
    });

    expect(parsed).toEqual({
      session: { id: 'sess_2', userId: 'user_2', expiresAt: futureIso },
      user: { id: 'user_2', name: 'Vikram', email: 'vikram@campus.edu' },
    });
  });

  it('returns null for null, mismatched userId, and expired session', () => {
    expect(parseManagedSession(null)).toBeNull();
    expect(
      parseManagedSession({
        session: { id: 'sess_1', userId: 'user_1', expiresAt: futureIso },
        user: { id: 'user_2', name: 'Mismatch', email: 'm@campus.edu' },
      }),
    ).toBeNull();
    expect(
      parseManagedSession({
        session: { id: 'sess_1', userId: 'user_1', expiresAt: pastIso },
        user: { id: 'user_1', name: 'Expired', email: 'e@campus.edu' },
      }),
    ).toBeNull();
  });
});

describe('cookie translation', () => {
  it('maps multiple upstream Set-Cookie headers for HTTPS __Host- and HTTP, preserves attributes, and clears', () => {
    const upstreamSetCookies = [
      '__Secure-neon_auth.session_token=tok_abc; Domain=auth.neon.tech; Path=/; Max-Age=604800; HttpOnly; Secure; SameSite=None',
      'neon_auth.csrf=csrf_xyz; Path=/; Expires=Wed, 21 Oct 2026 07:28:00 GMT; HttpOnly; SameSite=None',
    ];

    const httpsMapped = mapUpstreamSetCookies(upstreamSetCookies, true);
    expect(httpsMapped).toHaveLength(2);
    expect(httpsMapped[0]).toContain('__Host-printq_auth_');
    expect(httpsMapped[0]).toContain('Secure');
    expect(httpsMapped[0]).toContain('HttpOnly');
    expect(httpsMapped[0]).toContain('SameSite=Lax');
    expect(httpsMapped[0]).toContain('Path=/');
    expect(httpsMapped[0]).not.toContain('Domain=');
    expect(httpsMapped[0]).toContain('Max-Age=604800');

    const httpMapped = mapUpstreamSetCookies(upstreamSetCookies, false);
    expect(httpMapped).toHaveLength(2);
    expect(httpMapped[0]).toContain('printq_auth_');
    expect(httpMapped[0]).not.toContain('__Host-');
    expect(httpMapped[0]).not.toContain('Secure');

    const cookiePairs = httpsMapped.map((header) => header.split(';')[0]).join('; ');
    const rebuilt = buildUpstreamCookieHeader(
      `${cookiePairs}; __Host-printq_auth_not!valid=ignored; other_cookie=123`,
      true,
    );
    expect(rebuilt).toContain('__Secure-neon_auth.session_token=tok_abc');
    expect(rebuilt).toContain('neon_auth.csrf=csrf_xyz');
    expect(rebuilt).not.toContain('other_cookie');
    expect(rebuilt).not.toContain('ignored');

    const cleared = clearAuthCookies(true, cookiePairs);
    expect(cleared).toHaveLength(2);
    expect(cleared[0]).toContain('Max-Age=0');
  });
});

describe('auth proxy origin and role stripping', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects missing or mismatched Origin on POST with 403', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/auth', createAuthRouter({} as Pool, makeTestConfig()));

    const missingOrigin = await request(app)
      .post('/api/auth/sign-in/email')
      .send({ email: 'a@b.com', password: 'password123' });
    expect(missingOrigin.status).toBe(403);

    const badOrigin = await request(app)
      .post('/api/auth/sign-in/email')
      .set('Origin', 'https://evil.example')
      .send({ email: 'a@b.com', password: 'password123' });
    expect(badOrigin.status).toBe(403);
  });

  it('strips client-supplied role/metadata fields before forwarding sign-up', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ user: { id: 'u1' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const app = express();
    app.use(express.json());
    app.use('/api/auth', createAuthRouter({} as Pool, makeTestConfig()));

    const res = await request(app)
      .post('/api/auth/sign-up/email')
      .set('Origin', 'http://127.0.0.1:5173')
      .send({
        email: 'student@campus.edu',
        password: 'password123',
        name: 'Student',
        role: 'shopkeeper',
        isAdmin: true,
      });

    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0];
    const forwardedBody = JSON.parse(String(init?.body));
    expect(forwardedBody).toEqual({
      email: 'student@campus.edu',
      password: 'password123',
      name: 'Student',
    });
  });
});

describe('redeemShopkeeperInvite', () => {
  it('redeems a valid invite once and rejects replay or expired invites', async () => {
    const code = generateInviteCode();
    const codeHash = hashInviteCode(code);

    let inviteRow: { id: string; expires_at: string; redeemed_by: string | null } | null = {
      id: 'inv_1',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      redeemed_by: null,
    };
    let userRole = 'student';

    const mockClient = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes('SELECT id, expires_at, redeemed_by')) {
          if (params?.[0] === codeHash && inviteRow) {
            return { rows: [inviteRow] };
          }
          return { rows: [] };
        }
        if (sql.includes('UPDATE printq.shopkeeper_invites') && inviteRow) {
          inviteRow = { ...inviteRow, redeemed_by: String(params?.[1] ?? '') };
          return { rows: [] };
        }
        if (sql.includes('INSERT INTO printq.users')) {
          userRole = 'shopkeeper';
          return { rows: [] };
        }
        return { rows: [] };
      }),
      release: vi.fn(),
    };

    const mockPool = {
      connect: vi.fn(async () => mockClient),
    } as unknown as Pool;

    await expect(redeemShopkeeperInvite(mockPool, 'user_1', code)).resolves.toBe('redeemed');
    expect(userRole).toBe('shopkeeper');

    await expect(redeemShopkeeperInvite(mockPool, 'user_2', code)).rejects.toMatchObject({
      status: 409,
      code: 'INVITE_ALREADY_REDEEMED',
    } satisfies Partial<InviteRedemptionError>);

    inviteRow = {
      id: 'inv_2',
      expires_at: new Date(Date.now() - 60_000).toISOString(),
      redeemed_by: null,
    };
    await expect(redeemShopkeeperInvite(mockPool, 'user_2', code)).rejects.toMatchObject({
      status: 403,
      code: 'INVITE_EXPIRED',
    } satisfies Partial<InviteRedemptionError>);
  });
});
