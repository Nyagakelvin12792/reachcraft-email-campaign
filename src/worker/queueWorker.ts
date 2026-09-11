import { prisma } from '../server/services/db.js';
import { config, maskEmail } from '../server/config.js';
import { sendPersonalizedEmail, SmtpCategory } from '../server/services/mailer.js';
import { renderEmail } from '../server/services/templateEngine.js';
import { logAuditEvent } from '../server/services/auditLogger.js';

export class QueueWorker {
  private isRunning: boolean = false;
  private pollIntervalMs: number = 1000;

  /**
   * Recovers any stalled jobs or state from prior sudden server restarts
   */
  public async recoverStalledJobs(): Promise<void> {
    try {
      // Find jobs marked RUNNING that were interrupted
      const runningJobs = await prisma.sendJob.findMany({
        where: { status: 'RUNNING' },
      });

      for (const job of runningJobs) {
        console.log(`🔄 Recovering stalled send job for campaign ${job.campaignId}`);
        await prisma.sendJob.update({
          where: { id: job.id },
          data: { status: 'QUEUED' },
        });
      }
    } catch (err) {
      console.error('Error during stalled jobs recovery:', err);
    }
  }

  /**
   * Starts the persistent worker polling loop
   */
  public async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('📬 Persistent Email Queue Worker started.');

    await this.recoverStalledJobs();

