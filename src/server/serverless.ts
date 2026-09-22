import { app } from './app.js';

export default function handler(req: any, res: any) {
  // Normalize URL in Vercel serverless environment if rewritten to /api
  if (req.headers && req.headers['x-matched-path'] && (req.url === '/api' || req.url === '/api/')) {
    req.url = req.headers['x-matched-path'];
  }
  return app(req, res);
}

export { app };
