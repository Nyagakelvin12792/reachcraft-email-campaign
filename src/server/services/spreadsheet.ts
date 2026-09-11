import * as XLSX from 'xlsx';
import fs from 'fs';

export interface ParsedSpreadsheet {
  fileName: string;
  columns: string[];
  suggestedMapping: Record<string, string>;
  rows: Array<Record<string, string>>;
}

/**
 * Heuristic mapping to auto-suggest standard fields from spreadsheet columns
 */
export function suggestColumnMapping(columns: string[]): Record<string, string> {
  const mapping: Record<string, string> = {
    email: '',
    firstName: '',
    lastName: '',
    company: '',
    phone: '',
    jobTitle: '',
    awb: '',
    destination: '',
  };

  const normalized = columns.map((col) => ({
    original: col,
    clean: col.toLowerCase().replace(/[^a-z0-9]/g, ''),
  }));

  for (const item of normalized) {
    // Email detection
    if (!mapping.email && (item.clean === 'email' || item.clean.includes('mail') || item.clean === 'emailaddress')) {
      mapping.email = item.original;
    }
    // First name detection
    else if (!mapping.firstName && (item.clean === 'firstname' || item.clean === 'first' || item.clean === 'fname')) {
      mapping.firstName = item.original;
    }
    // Last name detection
    else if (!mapping.lastName && (item.clean === 'lastname' || item.clean === 'last' || item.clean === 'lname' || item.clean === 'surname')) {
      mapping.lastName = item.original;
    }
    // Company detection
    else if (!mapping.company && (item.clean === 'company' || item.clean === 'companyname' || item.clean === 'organization' || item.clean === 'business')) {
      mapping.company = item.original;
    }
    // Phone detection
    else if (!mapping.phone && (item.clean === 'phone' || item.clean === 'phonenumber' || item.clean === 'mobile' || item.clean === 'tel')) {
      mapping.phone = item.original;
    }
    // Job title detection
    else if (!mapping.jobTitle && (item.clean === 'jobtitle' || item.clean === 'title' || item.clean === 'role' || item.clean === 'position' || item.clean === 'occupation' || item.clean.includes('jobtitle'))) {
      mapping.jobTitle = item.original;
    }
    // AWB detection
    else if (!mapping.awb && (item.clean.includes('awb') || item.clean.includes('tracking') || item.clean === 'airwaybill')) {
      mapping.awb = item.original;
    }
    // Destination detection
    else if (!mapping.destination && (item.clean.includes('dest') || item.clean.includes('airport') || item.clean === 'city' || item.clean === 'station')) {
      mapping.destination = item.original;
    }
  }

  // Fallback for full name column if separate first/last name columns aren't found
  if (!mapping.firstName) {
    const nameCol = normalized.find((i) => i.clean === 'name' || i.clean === 'fullname');
    if (nameCol) {
      mapping.firstName = nameCol.original;
    }
  }

  return mapping;
}

/**
 * Safely parses an uploaded spreadsheet (CSV, XLSX, XLS)
 */
export function parseSpreadsheetFile(filePath: string, originalName: string): ParsedSpreadsheet {
  if (!fs.existsSync(filePath)) {
    throw new Error('Spreadsheet file does not exist on disk.');
  }

  // Read file buffer safely
  const fileBuffer = fs.readFileSync(filePath);

  // Parse workbook with SheetJS (disable dangerous formula evaluation)
  const workbook = XLSX.read(fileBuffer, {
    type: 'buffer',
    cellFormula: false,
    cellHTML: false,
    cellText: true,
  });

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('Spreadsheet contains no sheets.');
  }

  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  if (!worksheet) {
    throw new Error(`Worksheet ${sheetName} could not be read.`);
  }

  // Convert to array of objects
  const rawRows: Array<Record<string, unknown>> = XLSX.utils.sheet_to_json(worksheet, {
    raw: false,
    defval: '',
  });

  if (rawRows.length === 0) {
    throw new Error('Spreadsheet is empty or contains no data rows.');
  }

  // Extract all unique column headers across rows
  const columnSet = new Set<string>();
  for (const row of rawRows) {
    for (const key of Object.keys(row)) {
      const trimmed = key.trim();
      if (trimmed && !trimmed.toLowerCase().startsWith('__empty')) {
        columnSet.add(trimmed);
      }
    }
  }

  const columns = Array.from(columnSet);
  if (columns.length === 0) {
    throw new Error('No valid columns found in the spreadsheet header.');
  }

  // Normalize rows to string-keyed dictionary
  const normalizedRows: Array<Record<string, string>> = rawRows.map((row) => {
    const rowObj: Record<string, string> = {};
    for (const col of columns) {
      const val = row[col];
      rowObj[col] = val !== undefined && val !== null ? String(val).trim() : '';
    }
    return rowObj;
  });

  const suggestedMapping = suggestColumnMapping(columns);

  return {
    fileName: originalName,
    columns,
    suggestedMapping,
    rows: normalizedRows,
  };
}
