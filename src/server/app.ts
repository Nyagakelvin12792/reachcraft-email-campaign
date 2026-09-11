import express from 'express';
import cors from 'cors';
import { campaignsRouter } from './routes/campaigns.js';
import { uploadRouter } from './routes/upload.js';
import { templatesRouter } from './routes/templates.js';
import { approvalRouter } from './routes/approval.js';
import { queueRouter } from './routes/queue.js';
import { reportsRouter } from './routes/reports.js';
import { suppressionRouter } from './routes/suppression.js';
import { settingsRouter } from './routes/settings.js';
import { errorHandler } from './middleware/errorHandler.js';

export const app = express();

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Healthcheck
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Campaign & nested sub-routes
app.use('/api/campaigns', campaignsRouter);
app.use('/api/campaigns/:id', uploadRouter);
app.use('/api/campaigns/:id', templatesRouter);
app.use('/api/campaigns/:id', approvalRouter);
app.use('/api/campaigns/:id', queueRouter);
app.use('/api/campaigns/:id', reportsRouter);

// Global feature routes
app.use('/api/suppression', suppressionRouter);
app.use('/api/settings', settingsRouter);

// Serve uploaded template images
import path from 'path';
import fs from 'fs';

const imagesUploadDir = path.resolve(process.cwd(), 'uploads/images');
try {
  if (!fs.existsSync(imagesUploadDir)) {
    fs.mkdirSync(imagesUploadDir, { recursive: true });
  }
  app.use('/api/images', express.static(imagesUploadDir));
} catch (e) {
  // Read-only filesystem (e.g. serverless)
}

const publicImagesDir = path.resolve(process.cwd(), 'src/client/public/images');
if (fs.existsSync(publicImagesDir)) {
  app.use('/api/images', express.static(publicImagesDir));
}

const distImagesDir = path.resolve(process.cwd(), 'dist/client/images');
if (fs.existsSync(distImagesDir)) {
  app.use('/api/images', express.static(distImagesDir));
}

// Serve static frontend build if present

const clientDistPath = path.resolve(process.cwd(), 'dist/client');
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

// Error handling middleware
app.use(errorHandler);
