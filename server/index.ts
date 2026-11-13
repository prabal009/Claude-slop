import { loadConfig } from './config.ts';
import { runMigrations } from './db/migrations.ts';
import { createPool } from './db/pool.ts';
import { startUploadReaper } from './storage/reapUploads.ts';
import { createS3Client, ensureBucketCors } from './storage/s3.ts';
import { createApp } from './app.ts';

async function main(): Promise<void> {
  const config = loadConfig();

  if (config.mode === 'demo') {
    const { app } = createApp(config);
    const server = app.listen(config.port, config.host, () => {
      console.log(`[server] demo mode listening on http://${config.host}:${config.port}`);
    });
    const shutdown = () => {
      server.close(() => process.exit(0));
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    return;
  }

  const pool = createPool(config.databaseUrl);
  const s3 = createS3Client(config.s3);

  await runMigrations(pool);
  await ensureBucketCors(s3, config.s3.bucket, config.appUrl, config.isProduction);
  const stopReaper = startUploadReaper(pool, s3, config.s3.bucket);

  const { app, eventBus } = createApp(config, { pool, s3 });
  const server = app.listen(config.port, config.host, () => {
    console.log(`[server] cloud mode listening on http://${config.host}:${config.port}`);
  });

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    stopReaper();
    if (eventBus) {
      await eventBus.close();
    }
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => {
    void shutdown();
  });
  process.on('SIGTERM', () => {
    void shutdown();
  });
}

void main().catch((error) => {
  console.error('[server] fatal startup error:', error instanceof Error ? error.message : error);
  process.exit(1);
});
