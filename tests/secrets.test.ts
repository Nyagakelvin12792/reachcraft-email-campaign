import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/server/app.js';
import { maskEmail } from '../src/server/config.js';

describe('Secret Protection & Credential Hygiene', () => {
  it('masks recipient email addresses properly', () => {
    expect(maskEmail('johndoe@example.com')).toBe('j***e@example.com');
    expect(maskEmail('a@b.com')).toBe('a***@b.com');
    expect(maskEmail('customer.service@sub.domain.org')).toBe('c***e@sub.domain.org');
    expect(maskEmail(null)).toBe('N/A');
  });

  it('never returns the raw GMAIL_APP_PASSWORD in settings endpoint', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.status).toBe(200);

    // Ensure raw password is NOT present anywhere in the response body
    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toContain('mock_app_password');
    expect(res.body.GMAIL_APP_PASSWORD).toBeUndefined();
    expect(res.body.isAppPasswordConfigured).toBeDefined();
  });
});
