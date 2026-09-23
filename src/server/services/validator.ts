import { z } from 'zod';
import { capitalizePersonName } from './nameFormatter.js';

export type RecipientStatus =
  | 'READY'
  | 'MISSING_EMAIL'
  | 'INVALID_EMAIL'
  | 'DUPLICATE'
  | 'MISSING_REQUIRED'
  | 'EXCLUDED'
  | 'SUPPRESSED';

export interface ColumnMappingConfig {
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  phone?: string;
  jobTitle?: string;
  awb?: string;
  destination?: string;
  requiredFields?: string[]; // Column names that must not be empty
}

export interface DeduplicationOptions {
  strategy: 'remove_all_duplicates' | 'keep_first' | 'allow_all';
}

export interface ValidatedRow {
  rowNumber: number; // 1-based (row 2 in spreadsheet is rowNumber 2)
  email: string;
  firstName: string;
  lastName: string;
  company: string;
  phone: string;
  jobTitle: string;
  awb: string;
  destination: string;
  customFields: Record<string, string>;
  status: RecipientStatus;
  rejectReason?: string;
  isExcluded: boolean;
}

export interface ValidationSummary {
  totalRows: number;
  readyCount: number;
  rejectedCount: number;
  duplicateCount: number;
  missingEmailCount: number;
  invalidEmailCount: number;
  missingRequiredCount: number;
  exceedsMaxRecipients: boolean;
  rows: ValidatedRow[];
}

// RFC 5322 compliant regex for safe email checking
const emailSchema = z.string().email();

/**
 * Validates an email string strictly. Never tries to fix or invent email parts.
 */
export function validateEmail(email: string): { valid: boolean; reason?: string } {
  const trimmed = email.trim();
  if (!trimmed) {
    return { valid: false, reason: 'Email address is empty or missing.' };
  }
  if (trimmed.includes(' ') || trimmed.includes('\t') || trimmed.includes('\n')) {
    return { valid: false, reason: 'Email contains invalid whitespace characters.' };
  }
  const parseResult = emailSchema.safeParse(trimmed);
  if (!parseResult.success) {
    return { valid: false, reason: 'Malformed email format (does not match RFC standards).' };
  }
  const parts = trimmed.split('@');
  if (parts.length !== 2 || !parts[1].includes('.')) {
    return { valid: false, reason: 'Email domain must contain a valid top-level domain.' };
  }
  return { valid: true };
}

/**
 * Validates all spreadsheet rows against column mapping and deduplication strategy.
 */
