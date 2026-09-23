import { describe, it, expect } from 'vitest';
import {
  validateEmail,
  validateSpreadsheetRows,
  generateRejectedRowsCsv,
} from '../src/server/services/validator.js';

describe('Validator Service & Deduplication', () => {
  it('normalizes imported recipient names', () => {
    const summary = validateSpreadsheetRows(
      [{ Email: 'mary@example.com', First: 'mary-jane', Last: "O'CONNOR" }],
      { email: 'Email', firstName: 'First', lastName: 'Last' }
    );

    expect(summary.rows[0].firstName).toBe('Mary-Jane');
    expect(summary.rows[0].lastName).toBe("O'Connor");
  });

  it('strictly validates email syntax and rejects invalid entries without modifying them', () => {
    expect(validateEmail('valid.user@example.com').valid).toBe(true);
    expect(validateEmail('user+tag@domain.co.uk').valid).toBe(true);

    // Rejections
    expect(validateEmail('').valid).toBe(false);
    expect(validateEmail('   ').valid).toBe(false);
    expect(validateEmail('user@domain').valid).toBe(false); // missing TLD dot
    expect(validateEmail('user @domain.com').valid).toBe(false); // contains space
    expect(validateEmail('plainaddress').valid).toBe(false);
  });

  it('handles duplicates using keep_first strategy', () => {
    const rawRows = [
      { Email: 'alice@test.com', Name: 'Alice 1' },
      { Email: 'bob@test.com', Name: 'Bob' },
      { Email: 'alice@test.com', Name: 'Alice 2' },
      { Email: 'ALICE@TEST.COM', Name: 'Alice 3 (case insensitive)' },
    ];

    const summary = validateSpreadsheetRows(
      rawRows,
      { email: 'Email', firstName: 'Name' },
      { strategy: 'keep_first' }
    );

    expect(summary.totalRows).toBe(4);
    expect(summary.readyCount).toBe(2); // Alice 1 and Bob
    expect(summary.duplicateCount).toBe(2); // Alice 2 and Alice 3
    expect(summary.rows[0].status).toBe('READY');
    expect(summary.rows[1].status).toBe('READY');
    expect(summary.rows[2].status).toBe('DUPLICATE');
    expect(summary.rows[3].status).toBe('DUPLICATE');
  });

  it('handles duplicates using remove_all_duplicates strategy', () => {
    const rawRows = [
      { Email: 'alice@test.com', Name: 'Alice 1' },
      { Email: 'bob@test.com', Name: 'Bob' },
      { Email: 'alice@test.com', Name: 'Alice 2' },
    ];

    const summary = validateSpreadsheetRows(
      rawRows,
      { email: 'Email', firstName: 'Name' },
      { strategy: 'remove_all_duplicates' }
    );

    expect(summary.readyCount).toBe(1); // Only Bob is ready
    expect(summary.duplicateCount).toBe(2); // Both Alice rows rejected
    expect(summary.rows[0].status).toBe('DUPLICATE');
    expect(summary.rows[1].status).toBe('READY');
    expect(summary.rows[2].status).toBe('DUPLICATE');
  });

  it('allows all records when strategy is allow_all (verified list)', () => {
    const rawRows = [
      { Email: 'alice@test.com', Name: 'Alice 1' },
      { Email: 'bob@test.com', Name: 'Bob' },
      { Email: 'alice@test.com', Name: 'Alice 2' },
    ];

    const summary = validateSpreadsheetRows(
      rawRows,
      { email: 'Email', firstName: 'Name' },
      { strategy: 'allow_all' }
    );

    expect(summary.totalRows).toBe(3);
    expect(summary.readyCount).toBe(3); // All 3 records accepted
    expect(summary.rejectedCount).toBe(0);
    expect(summary.duplicateCount).toBe(0);
    expect(summary.rows[0].status).toBe('READY');
    expect(summary.rows[1].status).toBe('READY');
    expect(summary.rows[2].status).toBe('READY');
  });

  it('detects missing emails and invalid format', () => {
    const rawRows = [
      { Email: '', Name: 'Empty' },
      { Email: 'not-an-email', Name: 'Malformed' },
      { Email: 'valid@example.com', Name: 'Valid' },
    ];

    const summary = validateSpreadsheetRows(
      rawRows,
      { email: 'Email', firstName: 'Name' }
    );

    expect(summary.missingEmailCount).toBe(1);
    expect(summary.invalidEmailCount).toBe(1);
    expect(summary.readyCount).toBe(1);
    expect(summary.rows[0].status).toBe('MISSING_EMAIL');
    expect(summary.rows[1].status).toBe('INVALID_EMAIL');
  });

  it('generates a clean CSV file of rejected rows with clear reasons', () => {
    const rawRows = [
      { Email: '', Name: 'Empty' },
      { Email: 'invalid.com', Name: 'Bad' },
    ];

    const summary = validateSpreadsheetRows(
      rawRows,
      { email: 'Email', firstName: 'Name' }
    );

    const rejectedCsv = generateRejectedRowsCsv(summary.rows);
    expect(rejectedCsv).toContain('Row Number,Email,First Name,Last Name,Company,Status,Reject Reason');
    expect(rejectedCsv).toContain('MISSING_EMAIL');
    expect(rejectedCsv).toContain('INVALID_EMAIL');
  });
});
