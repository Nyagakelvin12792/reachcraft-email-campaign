import { app } from './app.js';
import { config } from './config.js';
import { prisma } from './services/db.js';

const PORT = config.PORT || 3001;

async function bootstrap() {
  try {
    // Verify database connectivity
    await prisma.$connect();
    console.log('📦 Database connected successfully (SQLite via Prisma).');

    app.listen(PORT, () => {
      console.log(`🚀 Email Campaign Backend API running on http://localhost:${PORT}`);
      console.log(`🔒 Gmail User: ${config.GMAIL_USER ? 'Configured' : 'Not set (Mock mode active)'}`);
      console.log(`⏱️ Send delay configured: ${config.SEND_DELAY_MS}ms per recipient`);
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
}

bootstrap();
