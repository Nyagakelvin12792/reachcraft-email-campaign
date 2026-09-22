import { app } from './app.js';

export default function handler(req: any, res: any) {
  return app(req, res);
}

export { app };
