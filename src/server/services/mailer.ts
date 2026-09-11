import nodemailer, { Transporter } from 'nodemailer';
import path from 'path';
import fs from 'fs';
import { config, maskEmail } from '../config.js';

export type SmtpCategory =
  | 'SUCCESS'
  | 'AUTH_ERROR'
  | 'QUOTA_ERROR'
  | 'TEMP_FAILURE'
  | 'PERM_FAILURE';

export interface SendMailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
  senderName?: string;
  replyTo?: string;
}

export interface SendMailResult {
  success: boolean;
  messageId?: string;
  category: SmtpCategory;
  code?: number;
  message: string;
}

/**
 * Classifies an SMTP / Nodemailer error into a structured category
 */
export function classifySmtpError(err: unknown): { category: SmtpCategory; code?: number; message: string } {
  if (!err || typeof err !== 'object') {
    return {
      category: 'TEMP_FAILURE',
      message: 'Unknown mail transport error occurred.',
    };
  }

  const errObj = err as Record<string, unknown>;
  const code = typeof errObj.responseCode === 'number' ? errObj.responseCode : undefined;
  const rawMsg = String(errObj.message || errObj.response || 'SMTP Dispatch Failed');

  // Authentication failures (Invalid Google App Password or Bad Username)
  if (
    code === 535 ||
    rawMsg.includes('Invalid login') ||
    rawMsg.includes('Username and Password not accepted') ||
    rawMsg.includes('BadCredentials') ||
    rawMsg.includes('Please log in via your web browser')
  ) {
    return {
      category: 'AUTH_ERROR',
      code: 535,
      message: 'Gmail authentication failed. Please verify your Gmail address and 16-character Google App Password.',
    };
  }

  // Quota & Abuse limitations (Daily limit reached or burst throttle)
  if (
    code === 454 ||
    code === 552 ||
    rawMsg.includes('Daily user sending limit exceeded') ||
    rawMsg.includes('5.4.5') ||
    rawMsg.includes('Rate limit exceeded') ||
    rawMsg.includes('abuse') ||
    rawMsg.includes('quota')
  ) {
    return {
      category: 'QUOTA_ERROR',
      code: code ?? 454,
      message: 'Gmail sending quota or rate limit exceeded. Sending must be halted.',
    };
  }

  // Permanent recipient errors (Address does not exist, syntax error, mailbox disabled)
  if (
    code === 550 ||
    code === 551 ||
    code === 553 ||
    code === 554 ||
    rawMsg.includes('User unknown') ||
    rawMsg.includes('does not exist') ||
    rawMsg.includes('mailbox unavailable') ||
    rawMsg.includes('recipient rejected')
  ) {
    return {
      category: 'PERM_FAILURE',
      code: code ?? 550,
      message: `Permanent delivery rejection: ${rawMsg.substring(0, 120)}`,
    };
  }

  // Temporary failures (Network timeout, connection drop, 421/451)
  return {
    category: 'TEMP_FAILURE',
    code: code ?? 421,
    message: `Temporary transport issue: ${rawMsg.substring(0, 120)}`,
  };
}

let transporterInstance: Transporter | null = null;

export function resetTransporter(): void {
  transporterInstance = null;
}

/**
 * Creates or retrieves the configured Nodemailer transporter
 */
export function getTransporter(): Transporter {
  if (transporterInstance) {
    return transporterInstance;
  }

  // Check if live Gmail credentials are provided
  const hasLiveCredentials =
    Boolean(config.GMAIL_USER) &&
    Boolean(config.GMAIL_APP_PASSWORD) &&
    !config.GMAIL_APP_PASSWORD.startsWith('mock_');

  if (!hasLiveCredentials) {
    // In mock/development mode, create a JSON stream transporter or test transporter
    console.warn('⚠️ GMAIL_APP_PASSWORD not set or using mock credentials. Initializing mock mailer transport.');
    transporterInstance = nodemailer.createTransport({
      streamTransport: true,
      newline: 'windows',
      buffer: true,
    });
    return transporterInstance;
  }

  transporterInstance = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, // SSL
    auth: {
      user: config.GMAIL_USER,
      pass: config.GMAIL_APP_PASSWORD.replace(/\s+/g, ''), // Strip spaces from app password
    },
    // Conservative socket timeouts
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });

  return transporterInstance;
}

/**
 * Verifies SMTP connection without sending an email
 */
export async function verifySmtpConnection(): Promise<{ connected: boolean; category?: SmtpCategory; message: string }> {
  try {
    const transporter = getTransporter();
    // In mock mode, stream transporter doesn't verify network
    if (config.GMAIL_APP_PASSWORD.startsWith('mock_') || !config.GMAIL_USER) {
      return {
        connected: true,
        category: 'SUCCESS',
        message: 'Mock mailer initialized for local development and automated testing.',
      };
    }
    await transporter.verify();
    return {
      connected: true,
      category: 'SUCCESS',
      message: 'Successfully connected and authenticated with Gmail SMTP.',
    };
  } catch (err) {
    const errorInfo = classifySmtpError(err);
    console.error(`❌ SMTP verification failed [${errorInfo.category}]: ${errorInfo.message}`);
    return {
      connected: false,
      category: errorInfo.category,
      message: errorInfo.message,
    };
  }
}

