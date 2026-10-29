/**
 * Fixed-width text table. Keeps the headers when there are no rows.
 *
 * @param {string[]} columns
 * @param {object[]} rows keyed by column name
 * @returns {string}
 */
export function formatTable(columns, rows) {
  const cell = (value) => (value === null || value === undefined ? 'NULL' : String(value));
  const widths = columns.map((column) =>
    Math.max(column.length, ...rows.map((row) => cell(row[column]).length))
  );
  const line = (values) => values.map((v, i) => v.padEnd(widths[i])).join('  ').trimEnd();

  return [
    line(columns),
    line(widths.map((width) => '-'.repeat(width))),
    ...(rows.length ? rows.map((row) => line(columns.map((c) => cell(row[c])))) : ['(no rows)']),
  ].join('\n');
}
