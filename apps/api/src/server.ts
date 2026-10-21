import 'dotenv/config';
import app, { startApp, stopApp } from './app.js';
import { getEnv } from './config/env';

const env = getEnv();

async function main() {
  await startApp();
  const server = app.listen(env.API_PORT, () => {
    console.log(`[Server] API listening on http://localhost:${env.API_PORT}`);
  });

  const shutdown = async (signal: string) => {
    console.log(`[Server] Received ${signal}, shutting down...`);
    server.close(async () => {
      try {
        await stopApp();
        console.log('[Server] Shutdown complete');
        process.exit(0);
      } catch (err) {
        console.error('[Server] Shutdown error:', err);
        process.exit(1);
      }
    });

    setTimeout(() => {
      console.error('[Server] Force shutdown after timeout');
      process.exit(1);
    }, 30000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    console.error('[Server] Unhandled rejection:', reason);
  });

  process.on('uncaughtException', (err) => {
    console.error('[Server] Uncaught exception:', err);
    process.exit(1);
  });
}

main().catch(err => {
  console.error('[Server] Startup error:', err);
  process.exit(1);
});