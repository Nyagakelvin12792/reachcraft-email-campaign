import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { config, maskEmail, updateRuntimeCredentials, clearRuntimeCredentials } from '../config.js';
import { verifySmtpConnection, resetTransporter } from '../services/mailer.js';
import { logAuditEvent } from '../services/auditLogger.js';
import {
  deleteSmtpCredentials,
  loadSmtpCredentials,
  saveSmtpCredentials,
} from '../services/smtpCredentials.js';

export const settingsRouter = Router();

// GET masked settings info
settingsRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    await loadSmtpCredentials();
    const isMock =
      !config.GMAIL_USER ||
      !config.GMAIL_APP_PASSWORD ||
      config.GMAIL_APP_PASSWORD.startsWith('mock_');
    res.json({
      gmailUserMasked: maskEmail(config.GMAIL_USER),
      isAppPasswordConfigured:
        Boolean(config.GMAIL_USER) &&
        Boolean(config.GMAIL_APP_PASSWORD) &&
        !config.GMAIL_APP_PASSWORD.startsWith('mock_'),
      isMockMode: isMock,
      defaultFromName: config.DEFAULT_FROM_NAME,
      sendDelayMs: config.SEND_DELAY_MS,
      maxRetries: config.MAX_RETRIES,
      maxRecipients: config.MAX_RECIPIENTS,
      environment: config.NODE_ENV,
    });
  } catch (err) {
    next(err);
  }
});

// POST save/paste credentials directly from the web interface
const saveCredentialsSchema = z.object({
  gmailUser: z.string().email('Please enter a valid Gmail address'),
  gmailAppPassword: z.string().min(8, 'App password must be at least 8 characters'),
  defaultFromName: z.string().optional(),
});

settingsRouter.post('/credentials', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { gmailUser, gmailAppPassword, defaultFromName } = saveCredentialsSchema.parse(req.body);

    // Clean app password (strip spaces)
    const cleanPassword = gmailAppPassword.replace(/\s+/g, '');

    // Update in-memory runtime configuration
    updateRuntimeCredentials(gmailUser, cleanPassword, defaultFromName);

    // Persist encrypted credentials for local and serverless requests.
    await saveSmtpCredentials(gmailUser.trim(), cleanPassword, defaultFromName);

    // Reset mailer transporter so it reconnects with new credentials
    resetTransporter();

    // Verify connection immediately
    const verifyResult = await verifySmtpConnection();

    await logAuditEvent('CREDENTIALS_UPDATED_VIA_UI', {
      user: maskEmail(gmailUser),
      verified: verifyResult.connected,
    }, undefined, req.ip);

    res.json({
      success: true,
      connected: verifyResult.connected,
      message: verifyResult.message,
      gmailUserMasked: maskEmail(gmailUser),
      isAppPasswordConfigured: true,
      isMockMode: false,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE remove/clear credentials
settingsRouter.delete('/credentials', async (req: Request, res: Response, next: NextFunction) => {
  try {
    clearRuntimeCredentials();
    await deleteSmtpCredentials();
    resetTransporter();

    await logAuditEvent('CREDENTIALS_REMOVED_VIA_UI', {}, undefined, req.ip);

    res.json({
      success: true,
      message: 'Credentials removed successfully. App is now in mock mode.',
      isAppPasswordConfigured: false,
      isMockMode: true,
      gmailUserMasked: 'N/A',
    });
  } catch (err) {
    next(err);
  }
});

// POST test SMTP connection
settingsRouter.post('/verify-smtp', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await verifySmtpConnection();
    res.json(result);
  } catch (err) {
    next(err);
  }
});
