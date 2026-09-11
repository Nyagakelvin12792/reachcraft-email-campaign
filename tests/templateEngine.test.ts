import { describe, it, expect } from 'vitest';
import {
  renderEmail,
  escapeHtml,
  sanitizeTemplateHtml,
  extractPlaceholders,
} from '../src/server/services/templateEngine.js';

describe('Template Engine, Placeholder Interpolation & HTML Sanitization', () => {
  it('extracts all distinct placeholders from text', () => {
    const text = 'Hello {{first name}}, your tracking number is {{awb}} for {{company name}}. Details: {{awb}}';
    const tokens = extractPlaceholders(text);
    expect(tokens).toEqual(['first name', 'awb', 'company name']);
  });

  it('correctly replaces placeholders with recipient fields', () => {
    const recipient = {
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      company: 'Acme Freight',
      awb: 'AWB-100234',
      destination: 'ORD',
    };

    const result = renderEmail(
      'Notice for {{first name}} at {{company name}}',
      'Dear {{first name}} {{last name}},\n\nYour cargo {{awb}} has arrived in {{destination}}.',
      null,
      'Dispatch Team',
      { enabled: true, text: 'Opt out by replying.' },
      recipient,
      true
    );

    expect(result.subject).toBe('Notice for Jane at Acme Freight');
    expect(result.bodyText).toContain('Dear Jane Doe');
    expect(result.bodyText).toContain('Your cargo AWB-100234 has arrived in ORD.');
    expect(result.bodyText).toContain('Dispatch Team');
    expect(result.bodyText).toContain('Opt out by replying.');
    expect(result.missingPlaceholders.length).toBe(0);
  });

  it('highlights missing placeholder values and never silently inserts undefined or null', () => {
    const recipientWithMissing = {
      firstName: 'John',
      // lastName, company, awb are missing
    };

    const result = renderEmail(
      'Notice: {{awb}}',
      'Hello {{first name}} {{last name}}, your shipment for {{company name}} is ready.',
      '<p>Shipment: {{awb}} for {{company name}}</p>',
      null,
      undefined,
      recipientWithMissing,
      true
    );

    // Subject has missing {{awb}}
    expect(result.subject).toContain('[MISSING: {{awb}}]');
    expect(result.bodyText).toContain('[MISSING: {{last name}}]');
    expect(result.bodyText).toContain('[MISSING: {{company name}}]');

    // Never contains literal undefined or null
    expect(result.subject).not.toContain('undefined');
    expect(result.subject).not.toContain('null');
    expect(result.bodyText).not.toContain('undefined');
    expect(result.bodyText).not.toContain('null');

    // In HTML preview, missing values are wrapped in styled red highlight spans
    expect(result.bodyHtml).toContain('[MISSING: {{awb}}]');
    expect(result.bodyHtml).toContain('style="background-color: #fee2e2');

    expect(result.missingPlaceholders).toContain('awb');
    expect(result.missingPlaceholders).toContain('last name');
    expect(result.missingPlaceholders).toContain('company name');
  });

  it('escapes spreadsheet data to prevent XSS injection in HTML templates', () => {
    const maliciousRecipient = {
      firstName: '<script>alert("hacked")</script>',
      company: 'Test " & Company <img src=x onerror=alert(1)>',
    };

    const result = renderEmail(
      'Subject',
      'Plain text',
      '<p>Welcome {{first name}} from {{company name}}</p>',
      null,
      undefined,
      maliciousRecipient,
      false
    );

    // The script tag must be HTML-escaped
    expect(result.bodyHtml).not.toContain('<script>');
    expect(result.bodyHtml).toContain('&lt;script&gt;alert(&quot;hacked&quot;)&lt;/script&gt;');
    expect(result.bodyHtml).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('sanitizes unsafe HTML tags in the template markup itself', () => {
    const unsafeTemplate = '<div>Hello</div><script>dangerous()</script><iframe src="evil.com"></iframe>';
    const sanitized = sanitizeTemplateHtml(unsafeTemplate);

    expect(sanitized).toContain('<div>Hello</div>');
    expect(sanitized).not.toContain('<script>');
    expect(sanitized).not.toContain('<iframe>');
  });

  it('correctly interpolates {{job title}}, {{company name}}, and {{phone number}}', () => {
    const recipient = {
      firstName: 'Alfred',
      lastName: 'Odhuno Odhiambo',
      email: 'sewedhunnes@gmail.com',
      phone: '+254 701 928871',
      jobTitle: 'Senior Moderator for Aspire Leade',
      company: 'Aspire Institute',
    };

    const result = renderEmail(
      'Connecting with {{first name}} - {{company name}}',
      'Dear {{first name}} {{last name}},\n\nWe recognize your leadership as {{job title}} at {{company name}}. Reach us at {{phone number}}.\n\nBest regards,',
      null,
      null,
      undefined,
      recipient,
      true
    );

    expect(result.subject).toBe('Connecting with Alfred - Aspire Institute');
    expect(result.bodyText).toContain('Dear Alfred Odhuno Odhiambo');
    expect(result.bodyText).toContain('leadership as Senior Moderator for Aspire Leade at Aspire Institute');
    expect(result.bodyText).toContain('Reach us at +254 701 928871');
    expect(result.missingPlaceholders.length).toBe(0);
  });
});
