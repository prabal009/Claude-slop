import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import pg from 'pg';
import { generateInviteCode, hashInviteCode } from '../server/auth/invites.ts';
import { runMigrations } from '../server/db/migrations.ts';

dotenv.config({ quiet: true });

function parseOutFlag(argv: string[]): string | null {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out') {
      return argv[i + 1] ?? null;
    }
    if (arg.startsWith('--out=')) {
      return arg.slice('--out='.length);
    }
  }
  return null;
}

function isForbiddenTargetPath(targetPath: string, cwd: string): boolean {
  const resolvedTarget = path.resolve(targetPath);
  const resolvedCwd = path.resolve(cwd);

  const forbiddenDirs = ['src', 'public', 'dist', 'dist-server', 'server', 'scripts'];
  for (const dir of forbiddenDirs) {
    const forbiddenPrefix = path.join(resolvedCwd, dir) + path.sep;
    if (resolvedTarget === path.join(resolvedCwd, dir) || resolvedTarget.startsWith(forbiddenPrefix)) {
      return true;
    }
  }

  const baseName = path.basename(resolvedTarget);
  if (baseName === '.env' || baseName.startsWith('.env.') || baseName === '.antideploy.json') {
    return true;
  }

  return false;
}

async function main(): Promise<void> {
  const rawOut = parseOutFlag(process.argv.slice(2));
  if (!rawOut || !path.isAbsolute(rawOut)) {
    console.error('Error: --out <absolute-path> is required.');
    process.exitCode = 1;
    return;
  }

  const resolvedOut = path.resolve(rawOut);
  if (isForbiddenTargetPath(resolvedOut, process.cwd())) {
    console.error('Error: Refusing to write invite file inside repository source/config paths.');
    process.exitCode = 1;
    return;
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error('Error: DATABASE_URL is required.');
    process.exitCode = 1;
    return;
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await runMigrations(pool);

    const code = generateInviteCode();
    const codeHash = hashInviteCode(code);
    const inviteId = crypto.randomUUID();

    await pool.query(
      `
      INSERT INTO printq.shopkeeper_invites (id, code_hash, expires_at)
      VALUES ($1, $2, now() + interval '7 days')
      `,
      [inviteId, codeHash],
    );

    await fs.mkdir(path.dirname(resolvedOut), { recursive: true });
    await fs.writeFile(resolvedOut, `${code}\n`, { encoding: 'utf8', mode: 0o600 });
    await fs.chmod(resolvedOut, 0o600);

    console.log(`Invite written to ${resolvedOut}`);
  } finally {
    await pool.end();
  }
}

void main();
