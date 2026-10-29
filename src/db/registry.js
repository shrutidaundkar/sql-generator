import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DEMO_PATH } from './defaultDb.js';
import { getCachedSchema } from './schema.js';

/** Uploads live here; the demo DB never does. */
export const UPLOAD_DIR = 'data/uploads';

/** The one database that is always present and cannot be removed. */
export const DEMO_ID = 'demo';

/**
 * dbId -> { path, label }. In memory only, rebuilt on every boot.
 *
 * The client picks a database by key, never by path. A path is not a key, so it resolves to
 * nothing (D34).
 */
const registry = new Map([[DEMO_ID, { path: DEMO_PATH, label: 'Chinook' }]]);

/**
 * Add a database to the registry, but only if we can actually query it.
 *
 * Reading the schema is the test: a file we cannot open read-only, or that has no user tables,
 * never enters the map.
 *
 * @param {string} dbId key the client will use
 * @param {string} path on-disk location, chosen by us — never by the client
 * @param {string} label display name
 * @returns {{ dbId: string, label: string, tables: string[] }}
 * @throws {Error} if the file is unreadable or holds no user tables
 */
export function register(dbId, path, label) {
  const { tables } = getCachedSchema(path);
  if (tables.length === 0) {
    throw new Error('That file has no user tables, so there is nothing to query.');
  }
  registry.set(dbId, { path, label });
  return { dbId, label, tables: tables.map((table) => table.name) };
}

/**
 * Register everything already in the uploads folder, so a file copied there by hand shows up
 * without being uploaded again. A bad file is skipped with a warning — it must not stop boot.
 *
 * @returns {{ dbId: string, label: string, tables: string[] }[]} the ones that registered
 */
export function scanUploads() {
  if (!existsSync(UPLOAD_DIR)) return [];

  const found = [];
  for (const file of readdirSync(UPLOAD_DIR)) {
    if (!/\.(sqlite|sqlite3|db)$/i.test(file)) continue;
    try {
      found.push(register(file, join(UPLOAD_DIR, file), file));
    } catch (error) {
      console.warn(`skipping ${file}: ${error.message}`);
    }
  }
  return found;
}

/**
 * The path for a database key, or undefined if the key is not registered.
 *
 * @param {string} dbId
 * @returns {string|undefined}
 */
export function pathFor(dbId) {
  return registry.get(dbId)?.path;
}

/**
 * Every registered database, for the picker.
 *
 * @returns {{ dbId: string, label: string, isDemo: boolean, tables: string[] }[]}
 */
export function listDbs() {
  return [...registry].map(([dbId, { path, label }]) => ({
    dbId,
    label,
    isDemo: dbId === DEMO_ID,
    tables: getCachedSchema(path).tables.map((table) => table.name),
  }));
}

/**
 * Drop a database from the picker. The file stays on disk, so a mis-click costs nothing and the
 * next boot scan finds it again. The demo DB cannot be removed.
 *
 * @param {string} dbId
 * @returns {boolean} false if the key is unknown or is the demo DB
 */
export function forget(dbId) {
  if (dbId === DEMO_ID) return false;
  return registry.delete(dbId);
}
