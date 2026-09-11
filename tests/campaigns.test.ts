import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/server/app.js';
import { prisma } from '../src/server/services/db.js';

describe('Campaign draft updates', () => {
  let campaignId: string;

  beforeAll(async () => {
    const campaign = await prisma.campaign.create({
      data: {
        name: 'Draft to resume',
        status: 'DRAFT',
        sendDelayMs: 2000,
      },
    });
    campaignId = campaign.id;
  });

  afterAll(async () => {
    if (campaignId) {
      await prisma.campaign.delete({ where: { id: campaignId } }).catch(() => {});
    }
  });

  it('updates editable draft setup fields without creating another campaign', async () => {
    const beforeCount = await prisma.campaign.count();
    const response = await request(app)
      .patch(`/api/campaigns/${campaignId}`)
      .send({ name: 'Resumed outreach', sendDelayMs: 3000 });

    expect(response.status).toBe(200);
    expect(response.body.campaign.id).toBe(campaignId);
    expect(response.body.campaign.name).toBe('Resumed outreach');
    expect(response.body.campaign.sendDelayMs).toBe(3000);
    expect(await prisma.campaign.count()).toBe(beforeCount);
  });

  it('rejects invalid sending delays', async () => {
    const response = await request(app)
      .patch(`/api/campaigns/${campaignId}`)
      .send({ sendDelayMs: 100 });

    expect(response.status).toBe(400);
  });

  it('returns 404 for a missing campaign', async () => {
    const response = await request(app)
      .patch('/api/campaigns/missing-campaign')
      .send({ name: 'Missing' });

    expect(response.status).toBe(404);
  });
});
