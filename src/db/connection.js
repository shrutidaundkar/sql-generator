import Database from 'better-sqlite3';

/**
 * Open a SQLite file. The only place a connection is created, and always read-only.
 *
 * `fileMustExist` stops SQLite creating an empty file when the path is wrong.
 *
 * @param {string} dbPath
 * @returns {Database.Database} read-only connection; caller closes it
 */
export function openReadOnly(dbPath) {
  return new Database(dbPath, { readonly: true, fileMustExist: true });
}
