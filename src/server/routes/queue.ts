import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../services/db.js';
import { logAuditEvent } from '../services/auditLogger.js';

export const queueRouter = Router({ mergeParams: true });

// GET campaign progress and real-time statistics
queueRouter.get('/progress', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: campaignId } = req.params;
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        sendJob: true,
      },
    });

    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    const job = campaign.sendJob;
    const total = job ? job.totalRecipients : campaign.approvedCount;
    const sent = job ? job.sentCount : 0;
    const failed = job ? job.failedCount : 0;
    const skipped = job ? job.skippedCount : 0;
    const processed = sent + failed + skipped;
    const queued = Math.max(0, total - processed);

    const percentComplete = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;

    // Estimate completion time based on queued count * sendDelayMs
    const remainingMs = queued * (campaign.sendDelayMs || 2000);
    const estimatedSecondsRemaining = Math.ceil(remainingMs / 1000);

    // Fetch recent 15 send attempts
    const recentAttempts = await prisma.sendAttempt.findMany({
      where: { campaignId },
      orderBy: { timestamp: 'desc' },
      take: 15,
    });

    res.json({
      campaignId,
      campaignName: campaign.name,
      campaignStatus: campaign.status,
      jobStatus: job?.status || 'IDLE',
      metrics: {
        totalRecipients: total,
        queued,
        sending: job?.status === 'RUNNING' ? 1 : 0,
        sent,
        failed,
        skipped,
        percentageComplete: percentComplete,
        estimatedSecondsRemaining,
      },
      recentAttempts,
    });
  } catch (err) {
    next(err);
  }
});

// POST pause campaign
queueRouter.post('/pause', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: campaignId } = req.params;
    const now = new Date();

    await prisma.$transaction([
      prisma.campaign.update({
        where: { id: campaignId },
        data: { status: 'PAUSED' },
      }),
      prisma.sendJob.updateMany({
        where: { campaignId },
        data: {
          status: 'PAUSED',
          pausedAt: now,
        },
      }),
    ]);

    await logAuditEvent('CAMPAIGN_PAUSED', {}, campaignId, req.ip);
    res.json({ success: true, message: 'Campaign paused.' });
  } catch (err) {
    next(err);
  }
});

// POST resume campaign
queueRouter.post('/resume', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: campaignId } = req.params;

    await prisma.$transaction([
      prisma.campaign.update({
        where: { id: campaignId },
        data: { status: 'SENDING' },
      }),
      prisma.sendJob.updateMany({
        where: { campaignId },
        data: {
          status: 'QUEUED',
          pausedAt: null,
        },
      }),
    ]);

    await logAuditEvent('CAMPAIGN_RESUMED', {}, campaignId, req.ip);
    res.json({ success: true, message: 'Campaign resumed.' });
  } catch (err) {
    next(err);
  }
});

// POST cancel campaign
queueRouter.post('/cancel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: campaignId } = req.params;
    const now = new Date();

    await prisma.$transaction([
      prisma.campaign.update({
        where: { id: campaignId },
        data: { status: 'CANCELLED' },
      }),
      prisma.sendJob.updateMany({
        where: { campaignId },
        data: {
          status: 'CANCELLED',
          completedAt: now,
        },
      }),
    ]);

    await logAuditEvent('CAMPAIGN_CANCELLED', {}, campaignId, req.ip);
    res.json({ success: true, message: 'Campaign cancelled. Unsent recipients will not be sent.' });
  } catch (err) {
    next(err);
  }
});

// POST retry failed emails (excludes permanent bounce failures)
queueRouter.post('/retry', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: campaignId } = req.params;

    // Find recipients that failed with temporary errors
    // Note: permanent rejections like invalid address/non-existent user are never retried automatically
    const failedAttempts = await prisma.sendAttempt.findMany({
      where: {
        campaignId,
        status: 'FAILED',
        smtpResponseCategory: { not: 'PERM_FAILURE' },
      },
      select: { recipientId: true },
    });

    const retryableIds = Array.from(new Set(failedAttempts.map((a) => a.recipientId)));

    if (retryableIds.length === 0) {
      res.status(400).json({
        error: 'No retryable failed recipients found. (Permanent delivery rejections cannot be retried).',
      });
      return;
    }

    // Reset these recipients to READY and re-enqueue job
    await prisma.$transaction([
      prisma.recipient.updateMany({
        where: { id: { in: retryableIds } },
        data: {
          sentAt: null,
          status: 'READY',
        },
      }),
      prisma.sendJob.updateMany({
        where: { campaignId },
        data: {
          status: 'QUEUED',
          completedAt: null,
        },
      }),
      prisma.campaign.update({
        where: { id: campaignId },
        data: { status: 'SENDING' },
      }),
    ]);

    await logAuditEvent('FAILED_RECIPIENTS_RETRIED', { count: retryableIds.length }, campaignId, req.ip);

    res.json({
      success: true,
      message: `Re-queued ${retryableIds.length} failed recipients for retry.`,
      retriedCount: retryableIds.length,
    });
  } catch (err) {
    next(err);
  }
});
