import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { config, maskEmail, updateRuntimeCredentials, clearRuntimeCredentials } from '../config.js';
import { verifySmtpConnection, resetTransporter } from '../services/mailer.js';
import { logAuditEvent } from '../services/auditLogger.js';

export const settingsRouter = Router();

// Safely persist credentials to local .env
function persistToEnvFile(user: string, pass: string, fromName?: string): void {
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      let content = fs.readFileSync(envPath, 'utf-8');
      content = content.replace(/^GMAIL_USER=.*$/m, `GMAIL_USER=${user}`);
      content = content.replace(/^GMAIL_APP_PASSWORD=.*$/m, `GMAIL_APP_PASSWORD=${pass}`);
      if (fromName) {
        content = content.replace(/^DEFAULT_FROM_NAME=.*$/m, `DEFAULT_FROM_NAME=${fromName}`);
      }
      fs.writeFileSync(envPath, content, 'utf-8');
    }
  } catch (err) {
    console.error('Failed to update .env on disk:', err);
  }
}

// GET masked settings info
settingsRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const isMock = config.GMAIL_APP_PASSWORD.startsWith('mock_') || !config.GMAIL_USER;
    res.json({
      gmailUserMasked: maskEmail(config.GMAIL_USER),
      isAppPasswordConfigured: Boolean(config.GMAIL_APP_PASSWORD) && !config.GMAIL_APP_PASSWORD.startsWith('mock_'),
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

    // Persist to .env on disk
    persistToEnvFile(gmailUser, cleanPassword, defaultFromName);

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
    persistToEnvFile('', '');
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
