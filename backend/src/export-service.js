import ExcelJS from 'exceljs';
import { escapeHtml } from './delivery-service.js';
import { report } from './report-service.js';

const safeSpreadsheet = (value) =>
  typeof value === 'string' && /^\s*[=+@-]/.test(value)
    ? "'" + value
    : (value ?? '');
const csvValue = (value) =>
  '"' + String(safeSpreadsheet(value)).replaceAll('"', '""') + '"';

export async function exportReport(db, input) {
  const dataset = report(db, input);
  if (!dataset.ok) return dataset;
  if (!dataset.rows.length)
    return {
      ok: false,
      error: 'There are no rows to export for this date range.',
    };
  if (!['csv', 'xlsx', 'pdf'].includes(input.format))
    return { ok: false, error: 'Choose a supported report format.' };

  const columns = Object.keys(dataset.rows[0]);
  const rows = dataset.rows.map((row) => columns.map((column) => row[column]));
  const file = {
    name: input.type + '-report.' + input.format,
    format: input.format,
  };
  if (input.format === 'csv') {
    file.text =
      '\uFEFF' +
      [columns, ...rows].map((row) => row.map(csvValue).join(',')).join('\r\n');
  } else if (input.format === 'xlsx') {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Report');
    sheet.columns = columns.map((key) => ({
      header: key.replaceAll('_', ' '),
      key,
      width: 25,
    }));
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    for (const row of rows) sheet.addRow(row.map((value) => value ?? ''));
    file.base64 = Buffer.from(await workbook.xlsx.writeBuffer()).toString(
      'base64',
    );
  } else {
    file.landscape = columns.length > 5;
    file.html =
      '<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'">' +
      '<style>body{font:12px sans-serif;color:#142748}table{border-collapse:collapse;width:100%;table-layout:fixed}td,th{border:1px solid #cdd7e8;padding:5px;text-align:left;overflow-wrap:anywhere}th{background:#eaf0f9}tr{break-inside:avoid}</style><h1>' +
      escapeHtml(input.type) +
      ' report</h1><table><thead><tr>' +
      columns
        .map((item) => '<th>' + escapeHtml(item.replaceAll('_', ' ')) + '</th>')
        .join('') +
      '</tr></thead><tbody>' +
      rows
        .map(
          (row) =>
            '<tr>' +
            row
              .map((item) => '<td>' + escapeHtml(item ?? '') + '</td>')
              .join('') +
            '</tr>',
        )
        .join('') +
      '</tbody></table>';
  }
  return { ok: true, file };
}
