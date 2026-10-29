import { openReadOnly } from './db/connection.js';
import { DEMO_PATH, getDefaultDb } from './db/defaultDb.js';
import { getCachedSchema } from './db/schema.js';
import { loadFacts } from './db/facts.js';
import { executeSQL } from './db/executeSQL.js';
import { generateSQL } from './llm/generateSQL.js';
import { resolveModelKey } from './llm/models.js';
import { validateSQL } from './validate/validateSQL.js';

/** Same shape as a success, so every caller reads one result object. */
const fail = (question, model, stage, sql, error) => ({
  ok: false,
  stage,
  question,
  model,
  sql,
  columns: [],
  rows: [],
  error,
});

/**
 * question -> SQL -> validate -> run read-only. Never throws: every failure comes back as
 * `{ ok: false }` naming the stage that stopped it.
 *
 * @param {string} question plain English
 * @param {{ db?: import('better-sqlite3').Database, schema?: object, modelKey?: string,
 *   dbPath?: string }} [deps] defaults to the demo database and its cached schema; pass `dbPath`
 *   to run against another database, or `db` + `schema` for a mock. A caller resolves `dbPath`
 *   from the registry — it is never a path chosen by an end user. `modelKey` picks the provider;
 *   an unknown or unconfigured one falls back to the default, and `model` on the result names
 *   the one that actually ran. `note` is the user's own description of the database, passed to
 *   the prompt as untrusted, fenced context (D28).
 * @returns {Promise<{ ok: boolean, stage: 'setup'|'generate'|'refused'|'validate'|'execute'|'done',
 *   question: string, model: string, sql: string|null, columns: string[], rows: object[],
 *   error: string|null }>}
 */
export async function answerQuestion(question, { db, schema, modelKey, dbPath, note } = {}) {
  const model = resolveModelKey(modelKey);

  let connection = db;
  try {
// Read only connection
    connection ??= !dbPath || dbPath === DEMO_PATH ? getDefaultDb() : openReadOnly(dbPath);
    schema ??= getCachedSchema(connection.name);
  } catch (error) {
    return fail(question, model, 'setup', null, error.message);
  }

  try {
    let answer;
    try {
      const facts = loadFacts(connection.name);
      answer = await generateSQL(question, schema, { facts, note, modelKey: model });
    } catch (error) {
      return fail(question, model, 'generate', null, error.message);
    }

  // LLM refused
    if (!answer.can_answer) return fail(question, model, 'refused', null, answer.reason);

    const checked = validateSQL(answer.sql, schema);
    if (!checked.ok) return fail(question, model, 'validate', answer.sql, checked.errors.join('; '));

    try {
      const { columns, rows } = executeSQL(checked.sql, connection);
      return {
        ok: true,
        stage: 'done',
        question,
        model,
        sql: checked.sql,
        columns,
        rows,
        error: null,
      };
    } catch (error) {
      return fail(question, model, 'execute', checked.sql, error.message);
    }
  } finally {
    if (!db) connection.close(); // only close what this call opened
  }
}
