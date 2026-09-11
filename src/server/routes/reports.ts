import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../services/db.js';

export const reportsRouter = Router({ mergeParams: true });

function escapeCsvCell(val: unknown): string {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// GET export full campaign report as CSV
reportsRouter.get('/report/csv', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: campaignId } = req.params;
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        recipients: {
          orderBy: { rowNumber: 'asc' },
          include: {
            sendAttempts: {
              orderBy: { timestamp: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    const headers = [
      'Row number',
      'Recipient name',
      'Email',
      'Company',
      'Job Title',
      'Campaign ID',
      'Status',
      'Attempt count',
      'Sent timestamp',
      'Failure reason',
    ];

    const lines: string[] = [headers.map(escapeCsvCell).join(',')];

    for (const r of campaign.recipients) {
      const name = [r.firstName, r.lastName].filter(Boolean).join(' ') || 'N/A';
      const lastAttempt = r.sendAttempts[0];
      const attemptCount = await prisma.sendAttempt.count({ where: { recipientId: r.id } });

      lines.push(
        [
          r.rowNumber,
          name,
          r.email || '',
          r.company || '',
          r.jobTitle || '',
          campaignId,
          r.status,
          attemptCount,
          r.sentAt ? r.sentAt.toISOString() : '',
          r.rejectReason || lastAttempt?.failureReason || '',
        ]
          .map(escapeCsvCell)
          .join(',')
      );
    }

    const csvContent = lines.join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="campaign-${campaignId}-report.csv"`
    );
    res.send(csvContent);
  } catch (err) {
    next(err);
  }
});

// GET export rejected rows as CSV
reportsRouter.get('/rejected/csv', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: campaignId } = req.params;
    const rejectedRecipients = await prisma.recipient.findMany({
      where: {
        campaignId,
        status: { not: 'READY' },
      },
      orderBy: { rowNumber: 'asc' },
    });

    const headers = ['Row Number', 'Email', 'First Name', 'Last Name', 'Company', 'Status', 'Reject Reason'];
    const lines: string[] = [headers.map(escapeCsvCell).join(',')];

    for (const r of rejectedRecipients) {
      lines.push(
        [
          r.rowNumber,
          r.email || '',
          r.firstName || '',
          r.lastName || '',
          r.company || '',
          r.status,
          r.rejectReason || '',
        ]
          .map(escapeCsvCell)
          .join(',')
      );
    }

    const csvContent = lines.join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="campaign-${campaignId}-rejected-rows.csv"`
    );
    res.send(csvContent);
  } catch (err) {
    next(err);
  }
});
