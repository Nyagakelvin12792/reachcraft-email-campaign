import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../services/db.js';
import { validateEmail } from '../services/validator.js';
import { renderEmail } from '../services/templateEngine.js';
import { sendPersonalizedEmail } from '../services/mailer.js';
import { logAuditEvent } from '../services/auditLogger.js';
import { capitalizePersonName } from '../services/nameFormatter.js';

export const approvalRouter = Router({ mergeParams: true });

// Toggle recipient exclusion
approvalRouter.post('/recipients/:recipientId/toggle-exclude', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { recipientId } = req.params;
    const recipient = await prisma.recipient.findUnique({ where: { id: recipientId } });
    if (!recipient) {
      res.status(404).json({ error: 'Recipient not found' });
      return;
    }

    const updated = await prisma.recipient.update({
      where: { id: recipientId },
      data: { isExcluded: !recipient.isExcluded },
    });

    res.json({ success: true, isExcluded: updated.isExcluded });
  } catch (err) {
    next(err);
  }
});

// Bulk toggle exclusion
const bulkExcludeSchema = z.object({
  recipientIds: z.array(z.string()),
  isExcluded: z.boolean(),
});

approvalRouter.post('/recipients/bulk-exclude', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { recipientIds, isExcluded } = bulkExcludeSchema.parse(req.body);
    await prisma.recipient.updateMany({
      where: { id: { in: recipientIds } },
      data: { isExcluded },
    });

    res.json({ success: true, count: recipientIds.length, isExcluded });
  } catch (err) {
    next(err);
  }
});

// PATCH update recipient details (e.g. paste missing details to resolve placeholders)
const updateRecipientSchema = z.object({
  email: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  company: z.string().optional(),
  phone: z.string().optional(),
  jobTitle: z.string().optional(),
  awb: z.string().optional(),
  destination: z.string().optional(),
});

approvalRouter.patch('/recipients/:recipientId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: campaignId, recipientId } = req.params;
    const data = updateRecipientSchema.parse(req.body);

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: { template: true },
    });

    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    const existing = await prisma.recipient.findUnique({ where: { id: recipientId } });
    if (!existing) {
      res.status(404).json({ error: 'Recipient not found' });
      return;
    }

    const updatedEmail = data.email !== undefined ? data.email.trim() : existing.email;
    const updatedFirstName = data.firstName !== undefined
      ? capitalizePersonName(data.firstName)
      : capitalizePersonName(existing.firstName);
    const updatedLastName = data.lastName !== undefined
      ? capitalizePersonName(data.lastName)
      : capitalizePersonName(existing.lastName);
    let status = existing.status;
    let rejectReason: string | null = existing.rejectReason;

    if (data.email !== undefined) {
      const emailCheck = validateEmail(updatedEmail || '');
      if (emailCheck.valid) {
        status = 'READY';
        rejectReason = null;
      } else {
        status = 'INVALID_EMAIL';
        rejectReason = emailCheck.reason || 'Invalid email address';
      }
    }

    // Re-render preview if template exists
    let previewSubject = existing.previewSubject;
    let previewBodyText = existing.previewBodyText;
    let previewBodyHtml = existing.previewBodyHtml;
    let missingPlaceholdersStr: string | null = null;

    if (campaign.template) {
      let customFields: Record<string, string> = {};
      if (existing.customFields) {
        try { customFields = JSON.parse(existing.customFields); } catch { /* ignore */ }
      }

      const rendered = renderEmail(
        campaign.template.subject,
        campaign.template.bodyText,
        campaign.template.bodyHtml,
        campaign.template.signature,
        { enabled: campaign.optOutEnabled, text: campaign.optOutText },
        {
          email: updatedEmail,
          firstName: updatedFirstName,
          lastName: updatedLastName,
          company: data.company !== undefined ? data.company : existing.company,
          phone: data.phone !== undefined ? data.phone : existing.phone,
          jobTitle: data.jobTitle !== undefined ? data.jobTitle : existing.jobTitle,
          awb: data.awb !== undefined ? data.awb : existing.awb,
          destination: data.destination !== undefined ? data.destination : existing.destination,
          customFields,
        },
        true
      );

      previewSubject = rendered.subject;
      previewBodyText = rendered.bodyText;
      previewBodyHtml = rendered.bodyHtml || null;
      missingPlaceholdersStr = rendered.missingPlaceholders.length > 0 ? JSON.stringify(rendered.missingPlaceholders) : null;
    }

    const updated = await prisma.recipient.update({
      where: { id: recipientId },
      data: {
        email: updatedEmail,
        firstName: updatedFirstName,
        lastName: updatedLastName,
        company: data.company !== undefined ? data.company : existing.company,
        phone: data.phone !== undefined ? data.phone : existing.phone,
        jobTitle: data.jobTitle !== undefined ? data.jobTitle : existing.jobTitle,
        awb: data.awb !== undefined ? data.awb : existing.awb,
        destination: data.destination !== undefined ? data.destination : existing.destination,
        status,
        rejectReason,
        previewSubject,
        previewBodyText,
        previewBodyHtml,
        missingPlaceholders: missingPlaceholdersStr,
      },
    });

    res.json({ success: true, recipient: updated });
  } catch (err) {
    next(err);
  }
});

