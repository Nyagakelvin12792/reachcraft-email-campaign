import sanitizeHtml from 'sanitize-html';
import { capitalizePersonName } from './nameFormatter.js';

export interface RecipientData {
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  phone?: string | null;
  jobTitle?: string | null;
  awb?: string | null;
  destination?: string | null;
  customFields?: Record<string, string> | null;
}

export interface RenderResult {
  renderedText: string;
  renderedHtml?: string;
  missingPlaceholders: string[];
}

/**
 * Escapes HTML characters in data values to prevent XSS / injection when rendered in HTML templates
 */
export function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Normalizes placeholder token strings to standard lookup keys
 * E.g. "First Name" -> "first name", "phone_number" -> "phone number"
 */
export function normalizeTokenKey(token: string): string {
  return token.trim().toLowerCase().replace(/[_-]/g, ' ');
}

/**
 * Auto-converts bracket placeholders like [Name], [First Name], <Name> to standard {{...}} tokens
 */
export function normalizePlaceholdersInText(text: string): string {
  if (!text) return '';
  return text
    .replace(/\[\s*(first\s*name|name|full\s*name|recipient(\s*name)?)\s*\]/gi, '{{first name}}')
    .replace(/<\s*(first\s*name|name|full\s*name|recipient(\s*name)?)\s*>/gi, '{{first name}}')
    .replace(/\[\s*(last\s*name|surname)\s*\]/gi, '{{last name}}')
    .replace(/\[\s*(company(\s*name)?|organization|business)\s*\]/gi, '{{company name}}')
    .replace(/\[\s*(job\s*title|role|position)\s*\]/gi, '{{job title}}')
    .replace(/\[\s*(phone(\s*number)?|mobile)\s*\]/gi, '{{phone number}}')
    .replace(/\[\s*(email(\s*address)?)\s*\]/gi, '{{email address}}');
}

/**
 * Extracts all placeholders found in text or HTML
 * Matches {{...}} tokens
 */
export function extractPlaceholders(text: string): string[] {
  if (!text) return [];
  const normalized = normalizePlaceholdersInText(text);
  const regex = /\{\{\s*([^}]+)\s*\}\}/g;
  const matches = new Set<string>();
  let match;
  while ((match = regex.exec(normalized)) !== null) {
    matches.add(match[1].trim());
  }
  return Array.from(matches);
}

/**
 * Resolves a token value for a given recipient
 */
export function resolveTokenValue(
  token: string,
  recipient: RecipientData
): string | undefined {
  const norm = normalizeTokenKey(token);

  // Standard token aliases
  if (norm === 'first name' || norm === 'firstname' || norm === 'first') {
    return capitalizePersonName(recipient.firstName) || undefined;
  }
  if (norm === 'name' || norm === 'full name' || norm === 'recipient' || norm === 'recipient name') {
    const firstName = capitalizePersonName(recipient.firstName);
    const lastName = capitalizePersonName(recipient.lastName);
    if (firstName && lastName) {
      return `${firstName} ${lastName}`;
    }
    return firstName || lastName || undefined;
  }
  if (norm === 'last name' || norm === 'lastname' || norm === 'last' || norm === 'surname') {
    return capitalizePersonName(recipient.lastName) || undefined;
  }
  if (norm === 'email address' || norm === 'email') {
    return recipient.email ?? undefined;
  }
  if (norm === 'phone number' || norm === 'phone' || norm === 'mobile' || norm === 'telephone') {
    return recipient.phone ?? undefined;
  }
  if (norm === 'job title' || norm === 'jobtitle' || norm === 'title' || norm === 'role' || norm === 'position' || norm === 'occupation') {
    return recipient.jobTitle ?? undefined;
  }
  if (norm === 'company name' || norm === 'company' || norm === 'organization' || norm === 'business') {
    return recipient.company ?? undefined;
  }
  if (norm === 'awb' || norm === 'air waybill' || norm === 'tracking' || norm === 'tracking number') {
    return recipient.awb ?? undefined;
  }
  if (norm === 'destination' || norm === 'dest' || norm === 'city') {
    return recipient.destination ?? undefined;
  }

  // Look in custom fields (check both exact key and normalized key)
  if (recipient.customFields) {
    for (const [key, val] of Object.entries(recipient.customFields)) {
      if (normalizeTokenKey(key) === norm) {
        return val;
      }
    }
  }

  return undefined;
}

/**
 * Allowed tags and attributes for HTML email templates
 */