export interface ProcessedHtmlResult {
  html: string;
  attachments: Array<{
    filename: string;
    path: string;
    cid: string;
  }>;
}

/**
 * Automatically scans HTML for local image references (/api/images/..., /images/..., or cid:...)
 * and converts them into inline MIME CID attachments for Nodemailer.
 * This guarantees images load reliably in Gmail, Outlook, Apple Mail, and mobile clients
 * without requiring external hosting or public URLs.
 */
export function processEmailImages(html: string): ProcessedHtmlResult {
  if (!html) return { html, attachments: [] };

  const attachments: Array<{ filename: string; path: string; cid: string }> = [];
  const addedCids = new Set<string>();

  const searchDirs = [
    path.resolve(process.cwd(), 'uploads/images'),
    path.resolve(process.cwd(), 'src/client/public/images'),
    path.resolve(process.cwd(), 'dist/client/images'),
  ];

  // Matches src="(/api/images/|/images/|cid:)?..." with optional localhost host
  const imgSrcRegex = /(<img\b[^>]*?\bsrc=["'])(https?:\/\/[^"'/]+)?(?:\/api\/images\/|\/images\/|cid:)?([^"'>\s?#]+)(["'][^>]*?>)/gi;

  const transformedHtml = html.replace(imgSrcRegex, (match, prefix, host, rawFilename, suffix) => {
    // If it's a public external host (not localhost or 127.0.0.1), leave it as an external image
    if (host && !host.includes('localhost') && !host.includes('127.0.0.1')) {
      return match;
    }

    const cleanName = path.basename(rawFilename);
    const candidateNames = [
      cleanName,
      `${cleanName}.png`,
      `${cleanName}.jpg`,
      `${cleanName}.jpeg`,
      `${cleanName}.gif`,
      `${cleanName}.webp`,
    ];

    let foundPath: string | null = null;
    let finalFilename = cleanName;

    for (const dir of searchDirs) {
      for (const candidate of candidateNames) {
        const fullPath = path.join(dir, candidate);
        if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
          foundPath = fullPath;
          finalFilename = candidate;
          break;
        }
      }
      if (foundPath) break;
    }

    if (!foundPath) {
      // Image file not found locally; preserve original
      return match;
    }

    // Clean CID identifier for email client compatibility
    const cid = finalFilename.replace(/[^a-zA-Z0-9_-]/g, '_');

    if (!addedCids.has(cid)) {
      addedCids.add(cid);
      attachments.push({
        filename: finalFilename,
        path: foundPath,
        cid,
      });
    }

    return `${prefix}cid:${cid}${suffix}`;
  });

  return { html: transformedHtml, attachments };
}

/**
 * Sends a single personalized email.
 * Recipient emails are masked in logs. Passwords and full contents are NEVER logged.
 * Automatically embeds local images as inline CID attachments so they render for recipients.
 */
export async function sendPersonalizedEmail(options: SendMailOptions): Promise<SendMailResult> {
  const maskedTo = maskEmail(options.to);
  const fromName = options.senderName?.trim() || config.DEFAULT_FROM_NAME;
  const fromAddress = config.GMAIL_USER || 'campaign@localhost';
  const fromHeader = `"${fromName}" <${fromAddress}>`;

  let finalHtml = options.html;
  let attachments: Array<{ filename: string; path: string; cid: string }> = [];

  if (options.html) {
    const processed = processEmailImages(options.html);
    finalHtml = processed.html;
    attachments = processed.attachments;
  }

  const mailOptions: nodemailer.SendMailOptions = {
    from: fromHeader,
    to: options.to,
    subject: options.subject,
    text: options.text,
    replyTo: options.replyTo || fromAddress,
  };

  if (finalHtml) {
    mailOptions.html = finalHtml;
  }

  if (attachments.length > 0) {
    mailOptions.attachments = attachments;
  }

  try {
    const transporter = getTransporter();
    const info = await transporter.sendMail(mailOptions);

    console.log(`✅ Mail dispatched successfully to ${maskedTo} [MessageId: ${info.messageId || 'MOCK-ID'}] (${attachments.length} inline images attached)`);
    return {
      success: true,
      messageId: info.messageId || `mock-${Date.now()}`,
      category: 'SUCCESS',
      message: 'Delivered to SMTP server successfully',
    };
  } catch (err) {
    const classified = classifySmtpError(err);
    console.error(`❌ Mail delivery error for recipient ${maskedTo} [${classified.category}]: ${classified.message}`);
    return {
      success: false,
      category: classified.category,
      code: classified.code,
      message: classified.message,
    };
  }
}
