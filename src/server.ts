import { env } from './config/env';
import { migrate } from './repo/db';
import { createApp } from './app';

async function main() {
  await migrate();

  const { app, close, startScheduler } = createApp();

  const server = app.listen(env.PORT, () => {
    console.log(`API listening on http://localhost:${env.PORT}`);
    startScheduler();
  });

  function shutdown(signal: string) {
    console.log(`${signal} received, shutting down`);
    server.close(async () => {
      await close(); // closes the database pool and the shared Chrome used for PDFs
      process.exit(0);
    });
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Failed to start', err);
  process.exit(1);
});
