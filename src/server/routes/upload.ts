import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { uploadMiddleware } from '../middleware/upload.js';
import { parseSpreadsheetFile } from '../services/spreadsheet.js';
import { validateSpreadsheetRows, ColumnMappingConfig, DeduplicationOptions } from '../services/validator.js';
import { prisma } from '../services/db.js';
import { logAuditEvent } from '../services/auditLogger.js';

export const uploadRouter = Router({ mergeParams: true });

// In-memory cache for parsed upload buffers per campaign before mapping is finalized
const uploadCache = new Map<string, {
  filePath: string;
  originalFileName: string;
  columns: string[];
  suggestedMapping: Record<string, string>;
  rows: Array<Record<string, string>>;
}>();

// POST paste spreadsheet data directly (CSV / tab-separated from Excel or Google Sheets)
uploadRouter.post('/paste', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: campaignId } = req.params;
    const { rawText, fileName } = req.body;
    if (!rawText || typeof rawText !== 'string' || !rawText.trim()) {
      res.status(400).json({ error: 'No spreadsheet text provided.' });
      return;
    }

    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    const uploadsDir = path.resolve(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    const tempFileName = `pasted_${Date.now()}.csv`;
    const tempFilePath = path.join(uploadsDir, tempFileName);
    fs.writeFileSync(tempFilePath, rawText.trim(), 'utf-8');

    const displayName = (fileName && typeof fileName === 'string' && fileName.trim()) ? fileName.trim() : 'Pasted Spreadsheet Data';
    const parsed = parseSpreadsheetFile(tempFilePath, displayName);

    uploadCache.set(campaignId, {
      filePath: tempFilePath,
      originalFileName: displayName,
      columns: parsed.columns,
      suggestedMapping: parsed.suggestedMapping,
      rows: parsed.rows,
    });

    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        originalFileName: displayName,
        totalUploaded: parsed.rows.length,
      },
    });

    await logAuditEvent('SPREADSHEET_UPLOADED', {
      fileName: displayName,
      rowCount: parsed.rows.length,
      columnCount: parsed.columns.length,
      method: 'PASTE',
    }, campaignId, req.ip);

    res.json({
      fileName: displayName,
      columns: parsed.columns,
      suggestedMapping: parsed.suggestedMapping,
      totalRows: parsed.rows.length,
      sampleRows: parsed.rows.slice(0, 3),
    });
  } catch (err) {
    next(err);
  }
});

// POST upload spreadsheet file
uploadRouter.post('/upload', uploadMiddleware.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: campaignId } = req.params;
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded or file rejected by security filters.' });
      return;
    }

    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) {
      // Remove temporary file
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    // Parse spreadsheet safely with SheetJS
    const parsed = parseSpreadsheetFile(req.file.path, req.file.originalname);

    // Save in cache for subsequent mapping step
    uploadCache.set(campaignId, {
      filePath: req.file.path,
      originalFileName: req.file.originalname,
      columns: parsed.columns,
      suggestedMapping: parsed.suggestedMapping,
      rows: parsed.rows,
    });

    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        originalFileName: req.file.originalname,
        totalUploaded: parsed.rows.length,
      },
    });

    await logAuditEvent('SPREADSHEET_UPLOADED', {
      fileName: req.file.originalname,
      rowCount: parsed.rows.length,
      columnCount: parsed.columns.length,
    }, campaignId, req.ip);

    res.json({
      fileName: req.file.originalname,
      columns: parsed.columns,
      suggestedMapping: parsed.suggestedMapping,
      totalRows: parsed.rows.length,
      sampleRows: parsed.rows.slice(0, 3), // Safe preview snippet
    });
  } catch (err) {
    // Cleanup file on error
    if (req.file && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }
    }
    next(err);
  }
});

// GET uploaded spreadsheet info & suggested mapping for campaign
uploadRouter.get('/upload', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: campaignId } = req.params;
    const cached = uploadCache.get(campaignId);
    if (!cached) {
      res.status(404).json({ error: 'No cached spreadsheet upload found for this campaign.' });
      return;
    }

    res.json({
      fileName: cached.originalFileName,
      columns: cached.columns,
      suggestedMapping: cached.suggestedMapping || {},
      totalRows: cached.rows.length,
      sampleRows: cached.rows.slice(0, 3),
    });
  } catch (err) {
    next(err);
  }
});

// POST apply column mapping & validate rows
const mappingSchema = z.object({
  mapping: z.object({
    email: z.string().min(1, 'Email column is required'),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    company: z.string().optional(),
    phone: z.string().optional(),
    jobTitle: z.string().optional(),
    awb: z.string().optional(),
    destination: z.string().optional(),
    requiredFields: z.array(z.string()).optional(),
  }),
  dedupeOptions: z.object({
    strategy: z.enum(['remove_all_duplicates', 'keep_first', 'allow_all']).default('keep_first'),
  }).default({ strategy: 'keep_first' }),
});

uploadRouter.post('/map', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: campaignId } = req.params;
    const cached = uploadCache.get(campaignId);

    if (!cached) {
      res.status(400).json({ error: 'No uploaded spreadsheet found for this campaign. Please upload a file first.' });
      return;
    }

    const { mapping, dedupeOptions } = mappingSchema.parse(req.body);

    // Fetch suppression list to auto-flag suppressed recipients
    const suppressions = await prisma.suppressionList.findMany({ select: { email: true } });
    const suppressedSet = new Set(suppressions.map((s) => s.email.toLowerCase()));

    // Run row validation engine
    const summary = validateSpreadsheetRows(
      cached.rows,
      mapping as ColumnMappingConfig,
      dedupeOptions as DeduplicationOptions,
      suppressedSet
    );

    // Wipe previous recipients if any for this campaign
    await prisma.recipient.deleteMany({ where: { campaignId } });

    // Store validated recipients in database
    await prisma.$transaction(
      summary.rows.map((row) =>
        prisma.recipient.create({
          data: {
            campaignId,
            rowNumber: row.rowNumber,
            email: row.email || null,
            firstName: row.firstName || null,
            lastName: row.lastName || null,
            company: row.company || null,
            phone: row.phone || null,
            jobTitle: row.jobTitle || null,
            awb: row.awb || null,
            destination: row.destination || null,
            customFields: Object.keys(row.customFields).length > 0 ? JSON.stringify(row.customFields) : null,
            status: row.status,
            rejectReason: row.rejectReason || null,
            isExcluded: row.isExcluded,
          },
        })
      )
    );

    // Update campaign metrics
    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: 'MAPPED',
        readyCount: summary.readyCount,
        rejectedCount: summary.rejectedCount,
        totalUploaded: summary.totalRows,
      },
    });

    await logAuditEvent('MAPPING_APPLIED', {
      readyCount: summary.readyCount,
      rejectedCount: summary.rejectedCount,
      duplicateCount: summary.duplicateCount,
    }, campaignId, req.ip);

    res.json({
      success: true,
      summary: {
        totalRows: summary.totalRows,
        readyCount: summary.readyCount,
        rejectedCount: summary.rejectedCount,
        duplicateCount: summary.duplicateCount,
        missingEmailCount: summary.missingEmailCount,
        invalidEmailCount: summary.invalidEmailCount,
        missingRequiredCount: summary.missingRequiredCount,
        exceedsMaxRecipients: summary.readyCount > 100,
      },
    });
  } catch (err) {
    next(err);
  }
});
