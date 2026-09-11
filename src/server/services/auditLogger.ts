import { prisma } from './db.js';

export async function logAuditEvent(
  action: string,
  details: Record<string, unknown>,
  campaignId?: string,
  ipAddress?: string
): Promise<void> {
  try {
    // Mask any email addresses in details if present
    const cleanDetails = { ...details };
    if (typeof cleanDetails.email === 'string') {
      const parts = cleanDetails.email.split('@');
      if (parts.length === 2) {
        cleanDetails.email = `${parts[0][0]}***@${parts[1]}`;
      }
    }

    await prisma.auditEvent.create({
      data: {
        action,
        campaignId,
        ipAddress,
        details: JSON.stringify(cleanDetails),
      },
    });
  } catch (err) {
    console.error('Failed to record audit event:', err);
  }
}