// Send 1 test email (Gate 5)
const testEmailSchema = z.object({
  testEmail: z.string().min(3),
});

approvalRouter.post('/test-email', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: campaignId } = req.params;
    const { testEmail } = testEmailSchema.parse(req.body);

    const emailCheck = validateEmail(testEmail);
    if (!emailCheck.valid) {
      res.status(400).json({ error: `Invalid test email address: ${emailCheck.reason}` });
      return;
    }

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: { template: true },
    });

    if (!campaign || !campaign.template) {
      res.status(400).json({ error: 'Campaign template is missing. Please save a template before sending a test.' });
      return;
    }

    // Pick first ready recipient as sample data or fallback to generic data
    const sampleRecipient = await prisma.recipient.findFirst({
      where: { campaignId, status: 'READY' },
    });

    let sampleCustomFields: Record<string, string> = {};
    if (sampleRecipient?.customFields) {
      try { sampleCustomFields = JSON.parse(sampleRecipient.customFields); } catch { /* ignore */ }
    }

    const recipientData = sampleRecipient
      ? {
          email: testEmail,
          firstName: sampleRecipient.firstName || 'Participant',
          lastName: sampleRecipient.lastName || '',
          company: sampleRecipient.company || 'Organization',
          phone: sampleRecipient.phone || '',
          jobTitle: sampleRecipient.jobTitle || 'Attendee',
          customFields: sampleCustomFields,
        }
      : {
          email: testEmail,
          firstName: 'Sample',
          lastName: 'Recipient',
          company: 'Sample Organization',
          phone: '',
          jobTitle: 'Participant',
          customFields: {},
        };

    const rendered = renderEmail(
      `[TEST] ${campaign.template.subject}`,
      `*** THIS IS A CAMPAIGN TEST EMAIL ***\n\n${campaign.template.bodyText}`,
      campaign.template.bodyHtml
        ? `<div style="background-color: #fef3c7; color: #92400e; padding: 10px; font-weight: bold; border-radius: 4px; margin-bottom: 16px; border: 1px solid #fcd34d;">⚠️ THIS IS A CAMPAIGN TEST EMAIL</div>${campaign.template.bodyHtml}`
        : undefined,
      campaign.template.signature,
      { enabled: campaign.optOutEnabled, text: campaign.optOutText },
      recipientData,
      false // Do not render missing token badges in real test email dispatch
    );

    // Dispatch test email
    const sendResult = await sendPersonalizedEmail({
      to: testEmail,
      subject: rendered.subject,
      text: rendered.bodyText,
      html: rendered.bodyHtml,
      senderName: campaign.template.senderName || undefined,
      replyTo: campaign.template.replyTo || undefined,
    });

    if (!sendResult.success) {
      res.status(500).json({
        error: `Failed to deliver test email: ${sendResult.message}`,
        category: sendResult.category,
      });
      return;
    }

    // Record test email fulfillment
    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        testEmailAddress: testEmail,
        testEmailSentAt: new Date(),
      },
    });

    await logAuditEvent('TEST_EMAIL_SENT', { testEmail, messageId: sendResult.messageId }, campaignId, req.ip);

    res.json({
      success: true,
      message: 'Test email successfully dispatched via Gmail SMTP.',
      testEmailAddress: testEmail,
      testEmailSentAt: new Date(),
    });
  } catch (err) {
    next(err);
  }
});

