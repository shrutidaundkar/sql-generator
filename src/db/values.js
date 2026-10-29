import { openReadOnly } from './connection.js';

/** Table and column names cannot be bound as parameters, so quote them instead. */
const quote = (id) => `"${id.replace(/"/g, '""')}"`;

/** SQLite TEXT affinity: any declared type containing CHAR, CLOB or TEXT. */
const isText = (type) => /CHAR|CLOB|TEXT/i.test(type || '');

/**
 * Sample distinct values from text columns that have only a few of them.
 *
 * Off by default: sending row values to the model sends real data (Spec.md §6). Only the
 * `includeValueHints` toggle turns it on.
 *
 * @param {string} dbPath
 * @param {object} schema from getSchema()
 * @param {{ maxDistinct?: number }} [opts] skip columns with more distinct values than this
 * @returns {Record<string, string[]>} e.g. { 'Genre.Name': ['Rock', ...] }
 */
export function sampleTextValues(dbPath, schema, { maxDistinct = 40 } = {}) {
  const db = openReadOnly(dbPath);
  try {
    const hints = {};
    for (const table of schema.tables) {
      for (const column of table.columns) {
        if (!isText(column.type)) continue;
        // Ask for one more than the limit: if it comes back, the column has too many values.
        const values = db
          .prepare(
            `SELECT DISTINCT ${quote(column.name)} AS value FROM ${quote(table.name)}
             WHERE ${quote(column.name)} IS NOT NULL ORDER BY 1 LIMIT ?`
          )
          .all(maxDistinct + 1)
          .map((row) => row.value);

        if (values.length > 0 && values.length <= maxDistinct) {
          hints[`${table.name}.${column.name}`] = values;
        }
      }
    }
    return hints;
  } finally {
    db.close();
  }
}
