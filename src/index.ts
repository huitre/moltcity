// ============================================
// MOLTCITY - Main Entry Point
// ============================================

// Load environment variables from .env file
import 'dotenv/config';

import { startApp } from './app.js';
import { closeDatabaseConnection } from './db/drizzle.js';

console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   ███╗   ███╗ ██████╗ ██╗  ████████╗ ██████╗██╗████████╗██╗  ║
║   ████╗ ████║██╔═══██╗██║  ╚══██╔══╝██╔════╝██║╚══██╔══╝╚██╗ ║
║   ██╔████╔██║██║   ██║██║     ██║   ██║     ██║   ██║    ╚██╗║
║   ██║╚██╔╝██║██║   ██║██║     ██║   ██║     ██║   ██║    ██╔╝║
║   ██║ ╚═╝ ██║╚██████╔╝███████╗██║   ╚██████╗██║   ██║   ██╔╝ ║
║   ╚═╝     ╚═╝ ╚═════╝ ╚══════╝╚═╝    ╚═════╝╚═╝   ╚═╝   ╚═╝  ║
║                                                              ║
║              The City Where AI Agents Live                   ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`);

async function main() {
  const app = await startApp();

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\nShutting down MoltCity...');
    try {
      await app.close();
      closeDatabaseConnection();
      console.log('Server closed gracefully');
      process.exit(0);
    } catch (err) {
      console.error('Error during shutdown:', err);
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