// Final Approval Gate: Requires typing "SEND", verifies all gates, and enqueues campaign (Gate 7)
const approveSchema = z.object({
  confirmationText: z.string(),
});

approvalRouter.post('/approve-and-start', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: campaignId } = req.params;
    const { confirmationText } = approveSchema.parse(req.body);

    // Gate 7: Strict verification of confirmation phrase
    if (confirmationText.trim() !== 'SEND') {
      res.status(400).json({
        error: "Confirmation text mismatch. You must type exactly 'SEND' to authorize starting this campaign.",
      });
      return;
    }

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        template: true,
      },
    });

    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    // Gate 2: Template configured
    if (!campaign.template) {
      res.status(400).json({ error: 'Approval blocked: Email template has not been configured.' });
      return;
    }

    // Gate 5: Test email sent
    if (!campaign.testEmailSentAt) {
      res.status(400).json({
        error: 'Approval blocked: You must send and verify one test email before starting the campaign.',
      });
      return;
    }

    // Gate 6: Count eligible approved recipients
    const eligibleRecipients = await prisma.recipient.findMany({
      where: {
        campaignId,
        status: 'READY',
        isExcluded: false,
      },
    });

    const eligibleCount = eligibleRecipients.length;

    if (eligibleCount === 0) {
      res.status(400).json({
        error: 'Approval blocked: There are 0 approved and ready recipients in this campaign.',
      });
      return;
    }

    // Max 100 recipients limit enforcement
    if (eligibleCount > 100) {
      res.status(400).json({
        error: `Approval blocked: Campaign contains ${eligibleCount} recipients, exceeding the hard maximum of 100 authorized recipients per campaign. Please exclude rows until total is 100 or less.`,
      });
      return;
    }

    // Transition Campaign & Create Persistent SendJob
    const now = new Date();

    const [updatedCampaign, sendJob] = await prisma.$transaction([
      prisma.campaign.update({
        where: { id: campaignId },
        data: {
          status: 'SENDING',
          approvedAt: now,
          approvedCount: eligibleCount,
        },
      }),
      prisma.sendJob.upsert({
        where: { campaignId },
        create: {
          campaignId,
          status: 'QUEUED',
          totalRecipients: eligibleCount,
          sentCount: 0,
          failedCount: 0,
          skippedCount: 0,
          startedAt: now,
        },
        update: {
          status: 'QUEUED',
          totalRecipients: eligibleCount,
          sentCount: 0,
          failedCount: 0,
          skippedCount: 0,
          startedAt: now,
          pausedAt: null,
          completedAt: null,
          lastError: null,
        },
      }),
    ]);

    await logAuditEvent('CAMPAIGN_APPROVED_AND_QUEUED', {
      approvedCount: eligibleCount,
      confirmedBy: 'USER',
    }, campaignId, req.ip);

    res.json({
      success: true,
      message: 'Campaign approved and queued for persistent sending.',
      campaign: updatedCampaign,
      sendJob,
    });
  } catch (err) {
    next(err);
  }
});
