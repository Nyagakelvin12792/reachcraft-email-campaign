import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../services/db.js';
import { renderEmail, extractPlaceholders } from '../services/templateEngine.js';
import { logAuditEvent } from '../services/auditLogger.js';
import { imageUploadMiddleware } from '../middleware/upload.js';

export const templatesRouter = Router({ mergeParams: true });

const templateSchema = z.object({
  senderName: z.string().optional().nullable().default(''),
  replyTo: z.string().optional().nullable().default(''),
  subject: z.string().min(1, 'Subject is required'),
  bodyText: z.string().min(1, 'Plain-text message is required'),
  bodyHtml: z.string().optional().nullable().default(''),
  signature: z.string().optional().nullable().default(''),
});

// GET template for campaign
templatesRouter.get('/template', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: campaignId } = req.params;
    const template = await prisma.template.findUnique({
      where: { campaignId },
    });

    res.json({ template });
  } catch (err) {
    next(err);
  }
});

// POST upload image for email template (banners, logos, flyers)
templatesRouter.post('/upload-image', imageUploadMiddleware.single('image'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No image file uploaded.' });
      return;
    }

    const imageUrl = `/api/images/${req.file.filename}`;
    res.json({
      url: imageUrl,
      fileName: req.file.originalname,
      size: req.file.size,
    });
  } catch (err) {
    next(err);
  }
});

// PUT save/update template
templatesRouter.put('/template', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: campaignId } = req.params;
    const parsed = templateSchema.parse(req.body);

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { id: true },
    });
    if (!campaign) {
      res.status(404).json({
        error: 'Campaign not found. Return to the dashboard and create or reopen a draft.',
      });
      return;
    }

    const template = await prisma.$transaction(async (tx) => {
      const savedTemplate = await tx.template.upsert({
        where: { campaignId },
        create: {
          campaignId,
          senderName: parsed.senderName || null,
          replyTo: parsed.replyTo || null,
          subject: parsed.subject,
          bodyText: parsed.bodyText,
          bodyHtml: parsed.bodyHtml || null,
          signature: parsed.signature || null,
        },
        update: {
          senderName: parsed.senderName || null,
          replyTo: parsed.replyTo || null,
          subject: parsed.subject,
          bodyText: parsed.bodyText,
          bodyHtml: parsed.bodyHtml || null,
          signature: parsed.signature || null,
        },
      });

      await tx.campaign.update({
        where: { id: campaignId },
        data: { status: 'CONFIGURED' },
      });

      return savedTemplate;
    });

    await logAuditEvent('TEMPLATE_SAVED', { subject: template.subject }, campaignId, req.ip);

    res.json({ template });
  } catch (err) {
    next(err);
  }
});

// POST generate personalized previews for all recipients
templatesRouter.post('/preview', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: campaignId } = req.params;
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: { template: true },
    });

    if (!campaign || !campaign.template) {
      res.status(400).json({ error: 'Campaign or template not found. Configure a template first.' });
      return;
    }

    const recipients = await prisma.recipient.findMany({
      where: { campaignId },
      orderBy: { rowNumber: 'asc' },
    });

    const template = campaign.template;
    const optOutFooter = {
      enabled: campaign.optOutEnabled,
      text: campaign.optOutText,
    };

    // Render for every recipient and update preview fields in DB
    const previewList = [];

    for (const r of recipients) {
      let customFields: Record<string, string> = {};
      if (r.customFields) {
        try {
          customFields = JSON.parse(r.customFields);
        } catch { /* ignore */ }
      }

      const rendered = renderEmail(
        template.subject,
        template.bodyText,
        template.bodyHtml,
        template.signature,
        optOutFooter,
        {
          email: r.email,
          firstName: r.firstName,
          lastName: r.lastName,
          company: r.company,
          phone: r.phone,
          jobTitle: r.jobTitle,
          awb: r.awb,
          destination: r.destination,
          customFields,
        },
        true // Highlight missing values
      );

      // Save preview into DB
      await prisma.recipient.update({
        where: { id: r.id },
        data: {
          previewSubject: rendered.subject,
          previewBodyText: rendered.bodyText,
          previewBodyHtml: rendered.bodyHtml || null,
          missingPlaceholders: rendered.missingPlaceholders.length > 0 ? JSON.stringify(rendered.missingPlaceholders) : null,
        },
      });

      previewList.push({
        id: r.id,
        rowNumber: r.rowNumber,
        email: r.email,
        firstName: r.firstName,
        lastName: r.lastName,
        company: r.company,
        status: r.status,
        isExcluded: r.isExcluded,
        previewSubject: rendered.subject,
        previewBodyText: rendered.bodyText,
        previewBodyHtml: rendered.bodyHtml,
        missingPlaceholders: rendered.missingPlaceholders,
      });
    }

    // Extract all distinct placeholders used in template
    const placeholdersUsed = [
      ...extractPlaceholders(template.subject),
      ...extractPlaceholders(template.bodyText),
      ...(template.bodyHtml ? extractPlaceholders(template.bodyHtml) : []),
    ];

    res.json({
      success: true,
      totalPreviews: previewList.length,
      placeholdersUsed: Array.from(new Set(placeholdersUsed)),
      previews: previewList,
    });
  } catch (err) {
    next(err);
  }
});
