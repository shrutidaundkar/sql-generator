import { openReadOnly } from './connection.js';

/** Hide bookkeeping tables: _prisma_migrations, sqlite_sequence, sqlite_master. */
const isInternal = (name) => name.startsWith('_') || name.startsWith('sqlite_');

/**
 * Read the structure of a SQLite file. The same object feeds the prompt and the validator,
 * so they can never disagree about what exists.
 *
 * @param {string} dbPath
 * @returns {{ tables: { name: string, columns: { name: string, type: string, notnull: 0|1, pk: 0|1 }[] }[] }}
 */
export function getSchema(dbPath) {
  const db = openReadOnly(dbPath);
  try {
    const tableNames = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
      .all()
      .map((row) => row.name)
      .filter((name) => !isInternal(name));

    // pragma_table_info() is the function form, so the table name can be bound as a parameter.
    // "notnull" is a SQLite keyword, so it needs quoting.
    const columnsOf = db.prepare(`SELECT name, type, "notnull", pk FROM pragma_table_info(?)`);

    return { tables: tableNames.map((name) => ({ name, columns: columnsOf.all(name) })) };
  } finally {
    db.close();
  }
}

/** dbPath -> schema, for the life of the process. */
const cache = new Map();

/**
 * getSchema() cached by path, so a database is read once and not per query.
 *
 * @param {string} dbPath
 * @returns {ReturnType<typeof getSchema>} the shared object — treat it as read-only
 */
export function getCachedSchema(dbPath) {
  if (!cache.has(dbPath)) cache.set(dbPath, getSchema(dbPath));
  return cache.get(dbPath);
}
