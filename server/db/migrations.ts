import type { Pool, PoolClient } from 'pg';

const MIGRATION_LOCK_KEY = 70829104;

const DEFAULT_SETTINGS = {
  bwRate: 2,
  colorRate: 8,
  duplexDiscount: 0.25,
  urgentFee: 10,
  setupMinutes: 1.5,
  perSideMinutes: 0.4,
  openTime: '08:30',
  closeTime: '20:30',
  pickupBufferMinutes: 10,
};

const DEFAULT_PRINTER = {
  state: 'ready',
  downtimeMinutes: 0,
  downtimeUntil: null,
  note: '',
};

interface Migration {
  version: number;
  name: string;
  up: (client: PoolClient) => Promise<void>;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial_printq_schema',
    up: async (client: PoolClient) => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS printq.users (
          auth_user_id text PRIMARY KEY,
          role text NOT NULL CHECK (role IN ('student', 'shopkeeper')),
          created_at timestamptz NOT NULL DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS printq.shop_state (
          id text PRIMARY KEY,
          revision bigint NOT NULL,
          observed_at timestamptz NOT NULL,
          settings jsonb NOT NULL,
          printer jsonb NOT NULL,
          activity jsonb NOT NULL
        );

        CREATE TABLE IF NOT EXISTS printq.jobs (
          id text PRIMARY KEY,
          shop_id text NOT NULL,
          student_id text NOT NULL,
          client_request_id text NOT NULL,
          fingerprint text NOT NULL,
          page_count_source text NOT NULL,
          token text NOT NULL UNIQUE,
          document_id text NULL,
          data jsonb NOT NULL,
          UNIQUE (student_id, client_request_id)
        );

        CREATE INDEX IF NOT EXISTS idx_printq_jobs_shop_id ON printq.jobs (shop_id);
        CREATE INDEX IF NOT EXISTS idx_printq_jobs_student_id ON printq.jobs (student_id);

        CREATE TABLE IF NOT EXISTS printq.uploads (
          id text PRIMARY KEY,
          student_id text NOT NULL,
          client_request_id text NOT NULL,
          intent_hash text NOT NULL,
          object_key text NOT NULL UNIQUE,
          filename text NOT NULL,
          mime_type text NOT NULL,
          byte_size bigint NOT NULL,
          sha256 text NOT NULL,
          state text NOT NULL CHECK (state IN ('pending', 'committed')),
          created_at timestamptz NOT NULL DEFAULT now(),
          expires_at timestamptz NOT NULL,
          UNIQUE (student_id, client_request_id)
        );

        CREATE INDEX IF NOT EXISTS idx_printq_uploads_state_expires ON printq.uploads (state, expires_at);

        CREATE TABLE IF NOT EXISTS printq.shopkeeper_invites (
          id text PRIMARY KEY,
          code_hash text NOT NULL UNIQUE,
          expires_at timestamptz NOT NULL,
          redeemed_by text NULL,
          redeemed_at timestamptz NULL
        );

        CREATE TABLE IF NOT EXISTS printq.pickup_verifications (
          session_id text NOT NULL,
          job_id text NOT NULL,
          expires_at timestamptz NOT NULL,
          PRIMARY KEY (session_id, job_id)
        );

        CREATE INDEX IF NOT EXISTS idx_printq_pickup_verifications_expires ON printq.pickup_verifications (expires_at);
      `);

      await client.query(
        `
        INSERT INTO printq.shop_state (id, revision, observed_at, settings, printer, activity)
        VALUES ($1, 1, now(), $2::jsonb, $3::jsonb, $4::jsonb)
        ON CONFLICT (id) DO NOTHING
        `,
        [
          'campus',
          JSON.stringify(DEFAULT_SETTINGS),
          JSON.stringify(DEFAULT_PRINTER),
          JSON.stringify([]),
        ],
      );
    },
  },
];

export async function runMigrations(pool: Pool): Promise<void> {
  const client = await pool.connect();
  let lockAcquired = false;

  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    lockAcquired = true;

    await client.query('CREATE SCHEMA IF NOT EXISTS printq');
    await client.query(`
      CREATE TABLE IF NOT EXISTS printq.schema_migrations (
        version integer PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const appliedRes = await client.query<{ version: number }>(
      'SELECT version FROM printq.schema_migrations ORDER BY version ASC',
    );
    const applied = new Set(appliedRes.rows.map((row) => Number(row.version)));

    for (const migration of MIGRATIONS) {
      if (applied.has(migration.version)) {
        continue;
      }

      await client.query('BEGIN');
      try {
        await migration.up(client);
        await client.query(
          'INSERT INTO printq.schema_migrations (version) VALUES ($1)',
          [migration.version],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    if (lockAcquired) {
      try {
        await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
      } catch {
        // Ignore unlock errors on teardown
      }
    }
    client.release();
  }
}
