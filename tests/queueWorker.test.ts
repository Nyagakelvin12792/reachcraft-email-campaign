import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../src/server/services/db.js';
import { queueWorker } from '../src/worker/queueWorker.js';

describe('Persistent Queue Worker, Idempotency & Recovery', () => {
  let campaignId: string;
  let suppressedEmail = 'suppressed.user@example.com';

  beforeAll(async () => {
    // Add to suppression list
    await prisma.suppressionList.upsert({
      where: { email: suppressedEmail },
      create: { email: suppressedEmail, reason: 'Test opt-out' },
      update: {},
    });

    // Create campaign with 1 normal recipient and 1 suppressed recipient
    const campaign = await prisma.campaign.create({
      data: {
        name: 'Worker Test Campaign',
        status: 'SENDING',
        sendDelayMs: 100, // Fast delay for test
        approvedCount: 2,
        template: {
          create: {
            subject: 'Worker Test',
            bodyText: 'Hello {{first name}}',
          },
        },
        sendJob: {
          create: {
            status: 'QUEUED',
            totalRecipients: 2,
          },
        },
        recipients: {
          create: [
            {
              rowNumber: 2,
              email: 'allowed.user@example.com',
              firstName: 'Allowed',
              status: 'READY',
            },
            {
              rowNumber: 3,
              email: suppressedEmail,
              firstName: 'Suppressed',
              status: 'READY',
            },
          ],
        },
      },
    });

    campaignId = campaign.id;
  });

  afterAll(async () => {
    if (campaignId) {
      await prisma.campaign.delete({ where: { id: campaignId } }).catch(() => {});
    }
    await prisma.suppressionList.delete({ where: { email: suppressedEmail } }).catch(() => {});
  });

  it('processes the first eligible recipient and respects idempotency', async () => {
    // Process step 1 (allowed.user)
    const processed1 = await queueWorker.processNextBatch(campaignId);
    expect(processed1).toBe(true);

    const allowedRecipient = await prisma.recipient.findFirst({
      where: { campaignId, email: 'allowed.user@example.com' },
    });

    expect(allowedRecipient?.sentAt).not.toBeNull();

    // Verify SendAttempt recorded
    const attempts = await prisma.sendAttempt.findMany({
      where: { recipientId: allowedRecipient?.id },
    });
    expect(attempts.length).toBeGreaterThanOrEqual(1);
    expect(attempts[0].status).toBe('SENT');
  });

  it('enforces suppression list and skips suppressed recipients', async () => {
    // Process step 2 (suppressed.user)
    const processed2 = await queueWorker.processNextBatch(campaignId);
    expect(processed2).toBe(true);

    const suppressedRecipient = await prisma.recipient.findFirst({
      where: { campaignId, email: suppressedEmail },
    });

    expect(suppressedRecipient?.status).toBe('SUPPRESSED');
    expect(suppressedRecipient?.sentAt).toBeNull(); // Never sent!

    // Verify skipped attempt recorded
    const attempts = await prisma.sendAttempt.findMany({
      where: { recipientId: suppressedRecipient?.id },
    });
    expect(attempts.length).toBe(1);
    expect(attempts[0].status).toBe('SKIPPED');
  });

  it('marks campaign completed when all recipients have been processed', async () => {
    // Process step 3 (queue is empty)
    await queueWorker.processNextBatch(campaignId);

    const job = await prisma.sendJob.findUnique({ where: { campaignId } });
    const camp = await prisma.campaign.findUnique({ where: { id: campaignId } });

    expect(job?.status).toBe('COMPLETED');
    expect(camp?.status).toBe('COMPLETED');
  });

  it('recovers stalled jobs on restart', async () => {
    // Simulate a job left in RUNNING state due to a crash
    await prisma.sendJob.update({
      where: { campaignId },
      data: { status: 'RUNNING' },
    });

    await queueWorker.recoverStalledJobs();

    const recovered = await prisma.sendJob.findUnique({ where: { campaignId } });
    expect(recovered?.status).toBe('QUEUED');
  });

  it('respects pause and resume state transitions', async () => {
    // Create new campaign to test pause/resume
    const pausedCamp = await prisma.campaign.create({
      data: {
        name: 'Pause Test Campaign',
        status: 'PAUSED',
        sendDelayMs: 50,
        template: {
          create: {
            subject: 'Pause Test',
            bodyText: 'Hello {{first name}}',
          },
        },
        sendJob: {
          create: {
            status: 'PAUSED',
            totalRecipients: 1,
          },
        },
        recipients: {
          create: {
            rowNumber: 2,
            email: 'pause.recipient@test.com',
            firstName: 'Pausable',
            status: 'READY',
          },
        },
      },
    });

    // Worker should skip because campaign is PAUSED
    const processedWhilePaused = await queueWorker.processNextBatch(pausedCamp.id);
    expect(processedWhilePaused).toBe(false);

    const unsent = await prisma.recipient.findFirst({
      where: { campaignId: pausedCamp.id },
    });
    expect(unsent?.sentAt).toBeNull();

    // Now resume
    await prisma.campaign.update({
      where: { id: pausedCamp.id },
      data: { status: 'SENDING' },
    });
    await prisma.sendJob.update({
      where: { campaignId: pausedCamp.id },
      data: { status: 'QUEUED' },
    });

    // Worker should now process the recipient
    const processedAfterResume = await queueWorker.processNextBatch(pausedCamp.id);
    expect(processedAfterResume).toBe(true);

    const nowSent = await prisma.recipient.findFirst({
      where: { campaignId: pausedCamp.id },
    });
    expect(nowSent?.sentAt).not.toBeNull();

    // Cleanup
    await prisma.campaign.delete({ where: { id: pausedCamp.id } });
  });
});
