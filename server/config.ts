import dotenv from 'dotenv';

dotenv.config({ quiet: true });

export type RuntimeMode = 'cloud' | 'demo';

export interface S3Config {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

export interface CloudConfig {
  mode: 'cloud';
  isProduction: boolean;
  host: string;
  port: number;
  appUrl: string;
  databaseUrl: string;
  neonAuthBaseUrl: string;
  neonAuthCookieSecret?: string;
  neonAuthJwksUrl?: string;
  sessionSecret: string;
  s3: S3Config;
}

export interface DemoConfig {
  mode: 'demo';
  isProduction: false;
  host: string;
  port: number;
  appUrl: string;
}

export type AppConfig = CloudConfig | DemoConfig;

function parsePort(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid port value: ${raw}`);
  }
  return parsed;
}

function getCliFlagValue(argv: string[], flag: string): string | undefined {
  const eqPrefix = `${flag}=`;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith(eqPrefix)) {
      return arg.slice(eqPrefix.length);
    }
    if (arg === flag && i + 1 < argv.length) {
      return argv[i + 1];
    }
  }
  return undefined;
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function loadConfig(
  argv: string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
): AppConfig {
  const isProduction = argv.includes('--production');
  const cliPort = getCliFlagValue(argv, '--port');

  const host = isProduction ? '0.0.0.0' : '127.0.0.1';
  const port = isProduction
    ? parsePort(nonEmpty(env.PORT) ?? cliPort, 3000)
    : parsePort(nonEmpty(env.API_PORT), 3000);

  const databaseUrl = nonEmpty(env.DATABASE_URL);
  const neonAuthBaseUrl = nonEmpty(env.NEON_AUTH_BASE_URL);
  const s3Endpoint = nonEmpty(env.AWS_ENDPOINT_URL_S3);
  const s3Region = nonEmpty(env.AWS_REGION);
  const s3AccessKeyId = nonEmpty(env.AWS_ACCESS_KEY_ID);
  const s3SecretAccessKey = nonEmpty(env.AWS_SECRET_ACCESS_KEY);
  const s3Bucket = nonEmpty(env.BUCKET_NAME) ?? nonEmpty(env.S3_BUCKET);
  const sessionSecret = nonEmpty(env.SESSION_SECRET);

  const cloudEntries: Array<[string, string | undefined]> = [
    ['DATABASE_URL', databaseUrl],
    ['NEON_AUTH_BASE_URL', neonAuthBaseUrl],
    ['AWS_ENDPOINT_URL_S3', s3Endpoint],
    ['AWS_REGION', s3Region],
    ['AWS_ACCESS_KEY_ID', s3AccessKeyId],
    ['AWS_SECRET_ACCESS_KEY', s3SecretAccessKey],
    ['BUCKET_NAME (or S3_BUCKET)', s3Bucket],
    ['SESSION_SECRET', sessionSecret],
  ];

  const presentCount = cloudEntries.filter(([, value]) => Boolean(value)).length;
  const missingKeys = cloudEntries.filter(([, value]) => !value).map(([key]) => key);

  if (presentCount === 0 && !isProduction) {
    return {
      mode: 'demo',
      isProduction: false,
      host,
      port,
      appUrl: nonEmpty(env.APP_URL) ?? 'http://localhost:5173',
    };
  }

  if (missingKeys.length > 0) {
    const context = isProduction ? 'Production mode (--production)' : 'Partial cloud configuration';
    throw new Error(`${context} requires all cloud environment variables. Missing: ${missingKeys.join(', ')}`);
  }

  const appUrl = nonEmpty(env.APP_URL) ?? (isProduction ? undefined : 'http://localhost:5173');
  if (!appUrl) {
    throw new Error('Production mode (--production) requires APP_URL to be configured.');
  }

  return {
    mode: 'cloud',
    isProduction,
    host,
    port,
    appUrl: appUrl.replace(/\/+$/, ''),
    databaseUrl: databaseUrl!,
    neonAuthBaseUrl: neonAuthBaseUrl!.replace(/\/+$/, ''),
    neonAuthCookieSecret: nonEmpty(env.NEON_AUTH_COOKIE_SECRET),
    neonAuthJwksUrl: nonEmpty(env.NEON_AUTH_JWKS_URL),
    sessionSecret: sessionSecret!,
    s3: {
      endpoint: s3Endpoint!,
      region: s3Region!,
      accessKeyId: s3AccessKeyId!,
      secretAccessKey: s3SecretAccessKey!,
      bucket: s3Bucket!,
    },
  };
}
