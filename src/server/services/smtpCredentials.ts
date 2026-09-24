import crypto from 'node:crypto';
import { config, updateRuntimeCredentials } from '../config.js';
import { prisma } from './db.js';

const CREDENTIAL_ID = 'default';

function encryptionKey(): Buffer {
  return crypto.createHash('sha256').update(config.APP_ENCRYPTION_KEY).digest();
}

function encrypt(value: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString('base64')).join(':');
}

function decrypt(value: string): string {
  const [ivValue, tagValue, encryptedValue] = value.split(':');
  if (!ivValue || !tagValue || !encryptedValue) {
    throw new Error('Stored SMTP credentials are invalid.');
  }

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    encryptionKey(),
    Buffer.from(ivValue, 'base64')
  );
  decipher.setAuthTag(Buffer.from(tagValue, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

export async function saveSmtpCredentials(
  gmailUser: string,
  appPassword: string,
  defaultFromName?: string
): Promise<void> {
  await prisma.smtpCredential.upsert({
    where: { id: CREDENTIAL_ID },
    create: {
      id: CREDENTIAL_ID,
      gmailUserEncrypted: encrypt(gmailUser),
      appPasswordEncrypted: encrypt(appPassword),
      defaultFromName: defaultFromName?.trim() || null,
    },
    update: {
      gmailUserEncrypted: encrypt(gmailUser),
      appPasswordEncrypted: encrypt(appPassword),
      defaultFromName: defaultFromName?.trim() || null,
    },
  });
}

export async function loadSmtpCredentials(): Promise<boolean> {
  const stored = await prisma.smtpCredential.findUnique({ where: { id: CREDENTIAL_ID } });
  if (!stored) return false;

  updateRuntimeCredentials(
    decrypt(stored.gmailUserEncrypted),
    decrypt(stored.appPasswordEncrypted),
    stored.defaultFromName || undefined
  );
  return true;
}

export async function deleteSmtpCredentials(): Promise<void> {
  await prisma.smtpCredential.deleteMany({ where: { id: CREDENTIAL_ID } });
}
