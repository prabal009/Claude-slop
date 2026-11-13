import type { Pool, PoolClient } from 'pg';

const MIGRATION_LOCK_KEY = 70829104;

const DEFAULT_SETTINGS = {
  shopName: 'Campus Print Studio',
  bwPrice: 2,
  colourPrice: 10,
  pickupBufferMinutes: 15,
  opensAt: '08:00',
  closesAt: '20:00',
};

const DEFAULT_PRINTER = {
  state: 'operational',
  downtimeMinutes: null,
  changedAt: '2026-01-01T00:00:00.000Z',
  recordedDowntimeMinutes: 0,
};

interface Migration {
  version: number;
  name: string;
  up: (client: PoolClient, schema: string) => Promise<void>;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial_printq_schema',
    up: async (client: PoolClient, schema: string) => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${schema}.users (
          auth_user_id text PRIMARY KEY,
          role text NOT NULL CHECK (role IN ('student', 'shopkeeper')),
          created_at timestamptz NOT NULL DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS ${schema}.shop_state (
          id text PRIMARY KEY,
          revision bigint NOT NULL,
          observed_at timestamptz NOT NULL,
          settings jsonb NOT NULL,
          printer jsonb NOT NULL,
          activity jsonb NOT NULL
        );

        CREATE TABLE IF NOT EXISTS ${schema}.jobs (
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

        CREATE INDEX IF NOT EXISTS idx_${schema}_jobs_shop_id ON ${schema}.jobs (shop_id);
        CREATE INDEX IF NOT EXISTS idx_${schema}_jobs_student_id ON ${schema}.jobs (student_id);

        CREATE TABLE IF NOT EXISTS ${schema}.uploads (
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

        CREATE INDEX IF NOT EXISTS idx_${schema}_uploads_state_expires ON ${schema}.uploads (state, expires_at);

        CREATE TABLE IF NOT EXISTS ${schema}.shopkeeper_invites (
          id text PRIMARY KEY,
          code_hash text NOT NULL UNIQUE,
          expires_at timestamptz NOT NULL,
          redeemed_by text NULL,
          redeemed_at timestamptz NULL
        );

        CREATE TABLE IF NOT EXISTS ${schema}.pickup_verifications (
          session_id text NOT NULL,
          job_id text NOT NULL,
          expires_at timestamptz NOT NULL,
          PRIMARY KEY (session_id, job_id)
        );

        CREATE INDEX IF NOT EXISTS idx_${schema}_pickup_verifications_expires ON ${schema}.pickup_verifications (expires_at);
      `);

      await client.query(
        `
        INSERT INTO ${schema}.shop_state (id, revision, observed_at, settings, printer, activity)
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

function validateSchemaName(schema: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) {
    throw new Error(`Invalid schema name: ${schema}`);
  }
  return schema;
}

export async function runMigrations(pool: Pool, schema = 'printq'): Promise<void> {
  const safeSchema = validateSchemaName(schema);
  const client = await pool.connect();
  let lockAcquired = false;

  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    lockAcquired = true;

    await client.query(`CREATE SCHEMA IF NOT EXISTS ${safeSchema}`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${safeSchema}.schema_migrations (
        version integer PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const appliedRes = await client.query<{ version: number }>(
      `SELECT version FROM ${safeSchema}.schema_migrations ORDER BY version ASC`,
    );
    const applied = new Set(appliedRes.rows.map((row) => Number(row.version)));

    for (const migration of MIGRATIONS) {
      if (applied.has(migration.version)) {
        continue;
      }

      await client.query('BEGIN');
      try {
        await migration.up(client, safeSchema);
        await client.query(
          `INSERT INTO ${safeSchema}.schema_migrations (version) VALUES ($1)`,
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
