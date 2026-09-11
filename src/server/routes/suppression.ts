import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../services/db.js';
import { validateEmail } from '../services/validator.js';
import { logAuditEvent } from '../services/auditLogger.js';

export const suppressionRouter = Router();

// GET suppression list
suppressionRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const list = await prisma.suppressionList.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json({ suppressions: list });
  } catch (err) {
    next(err);
  }
});

// POST add email to suppression list
const addSuppressionSchema = z.object({
  email: z.string().min(3),
  reason: z.string().optional().default('Manually added'),
});

suppressionRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, reason } = addSuppressionSchema.parse(req.body);
    const emailCheck = validateEmail(email);
    if (!emailCheck.valid) {
      res.status(400).json({ error: `Invalid email address: ${emailCheck.reason}` });
      return;
    }

    const normalized = email.trim().toLowerCase();

    const record = await prisma.suppressionList.upsert({
      where: { email: normalized },
      create: { email: normalized, reason },
      update: { reason },
    });

    await logAuditEvent('SUPPRESSION_ADDED', { email: normalized, reason }, undefined, req.ip);

    res.status(201).json({ suppression: record });
  } catch (err) {
    next(err);
  }
});

// DELETE remove email from suppression list (deliberate user removal)
suppressionRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const existing = await prisma.suppressionList.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'Suppression record not found' });
      return;
    }

    await prisma.suppressionList.delete({ where: { id } });
    await logAuditEvent('SUPPRESSION_REMOVED', { email: existing.email }, undefined, req.ip);

    res.json({ message: 'Email address removed from suppression list.' });
  } catch (err) {
    next(err);
  }
});