export function validateSpreadsheetRows(
  rawRows: Array<Record<string, string>>,
  mapping: ColumnMappingConfig,
  dedupeOptions: DeduplicationOptions = { strategy: 'keep_first' },
  suppressedEmails: Set<string> = new Set()
): ValidationSummary {
  const emailCol = mapping.email;
  if (!emailCol) {
    throw new Error('Email column mapping is required for validation.');
  }

  const emailOccurrences = new Map<string, number[]>(); // normalized email -> list of row indices

  // Step 1: Pre-pass to detect duplicates
  rawRows.forEach((row, index) => {
    const rawEmail = (row[emailCol] || '').trim().toLowerCase();
    if (rawEmail) {
      const existing = emailOccurrences.get(rawEmail) || [];
      existing.push(index);
      emailOccurrences.set(rawEmail, existing);
    }
  });

  const validatedRows: ValidatedRow[] = [];
  let readyCount = 0;
  let rejectedCount = 0;
  let duplicateCount = 0;
  let missingEmailCount = 0;
  let invalidEmailCount = 0;
  let missingRequiredCount = 0;

  rawRows.forEach((row, idx) => {
    const rowNumber = idx + 2; // Spreadsheet index (Row 1 is headers)
    const rawEmail = (row[emailCol] || '').trim();
    const normalizedEmail = rawEmail.toLowerCase();

    // Map standard fields
    const firstName = mapping.firstName ? capitalizePersonName(row[mapping.firstName]) : '';
    const lastName = mapping.lastName ? capitalizePersonName(row[mapping.lastName]) : '';
    const company = mapping.company ? (row[mapping.company] || '').trim() : '';
    const phone = mapping.phone ? (row[mapping.phone] || '').trim() : '';
    const jobTitle = mapping.jobTitle ? (row[mapping.jobTitle] || '').trim() : '';
    const awb = mapping.awb ? (row[mapping.awb] || '').trim() : '';
    const destination = mapping.destination ? (row[mapping.destination] || '').trim() : '';

    // Collect extra custom fields
    const mappedCols = new Set([
      emailCol,
      mapping.firstName,
      mapping.lastName,
      mapping.company,
      mapping.phone,
      mapping.jobTitle,
      mapping.awb,
      mapping.destination,
    ].filter(Boolean));

    const customFields: Record<string, string> = {};
    for (const [colKey, colVal] of Object.entries(row)) {
      if (!mappedCols.has(colKey) && !colKey.toLowerCase().startsWith('__empty')) {
        customFields[colKey] = (colVal || '').trim();
      }
    }

    let status: RecipientStatus = 'READY';
    let rejectReason: string | undefined;

    // Check missing email
    if (!rawEmail) {
      status = 'MISSING_EMAIL';
      rejectReason = 'Missing email address in specified column.';
      missingEmailCount++;
      rejectedCount++;
    } else {
      // Check email format
      const emailCheck = validateEmail(rawEmail);
      if (!emailCheck.valid) {
        status = 'INVALID_EMAIL';
        rejectReason = emailCheck.reason;
        invalidEmailCount++;
        rejectedCount++;
      } else if (suppressedEmails.has(normalizedEmail)) {
        status = 'SUPPRESSED';
        rejectReason = 'Recipient email address is in the suppression list.';
        rejectedCount++;
      } else {
        // Check duplicates
        const occurrences = emailOccurrences.get(normalizedEmail) || [];
        if (occurrences.length > 1) {
          if (dedupeOptions.strategy === 'allow_all') {
            // Keep all records / allow duplicates: do not reject, stays READY
          } else if (dedupeOptions.strategy === 'remove_all_duplicates') {
            status = 'DUPLICATE';
            rejectReason = `Duplicate email found across ${occurrences.length} rows. Policy set to remove all duplicates.`;
            duplicateCount++;
            rejectedCount++;
          } else {
            // keep_first
            const firstIdx = occurrences[0];
            if (idx !== firstIdx) {
              status = 'DUPLICATE';
              rejectReason = `Duplicate email already registered on spreadsheet row ${firstIdx + 2}. Kept first record.`;
              duplicateCount++;
              rejectedCount++;
            }
          }
        }
      }
    }

    // Check custom required fields if still ready
    if (status === 'READY' && mapping.requiredFields && mapping.requiredFields.length > 0) {
      for (const requiredCol of mapping.requiredFields) {
        const val = (row[requiredCol] || '').trim();
        if (!val) {
          status = 'MISSING_REQUIRED';
          rejectReason = `Missing required field: ${requiredCol}`;
          missingRequiredCount++;
          rejectedCount++;
          break;
        }
      }
    }

    if (status === 'READY') {
      readyCount++;
    }

    validatedRows.push({
      rowNumber,
      email: rawEmail,
      firstName,
      lastName,
      company,
      phone,
      jobTitle,
      awb,
      destination,
      customFields,
      status,
      rejectReason,
      isExcluded: false,
    });
  });

  return {
    totalRows: rawRows.length,
    readyCount,
    rejectedCount,
    duplicateCount,
    missingEmailCount,
    invalidEmailCount,
    missingRequiredCount,
    exceedsMaxRecipients: readyCount > 100,
    rows: validatedRows,
  };
}

/**
 * Generates CSV string of rejected rows for user download
 */
export function generateRejectedRowsCsv(rows: ValidatedRow[]): string {
  const rejected = rows.filter((r) => r.status !== 'READY');
  const headers = ['Row Number', 'Email', 'First Name', 'Last Name', 'Company', 'Status', 'Reject Reason'];
  
  const escapeCsv = (val: unknown): string => {
    const s = String(val ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const lines = [headers.map(escapeCsv).join(',')];
  for (const r of rejected) {
    lines.push(
      [
        r.rowNumber,
        r.email,
        r.firstName,
        r.lastName,
        r.company,
        r.status,
        r.rejectReason || '',
      ]
        .map(escapeCsv)
        .join(',')
    );
  }

  return lines.join('\r\n');
}
