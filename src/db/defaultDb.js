import { existsSync } from 'node:fs';
import { openReadOnly } from './connection.js';

/** Committed demo database, relative to the repo root. */
export const DEMO_PATH = 'data/chinook.sqlite';

/**
 * Open the demo database.
 *
 * @returns {import('better-sqlite3').Database} read-only connection
 * @throws {Error} if the file is missing, naming the `git restore` fix
 */
export function getDefaultDb() {
  if (!existsSync(DEMO_PATH)) {
    throw new Error(
      `Demo database not found at ${DEMO_PATH} (cwd: ${process.cwd()}). ` +
        `It is committed to the repo — restore it with: git restore ${DEMO_PATH}`
    );
  }
  return openReadOnly(DEMO_PATH);
}