    while (this.isRunning) {
      try {
        await this.processNextBatch();
      } catch (err) {
        console.error('Worker loop encountered an error:', err);
      }
      await this.sleep(this.pollIntervalMs);
    }
  }

  public stop(): void {
    this.isRunning = false;
    console.log('🛑 Persistent Email Queue Worker stopped.');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Inspects database for queued jobs and processes the next eligible recipient
   */
  public async processNextBatch(specificCampaignId?: string): Promise<boolean> {
    // 1. Find the oldest queued or running job (or targeted campaign)
    const whereClause: Record<string, unknown> = {
      status: { in: ['QUEUED', 'RUNNING'] },
    };
    if (specificCampaignId) {
      whereClause.campaignId = specificCampaignId;
    }

    const job = await prisma.sendJob.findFirst({
      where: whereClause,
      include: {
        campaign: {
          include: {
            template: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (!job || !job.campaign || !job.campaign.template) {
      return false; // Nothing to process right now
    }

    const campaign = job.campaign;
    const template = campaign.template;
    if (!template) {
      return false;
    }

    // Check if campaign was paused or cancelled
    if (campaign.status === 'PAUSED') {
      if (job.status !== 'PAUSED') {
        await prisma.sendJob.update({ where: { id: job.id }, data: { status: 'PAUSED' } });
      }
      return false;
    }

    if (campaign.status === 'CANCELLED') {
      if (job.status !== 'CANCELLED') {
        await prisma.sendJob.update({
          where: { id: job.id },
          data: { status: 'CANCELLED', completedAt: new Date() },
        });
      }
      return false;
    }

    // Set job to RUNNING if it was QUEUED
    if (job.status === 'QUEUED') {
      await prisma.sendJob.update({
        where: { id: job.id },
        data: { status: 'RUNNING', startedAt: job.startedAt || new Date() },
      });
    }

    // 2. Fetch the next unsent, ready, non-excluded recipient
    const recipient = await prisma.recipient.findFirst({
      where: {
        campaignId: campaign.id,
        status: 'READY',
        isExcluded: false,
        sentAt: null,
      },
      orderBy: { rowNumber: 'asc' },
    });

    // If no more recipients, mark job and campaign as COMPLETED
    if (!recipient) {
      const now = new Date();
      await prisma.$transaction([
        prisma.sendJob.update({
          where: { id: job.id },
          data: { status: 'COMPLETED', completedAt: now },
        }),
        prisma.campaign.update({
          where: { id: campaign.id },
          data: { status: 'COMPLETED' },
        }),
      ]);

      await logAuditEvent('CAMPAIGN_COMPLETED', {
        sentCount: job.sentCount,
        failedCount: job.failedCount,
        skippedCount: job.skippedCount,
      }, campaign.id);

      console.log(`🎉 Campaign ${campaign.name} (${campaign.id}) finished dispatching all recipients.`);
      return true;
    }

    const recipientEmail = recipient.email?.trim().toLowerCase();
    if (!recipientEmail) {
      // Missing email, skip
      await prisma.recipient.update({
        where: { id: recipient.id },
        data: { status: 'MISSING_EMAIL' },
      });
      await prisma.sendJob.update({
        where: { id: job.id },
        data: { skippedCount: { increment: 1 } },
      });
      return true;
    }

    // 3. Suppression list check (never send to suppressed addresses)
    const suppression = await prisma.suppressionList.findUnique({
      where: { email: recipientEmail },
    });

    if (suppression) {
      console.log(`⛔ Recipient ${maskEmail(recipientEmail)} is suppressed. Skipping send.`);
      await prisma.$transaction([
        prisma.recipient.update({
          where: { id: recipient.id },
          data: {
            status: 'SUPPRESSED',
            rejectReason: `Address is suppressed: ${suppression.reason || 'Suppression list'}`,
          },
        }),
        prisma.sendAttempt.create({
          data: {
            campaignId: campaign.id,
            recipientId: recipient.id,
            maskedEmail: maskEmail(recipientEmail),
            attemptNumber: 1,
            status: 'SKIPPED',
            smtpResponseCategory: 'PERM_FAILURE',
            failureReason: 'Address matches suppression list',
          },
        }),
        prisma.sendJob.update({
          where: { id: job.id },
          data: { skippedCount: { increment: 1 } },
        }),
      ]);
      return true;
    }

    // 4. Render personalized email for this specific recipient
    let customFields: Record<string, string> = {};
    if (recipient.customFields) {
      try {
        customFields = JSON.parse(recipient.customFields);
      } catch { /* ignore */ }
    }

    const rendered = renderEmail(
      template.subject,
      template.bodyText,
      template.bodyHtml,
      template.signature,
      { enabled: campaign.optOutEnabled, text: campaign.optOutText },
      {
        email: recipient.email,
        firstName: recipient.firstName,
        lastName: recipient.lastName,
        company: recipient.company,
        phone: recipient.phone,
        jobTitle: recipient.jobTitle,
        awb: recipient.awb,
        destination: recipient.destination,
        customFields,
      },
      false // Do not insert missing token badges in live sending
    );

    // Calculate attempt number
    const previousAttempts = await prisma.sendAttempt.count({
      where: { recipientId: recipient.id },
    });
    const currentAttemptNumber = previousAttempts + 1;

    // 5. Send single email via Nodemailer Gmail SMTP
    console.log(`📤 Sending to ${maskEmail(recipientEmail)} (Campaign: ${campaign.name}, Row: ${recipient.rowNumber})...`);

    const result = await sendPersonalizedEmail({
      to: recipient.email!,
      subject: rendered.subject,
      text: rendered.bodyText,
      html: rendered.bodyHtml,
      senderName: template.senderName || undefined,
      replyTo: template.replyTo || undefined,
    });

    const now = new Date();

    // 6. Record SendAttempt in database
    await prisma.sendAttempt.create({
      data: {
        campaignId: campaign.id,
        recipientId: recipient.id,
        maskedEmail: maskEmail(recipient.email),
        attemptNumber: currentAttemptNumber,
        status: result.success ? 'SENT' : 'FAILED',
        smtpResponseCategory: result.category,
        smtpCode: result.code,
        responseMessage: result.message,
        failureReason: result.success ? null : result.message,
        timestamp: now,
      },
    });

    // 7. Process delivery outcome
    if (result.success) {
      // Idempotency: mark sentAt and update status
      await prisma.$transaction([
        prisma.recipient.update({
          where: { id: recipient.id },
          data: {
            sentAt: now,
            previewSubject: rendered.subject,
            previewBodyText: rendered.bodyText,
          },
        }),
        prisma.sendJob.update({
          where: { id: job.id },
          data: { sentCount: { increment: 1 } },
        }),
      ]);
    } else {
      // Failure Handling
      if (result.category === 'AUTH_ERROR' || result.category === 'QUOTA_ERROR') {
        // Stop entire campaign immediately on quota/auth error
        console.error(`🚨 Halting campaign ${campaign.id} due to ${result.category}: ${result.message}`);
        await prisma.$transaction([
          prisma.sendJob.update({
            where: { id: job.id },
            data: { status: 'FAILED', lastError: result.message },
          }),
          prisma.campaign.update({
            where: { id: campaign.id },
            data: { status: 'FAILED' },
          }),
        ]);

        await logAuditEvent('CAMPAIGN_HALTED_ON_LIMIT', {
          category: result.category,
          message: result.message,
        }, campaign.id);

        return true;
      }

      if (result.category === 'PERM_FAILURE') {
        // Permanent address failure: never retry automatically
        await prisma.$transaction([
          prisma.recipient.update({
            where: { id: recipient.id },
            data: {
              status: 'FAILED',
              rejectReason: result.message,
            },
          }),
          prisma.sendJob.update({
            where: { id: job.id },
            data: { failedCount: { increment: 1 } },
          }),
        ]);
      } else {
        // Temporary failure
        if (currentAttemptNumber >= config.MAX_RETRIES) {
          // Exceeded retry limit
          await prisma.$transaction([
            prisma.recipient.update({
              where: { id: recipient.id },
              data: {
                status: 'FAILED',
                rejectReason: `Failed after ${currentAttemptNumber} attempts: ${result.message}`,
              },
            }),
            prisma.sendJob.update({
              where: { id: job.id },
              data: { failedCount: { increment: 1 } },
            }),
          ]);
        } else {
          // Transient failure within retry limit -> apply backoff
          const backoffDelay = Math.min(30000, 1000 * Math.pow(2, currentAttemptNumber));
          console.log(`⏳ Temporary failure for ${maskEmail(recipientEmail)}. Backing off ${backoffDelay}ms before next retry.`);
          await this.sleep(backoffDelay);
        }
      }
    }

    // 8. Rate Limiting: Delay before processing the next recipient
    const delay = campaign.sendDelayMs || config.SEND_DELAY_MS || 2000;
    await this.sleep(delay);

    return true;
  }
}

export const queueWorker = new QueueWorker();
