/**
 * Run SQL that validateSQL() has already approved.
 *
 * Columns come from the statement, not the rows, so an empty result still has headers.
 *
 * @param {string} sql the `sql` returned by validateSQL(), not the model's raw text
 * @param {import('better-sqlite3').Database} db read-only connection
 * @returns {{ columns: string[], rows: object[] }}
 * @throws {Error} on any SQLite error
 */
export function executeSQL(sql, db) {
  const statement = db.prepare(sql);
  return { columns: statement.columns().map((c) => c.name), rows: statement.all() };
}
