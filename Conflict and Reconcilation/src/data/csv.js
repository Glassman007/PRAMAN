export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (quoted && next === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === ',' && !quoted) {
      row.push(field);
      field = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(field);
      field = '';
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      continue;
    }

    field += char;
  }

  if (field !== '' || row.length) {
    row.push(field);
    if (row.some((value) => value !== '')) rows.push(row);
  }

  if (!rows.length) return [];
  const [headers, ...body] = rows;

  return body.map((values) => Object.fromEntries(
    headers.map((header, index) => [header.replace(/^\uFEFF/, ''), values[index] ?? ''])
  ));
}
