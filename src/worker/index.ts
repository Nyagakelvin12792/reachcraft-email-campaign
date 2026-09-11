import { queueWorker } from './queueWorker.js';

async function main() {
  console.log('🚀 Launching standalone persistent email queue worker...');

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('Received SIGINT. Shutting down worker...');
    queueWorker.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('Received SIGTERM. Shutting down worker...');
    queueWorker.stop();
    process.exit(0);
  });

  await queueWorker.start();
}

main().catch((err) => {
  console.error('Fatal error in queue worker:', err);
  process.exit(1);
});
