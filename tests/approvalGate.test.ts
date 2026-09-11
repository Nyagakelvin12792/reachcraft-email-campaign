import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/server/app.js';
import { prisma } from '../src/server/services/db.js';

describe('Approval Requirements & Safety Gating', () => {
  let campaignId: string;

  beforeAll(async () => {
    // Create test campaign
    const campaign = await prisma.campaign.create({
      data: {
        name: 'Gating Verification Campaign',
        status: 'DRAFT',
      },
    });
    campaignId = campaign.id;

    // Create 3 valid recipients
    await prisma.recipient.createMany({
      data: [
        { campaignId, rowNumber: 2, email: 'rec1@test.com', firstName: 'User1', status: 'READY' },
        { campaignId, rowNumber: 3, email: 'rec2@test.com', firstName: 'User2', status: 'READY' },
        { campaignId, rowNumber: 4, email: 'rec3@test.com', firstName: 'User3', status: 'READY' },
      ],
    });
  });

  afterAll(async () => {
    if (campaignId) {
      await prisma.campaign.delete({ where: { id: campaignId } }).catch(() => {});
    }
  });

  it('blocks approval if template has not been configured', async () => {
    const res = await request(app)
      .post(`/api/campaigns/${campaignId}/approve-and-start`)
      .send({ confirmationText: 'SEND' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('template has not been configured');
  });

  it('blocks approval if test email has not been dispatched', async () => {
    // Save template
    await request(app)
      .put(`/api/campaigns/${campaignId}/template`)
      .send({
        subject: 'Verified Subject',
        bodyText: 'Hello {{first name}}',
      });

    // Attempt start without test email
    const res = await request(app)
      .post(`/api/campaigns/${campaignId}/approve-and-start`)
      .send({ confirmationText: 'SEND' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('You must send and verify one test email');
  });

  it('requires user to type exactly "SEND" to authorize launch', async () => {
    // Send test email
    await request(app)
      .post(`/api/campaigns/${campaignId}/test-email`)
      .send({ testEmail: 'qa-tester@example.com' });

    // Attempt start with wrong confirmation phrase
    const res1 = await request(app)
      .post(`/api/campaigns/${campaignId}/approve-and-start`)
      .send({ confirmationText: 'send' }); // lowercase

    expect(res1.status).toBe(400);
    expect(res1.body.error).toContain("must type exactly 'SEND'");

    const res2 = await request(app)
      .post(`/api/campaigns/${campaignId}/approve-and-start`)
      .send({ confirmationText: 'YES' });

    expect(res2.status).toBe(400);
  });

  it('successfully authorizes campaign when all gates pass', async () => {
    const res = await request(app)
      .post(`/api/campaigns/${campaignId}/approve-and-start`)
      .send({ confirmationText: 'SEND' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.campaign.status).toBe('SENDING');
    expect(res.body.sendJob.status).toBe('QUEUED');
    expect(res.body.sendJob.totalRecipients).toBe(3);
  });
});
