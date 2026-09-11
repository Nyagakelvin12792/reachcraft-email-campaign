import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { config } from '../config.js';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Handle Zod validation errors
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validation failed',
      details: err.flatten().fieldErrors,
    });
    return;
  }

  // Handle standard errors
  if (err instanceof Error) {
    const isProd = config.NODE_ENV === 'production';
    console.error(`[API Error]: ${err.message}`, isProd ? '' : err.stack);

    res.status(500).json({
      error: err.message || 'Internal Server Error',
      // Never expose stack trace in production
      ...(isProd ? {} : { stack: err.stack }),
    });
    return;
  }

  res.status(500).json({
    error: 'An unexpected error occurred.',
  });
}
