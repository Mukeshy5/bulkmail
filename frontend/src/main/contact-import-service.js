import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { validateContact } from './contacts-service.js';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_ROWS = 10000;
const MAX_REPORT_ISSUES = 25;

function fileBytes(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }
  return null;
}

function cellText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'object') return String(value).trim();
  if ('text' in value) return String(value.text).trim();
  if ('result' in value) return String(value.result ?? '').trim();
  if (Array.isArray(value.richText)) {
    return value.richText
      .map((part) => part.text)
      .join('')
      .trim();
  }
  return '';
}

function validateHeaders(headers) {
  const cleaned = headers.map((header) => String(header ?? '').trim());
  if (!cleaned.length || cleaned.some((header) => !header)) {
    return {
      ok: false,
      error: 'The first row must contain a name for every column.',
    };
  }
  if (
    new Set(cleaned.map((header) => header.toLowerCase())).size !==
    cleaned.length
  ) {
    return { ok: false, error: 'Column names must be unique.' };
  }
  return { ok: true, headers: cleaned };
}

async function parseFile(input) {
  if (!input || typeof input.fileName !== 'string') {
    return { ok: false, error: 'Choose a CSV or XLSX file.' };
  }
  const bytes = fileBytes(input.fileData);
  if (!bytes?.length) {
    return { ok: false, error: 'The selected file is empty or invalid.' };
  }
  if (bytes.length > MAX_FILE_BYTES) {
    return { ok: false, error: 'Import files must be 10 MB or smaller.' };
  }

  const filename = path.basename(input.fileName).slice(0, 120);
  const extension = path.extname(filename).toLowerCase();
  let headers;
  let rawRows;

  if (extension === '.csv') {
    let rows;
    try {
      rows = parse(bytes.toString('utf8'), {
        bom: true,
        skip_empty_lines: true,
        trim: true,
        max_record_size: 10000,
      });
    } catch (error) {
      return {
        ok: false,
        error: `CSV could not be parsed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    if (!rows.length) return { ok: false, error: 'The CSV file has no rows.' };
    const headerResult = validateHeaders(rows[0]);
    if (!headerResult.ok) return headerResult;
    headers = headerResult.headers;
    rawRows = rows.slice(1).map((row) => {
      const record = {};
      headers.forEach((header, index) => {
        record[header] = String(row[index] ?? '').trim();
      });
      return record;
    });
  } else if (extension === '.xlsx') {
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(bytes);
    } catch (error) {
      return {
        ok: false,
        error: `XLSX could not be parsed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    const worksheet = workbook.worksheets[0];
    if (!worksheet || worksheet.rowCount === 0) {
      return { ok: false, error: 'The workbook has no rows to import.' };
    }
    const headerResult = validateHeaders(
      Array.from({ length: worksheet.columnCount }, (_value, index) =>
        cellText(worksheet.getRow(1).getCell(index + 1).value),
      ),
    );
    if (!headerResult.ok) return headerResult;
    headers = headerResult.headers;
    rawRows = [];
    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      const record = {};
      headers.forEach((header, index) => {
        record[header] = cellText(row.getCell(index + 1).value);
      });
      if (Object.values(record).some(Boolean)) rawRows.push(record);
    }
  } else {
    return { ok: false, error: 'Only .csv and .xlsx files are supported.' };
  }

  if (rawRows.length > MAX_ROWS) {
    return {
      ok: false,
      error: `Import files are limited to ${MAX_ROWS} data rows.`,
    };
  }
  return { ok: true, filename, headers, rows: rawRows };
}

export async function previewContactImport(input) {
  const parsed = await parseFile(input);
  if (!parsed.ok) return parsed;
  return {
    ok: true,
    filename: parsed.filename,
    headers: parsed.headers,
    totalRows: parsed.rows.length,
    previewRows: parsed.rows.slice(0, 8),
  };
}

function mappedContact(row, mapping) {
  const get = (field) => {
    const header = mapping[field];
    return typeof header === 'string' ? (row[header] ?? '') : '';
  };
  return {
    fullName: get('fullName'),
    firstName: get('firstName'),
    lastName: get('lastName'),
    email: get('email'),
    company: get('company'),
    phone: get('phone'),
    country: get('country'),
    city: get('city'),
    category: get('category'),
    tags: get('tags'),
    subscriptionStatus: 'pending',
  };
}

function addActivity(database, actorUserId, importedCount, filename) {
  const now = new Date().toISOString();
  database
    .prepare(
      `INSERT INTO activity_log (
        id, actor_user_id, action, entity_type, entity_id, description, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      randomUUID(),
      actorUserId,
      'contacts.imported',
      'contact_import',
      null,
      `${importedCount} contacts imported from ${filename}`,
      now,
    );
}

export async function importContacts(database, actorUserId, input) {
  const parsed = await parseFile(input);
  if (!parsed.ok) return parsed;

  const mapping = input.mapping;
  if (
    !mapping ||
    typeof mapping !== 'object' ||
    !parsed.headers.includes(mapping.email)
  ) {
    return {
      ok: false,
      error: 'Map a spreadsheet column to Email before importing.',
    };
  }

  const hasNameMapping =
    parsed.headers.includes(mapping.fullName) ||
    (parsed.headers.includes(mapping.firstName) &&
      parsed.headers.includes(mapping.lastName));
  if (!hasNameMapping) {
    return {
      ok: false,
      error: 'Map Full Name, or map both First Name and Last Name.',
    };
  }

  const report = {
    filename: parsed.filename,
    totalRows: parsed.rows.length,
    imported: 0,
    duplicates: 0,
    invalid: 0,
    suppressed: 0,
    issues: [],
  };
  const seen = new Set();
  const eligibleContacts = [];
  const existingEmail = database.prepare(
    'SELECT id FROM contacts WHERE email = ?',
  );
  const suppressedEmail = database.prepare(
    'SELECT email FROM suppression_list WHERE email = ?',
  );

  parsed.rows.forEach((row, index) => {
    const validated = validateContact(mappedContact(row, mapping));
    if (!validated.ok) {
      report.invalid += 1;
      if (report.issues.length < MAX_REPORT_ISSUES) {
        report.issues.push({ row: index + 2, reason: validated.error });
      }
      return;
    }

    const email = validated.contact.email;
    if (seen.has(email)) {
      report.duplicates += 1;
      if (report.issues.length < MAX_REPORT_ISSUES) {
        report.issues.push({
          row: index + 2,
          reason: 'Duplicate email address.',
        });
      }
      return;
    }
    seen.add(email);
    if (suppressedEmail.get(email)) {
      report.suppressed += 1;
      if (report.issues.length < MAX_REPORT_ISSUES) {
        report.issues.push({
          row: index + 2,
          reason: 'Address is suppressed.',
        });
      }
      return;
    }
    if (existingEmail.get(email)) {
      report.duplicates += 1;
      if (report.issues.length < MAX_REPORT_ISSUES) {
        report.issues.push({
          row: index + 2,
          reason: 'Duplicate email address.',
        });
      }
      return;
    }

    eligibleContacts.push(validated.contact);
  });

  const insert = database.prepare(
    `INSERT INTO contacts (
      id, full_name, first_name, last_name, email, company, phone, country,
      city, category, tags, subscription_status, consent_source, consent_at,
      created_at, updated_at
    ) VALUES (
      @id, @fullName, @firstName, @lastName, @email, @company, @phone,
      @country, @city, @category, @tags, 'pending', NULL, NULL, @now, @now
    )`,
  );
  const saveReport = database.prepare(
    `INSERT INTO import_jobs (
      id, actor_user_id, filename, total_rows, imported_count, duplicate_count,
      invalid_count, suppressed_count, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const saveImport = database.transaction(() => {
    const now = new Date().toISOString();
    for (const contact of eligibleContacts) {
      insert.run({
        id: randomUUID(),
        ...contact,
        tags: JSON.stringify(contact.tags),
        now,
      });
    }

    report.imported = eligibleContacts.length;
    saveReport.run(
      randomUUID(),
      actorUserId,
      parsed.filename,
      report.totalRows,
      report.imported,
      report.duplicates,
      report.invalid,
      report.suppressed,
      now,
    );
    addActivity(database, actorUserId, report.imported, parsed.filename);
  });
  saveImport.immediate();

  return { ok: true, report };
}
