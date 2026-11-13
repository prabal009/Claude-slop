import crypto from 'node:crypto';
import type { Pool } from 'pg';

export class InviteRedemptionError extends Error {
  readonly status: 400 | 403 | 409;
  readonly code: string;

  constructor(status: 400 | 403 | 409, code: string, message: string) {
    super(message);
    this.name = 'InviteRedemptionError';
    this.status = status;
    this.code = code;
  }
}

export function generateInviteCode(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashInviteCode(code: string): string {
  return crypto.createHash('sha256').update(code, 'utf8').digest('hex');
}

interface InviteRow {
  id: string;
  expires_at: Date | string;
  redeemed_by: string | null;
}

export async function redeemShopkeeperInvite(
  pool: Pool,
  authUserId: string,
  rawCode: string,
): Promise<'redeemed'> {
  const code = rawCode.trim();
  if (!code || code.length > 256) {
    throw new InviteRedemptionError(400, 'INVALID_INVITE_CODE', 'Invite code is required.');
  }

  const codeHash = hashInviteCode(code);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const inviteResult = await client.query<InviteRow>(
      `
      SELECT id, expires_at, redeemed_by
      FROM printq.shopkeeper_invites
      WHERE code_hash = $1
      FOR UPDATE
      `,
      [codeHash],
    );

    const invite = inviteResult.rows[0];
    if (!invite) {
      await client.query('ROLLBACK');
      throw new InviteRedemptionError(403, 'INVALID_INVITE', 'Invite code is invalid.');
    }

    if (invite.redeemed_by !== null) {
      await client.query('ROLLBACK');
      throw new InviteRedemptionError(409, 'INVITE_ALREADY_REDEEMED', 'Invite code has already been redeemed.');
    }

    const expiresAtMs =
      invite.expires_at instanceof Date
        ? invite.expires_at.getTime()
        : Date.parse(invite.expires_at);

    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
      await client.query('ROLLBACK');
      throw new InviteRedemptionError(403, 'INVITE_EXPIRED', 'Invite code has expired.');
    }

    await client.query(
      `
      UPDATE printq.shopkeeper_invites
      SET redeemed_by = $2, redeemed_at = now()
      WHERE id = $1
      `,
      [invite.id, authUserId],
    );

    await client.query(
      `
      INSERT INTO printq.users (auth_user_id, role)
      VALUES ($1, 'shopkeeper')
      ON CONFLICT (auth_user_id) DO UPDATE SET role = 'shopkeeper'
      `,
      [authUserId],
    );

    await client.query('COMMIT');
    return 'redeemed';
  } catch (error) {
    if (error instanceof InviteRedemptionError) {
      throw error;
    }
    try {
      await client.query('ROLLBACK');
    } catch {
      // Ignore rollback errors after failed transaction.
    }
    throw error;
  } finally {
    client.release();
  }
}
