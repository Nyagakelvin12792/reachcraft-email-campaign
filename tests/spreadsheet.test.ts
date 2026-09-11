import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { parseSpreadsheetFile, suggestColumnMapping } from '../src/server/services/spreadsheet.js';

describe('Spreadsheet Ingestion & Column Detection', () => {
  const testDir = path.resolve(process.cwd(), 'tests', 'fixtures');

  beforeAll(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  it('correctly imports and parses a CSV file', () => {
    const csvPath = path.join(testDir, 'sample.csv');
    const csvContent = 'Email,First Name,Last Name,Company,AWB,City\nalice@example.com,Alice,Smith,Acme Corp,12345678,Dallas\nbob@example.com,Bob,Jones,Global Logistics,87654321,Austin';
    fs.writeFileSync(csvPath, csvContent, 'utf-8');

    const result = parseSpreadsheetFile(csvPath, 'sample.csv');
    expect(result.fileName).toBe('sample.csv');
    expect(result.columns).toContain('Email');
    expect(result.columns).toContain('First Name');
    expect(result.columns).toContain('AWB');
    expect(result.rows.length).toBe(2);
    expect(result.rows[0].Email).toBe('alice@example.com');
    expect(result.rows[0]['First Name']).toBe('Alice');
  });

  it('correctly imports and parses an Excel (.xlsx) file', () => {
    const xlsxPath = path.join(testDir, 'sample.xlsx');
    const data = [
      ['Email Address', 'Contact Name', 'Organization', 'Tracking'],
      ['carol@test.com', 'Carol White', 'Omni Corp', 'AWB-9901'],
      ['david@test.com', 'David Green', 'Stark Logistics', 'AWB-9902'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Consignees');
    XLSX.writeFile(wb, xlsxPath);

    const result = parseSpreadsheetFile(xlsxPath, 'sample.xlsx');
    expect(result.columns).toContain('Email Address');
    expect(result.columns).toContain('Organization');
    expect(result.rows.length).toBe(2);
    expect(result.rows[0]['Email Address']).toBe('carol@test.com');
  });

  it('auto-suggests column mappings based on standard header patterns', () => {
    const cols = ['Recipient Email', 'first_name', 'surname', 'company_name', 'phone', 'AWB_Number', 'Dest_Airport'];
    const suggestion = suggestColumnMapping(cols);

    expect(suggestion.email).toBe('Recipient Email');
    expect(suggestion.firstName).toBe('first_name');
    expect(suggestion.lastName).toBe('surname');
    expect(suggestion.company).toBe('company_name');
    expect(suggestion.phone).toBe('phone');
    expect(suggestion.awb).toBe('AWB_Number');
    expect(suggestion.destination).toBe('Dest_Airport');
  });

  it('correctly maps user spreadsheet columns: First name, Last name, Email address, Phone number, Job title, Company name', () => {
    const userColumns = ['First name', 'Last name', 'Email address', 'Phone number', 'Job title', 'Company name'];
    const suggestion = suggestColumnMapping(userColumns);

    expect(suggestion.firstName).toBe('First name');
    expect(suggestion.lastName).toBe('Last name');
    expect(suggestion.email).toBe('Email address');
    expect(suggestion.phone).toBe('Phone number');
    expect(suggestion.jobTitle).toBe('Job title');
    expect(suggestion.company).toBe('Company name');
  });

  it('throws an error when file is empty or missing', () => {
    const emptyPath = path.join(testDir, 'empty.csv');
    fs.writeFileSync(emptyPath, '', 'utf-8');

    expect(() => parseSpreadsheetFile(emptyPath, 'empty.csv')).toThrow();
  });
});