const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'p', 'a', 'ul', 'ol',
    'nl', 'li', 'b', 'i', 'strong', 'em', 'strike', 'code', 'hr', 'br', 'div',
    'table', 'thead', 'caption', 'tbody', 'tr', 'th', 'td', 'pre', 'span', 'img'
  ],
  allowedAttributes: {
    a: ['href', 'name', 'target', 'rel', 'style'],
    img: ['src', 'alt', 'width', 'height', 'style'],
    div: ['style', 'class'],
    span: ['style', 'class'],
    p: ['style', 'class'],
    table: ['style', 'class', 'border', 'cellpadding', 'cellspacing', 'width'],
    td: ['style', 'class', 'colspan', 'rowspan', 'width', 'align', 'valign'],
    th: ['style', 'class', 'colspan', 'rowspan', 'width', 'align', 'valign'],
    tr: ['style', 'class'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'cid', 'data'],
};

/**
 * Sanitizes user-provided HTML template before rendering
 */
export function sanitizeTemplateHtml(rawHtml: string): string {
  if (!rawHtml) return '';
  return sanitizeHtml(rawHtml, SANITIZE_OPTIONS);
}

/**
 * Merges template text with recipient fields.
 * If isHtml is true, spreadsheet data is escaped and missing tokens are highlighted with red span tags.
 * For plain text, missing tokens are rendered as [MISSING: {{token}}].
 */
export function renderTemplateString(
  template: string,
  recipient: RecipientData,
  isHtml: boolean = false,
  highlightMissing: boolean = true
): { rendered: string; missing: string[] } {
  if (!template) {
    return { rendered: '', missing: [] };
  }

  const missing: string[] = [];
  const normalizedTemplate = normalizePlaceholdersInText(template);
  const regex = /\{\{\s*([^}]+)\s*\}\}/g;

  const rendered = normalizedTemplate.replace(regex, (_fullMatch, tokenRaw) => {
    const token = tokenRaw.trim();
    const val = resolveTokenValue(token, recipient);

    if (val !== undefined && val !== null && String(val).trim() !== '') {
      const strVal = String(val).trim();
      return isHtml ? escapeHtml(strVal) : strVal;
    }

    // Token value is missing or empty
    missing.push(token);

    if (highlightMissing) {
      if (isHtml) {
        return `<span style="background-color: #fee2e2; color: #b91c1c; padding: 2px 6px; border-radius: 4px; border: 1px solid #fca5a5; font-weight: bold; font-family: monospace; font-size: 0.85em;">[MISSING: {{${escapeHtml(token)}}}]</span>`;
      }
      return `[MISSING: {{${token}}}]`;
    }

    return '';
  });

  return { rendered, missing };
}

/**
 * Assembles complete message (subject, body, signature, opt-out footer)
 */
export function renderEmail(
  subjectTemplate: string,
  bodyTextTemplate: string,
  bodyHtmlTemplate: string | null | undefined,
  signature: string | null | undefined,
  optOutFooter: { enabled: boolean; text?: string } | undefined,
  recipient: RecipientData,
  highlightMissing: boolean = true
): {
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  missingPlaceholders: string[];
} {
  const allMissing = new Set<string>();

  // 1. Render Subject
  const renderedSubject = renderTemplateString(subjectTemplate, recipient, false, highlightMissing);
  renderedSubject.missing.forEach((m) => allMissing.add(m));

  // 2. Render Body Text
  let fullBodyText = bodyTextTemplate || '';
  if (signature) {
    fullBodyText += `\n\n${signature}`;
  }
  if (optOutFooter?.enabled && optOutFooter.text) {
    fullBodyText += `\n\n---\n${optOutFooter.text}`;
  }

  const renderedText = renderTemplateString(fullBodyText, recipient, false, highlightMissing);
  renderedText.missing.forEach((m) => allMissing.add(m));

  // 3. Render HTML if present
  let renderedHtml: string | undefined;
  if (bodyHtmlTemplate && bodyHtmlTemplate.trim() !== '') {
    const sanitizedBase = sanitizeTemplateHtml(bodyHtmlTemplate);
    let fullHtml = sanitizedBase;
    if (signature) {
      const sanitizedSig = sanitizeTemplateHtml(signature.replace(/\n/g, '<br/>'));
      fullHtml += `<div class="email-signature" style="margin-top: 24px; border-top: 1px solid #e5e7eb; padding-top: 12px;">${sanitizedSig}</div>`;
    }
    if (optOutFooter?.enabled && optOutFooter.text) {
      const sanitizedFooter = escapeHtml(optOutFooter.text);
      fullHtml += `<div class="opt-out-footer" style="margin-top: 32px; padding-top: 16px; border-top: 1px dashed #d1d5db; font-size: 11px; color: #6b7280;">${sanitizedFooter}</div>`;
    }

    const htmlResult = renderTemplateString(fullHtml, recipient, true, highlightMissing);
    renderedHtml = htmlResult.rendered;
    htmlResult.missing.forEach((m) => allMissing.add(m));
  }

  return {
    subject: renderedSubject.rendered,
    bodyText: renderedText.rendered,
    bodyHtml: renderedHtml,
    missingPlaceholders: Array.from(allMissing),
  };
}
