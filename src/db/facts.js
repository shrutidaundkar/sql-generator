import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';

/**
 * Sidecar path for a database: data/chinook.sqlite -> data/chinook.facts.md
 *
 * @param {string} dbPath
 * @returns {string}
 */
export function factsPathFor(dbPath) {
  return join(dirname(dbPath), `${basename(dbPath, extname(dbPath))}.facts.md`);
}

/**
 * Read one database's notes: what an enum code means, how dates are stored, and so on.
 *
 * The schema says a column is INTEGER; only a human can say 0 means ACTIVE. Written by the
 * operator, so it is trusted like code — unlike a user's DB note, which is not (D28).
 *
 * @param {string} dbPath
 * @returns {string} the file's text, or '' if there is no sidecar
 */
export function loadFacts(dbPath) {
  const factsPath = factsPathFor(dbPath);
  return existsSync(factsPath) ? readFileSync(factsPath, 'utf8').trim() : '';
}
