import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../services/db.js';
import { logAuditEvent } from '../services/auditLogger.js';

export const campaignsRouter = Router();

// GET all campaigns
campaignsRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const campaigns = await prisma.campaign.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        sendJob: true,
        template: {
          select: { subject: true, senderName: true },
        },
      },
    });

    res.json({ campaigns });
  } catch (err) {
    next(err);
  }
});

// GET single campaign
campaignsRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: {
        template: true,
        sendJob: true,
        recipients: {
          orderBy: { rowNumber: 'asc' },
        },
      },
    });

    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    res.json({ campaign });
  } catch (err) {
    next(err);
  }
});

// POST create campaign
const createCampaignSchema = z.object({
  name: z.string().min(1, 'Campaign name is required').max(100),
  sendDelayMs: z.number().min(500).default(2000),
  optOutEnabled: z.boolean().default(true),
  optOutText: z.string().optional(),
});

campaignsRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = createCampaignSchema.parse(req.body);

    const campaign = await prisma.campaign.create({
      data: {
        name: parsed.name,
        sendDelayMs: parsed.sendDelayMs,
        optOutEnabled: parsed.optOutEnabled,
        optOutText: parsed.optOutText ?? "If you wish to opt out from future communications, please reply with 'UNSUBSCRIBE'.",
        status: 'DRAFT',
      },
    });

    await logAuditEvent('CAMPAIGN_CREATED', { name: campaign.name }, campaign.id, req.ip);

    res.status(201).json({ campaign });
  } catch (err) {
    next(err);
  }
});

// PATCH editable campaign setup fields before approval
const updateCampaignSchema = z.object({
  name: z.string().trim().min(1, 'Campaign name is required').max(100).optional(),
  sendDelayMs: z.number().min(500).max(10000).optional(),
}).refine((data) => data.name !== undefined || data.sendDelayMs !== undefined, {
  message: 'Provide at least one campaign field to update',
});

campaignsRouter.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const parsed = updateCampaignSchema.parse(req.body);
    const existing = await prisma.campaign.findUnique({ where: { id } });

    if (!existing) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    if (['SENDING', 'COMPLETED', 'CANCELLED'].includes(existing.status)) {
      res.status(409).json({ error: 'This campaign can no longer be edited.' });
      return;
    }

    const campaign = await prisma.campaign.update({
      where: { id },
      data: parsed,
    });

    await logAuditEvent('CAMPAIGN_SETUP_UPDATED', {
      fields: Object.keys(parsed),
    }, campaign.id, req.ip);

    res.json({ campaign });
  } catch (err) {
    next(err);
  }
});

// DELETE campaign
campaignsRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await prisma.campaign.delete({
      where: { id },
    });

    await logAuditEvent('CAMPAIGN_DELETED', { id }, id, req.ip);

    res.json({ message: 'Campaign deleted successfully' });
  } catch (err) {
    next(err);
  }
});
