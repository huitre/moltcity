// ============================================
// MOLTCITY - Fastify Entry Point
// ============================================

import { startApp } from './app.js';
import { closeDatabaseConnection } from './db/drizzle.js';

async function main() {
  const app = await startApp();

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n🛑 Shutting down MoltCity...');

    try {
      await app.close();
      closeDatabaseConnection();
      console.log('✅ Server closed gracefully');
      process.exit(0);
    } catch (err) {
      console.error('❌ Error during shutdown:', err);
      process.exit(1);
    }
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Failed to start MoltCity:', err);
  process.exit(1);
});
