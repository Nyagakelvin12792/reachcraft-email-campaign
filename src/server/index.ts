import { app } from './app.js';
import { config } from './config.js';
import { prisma } from './services/db.js';
import { queueWorker } from '../worker/queueWorker.js';

const PORT = config.PORT || 3001;

async function bootstrap() {
  try {
    // Verify database connectivity
    await prisma.$connect();
    console.log('📦 Database connected successfully (SQLite via Prisma).');

    // Start background queue worker in-process if enabled (ideal for single-service cloud deployments like Render/Railway)
    const runWorkerInProcess = process.env.RUN_WORKER_IN_PROCESS === 'true' || process.env.ENABLE_INPROCESS_WORKER === 'true';
    if (runWorkerInProcess) {
      console.log('⚡ Starting in-process persistent email queue worker...');
      queueWorker.start().catch((err) => {
        console.error('Queue worker encountered fatal error:', err);
      });
    }

    app.listen(PORT, () => {
      console.log(`🚀 Email Campaign Backend API running on http://localhost:${PORT}`);
      console.log(`🔒 Gmail User: ${config.GMAIL_USER ? 'Configured' : 'Not set (Mock mode active)'}`);
      console.log(`⏱️ Send delay configured: ${config.SEND_DELAY_MS}ms per recipient`);
      if (runWorkerInProcess) {
        console.log('📬 In-process queue worker is active and polling for campaigns.');
      }
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
}

bootstrap();
