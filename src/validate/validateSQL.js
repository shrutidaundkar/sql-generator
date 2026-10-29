import pkg from 'node-sql-parser';

const { Parser } = pkg; // CommonJS module: no named ESM exports.

const PARSER_OPT = { database: 'sqlite' };

/** The parser reports `SELECT *` as a column named "(.*)". */
const STAR = '(.*)';

const reject = (sql, errors) => ({ ok: false, sql, errors });

/**
 * Collect column aliases (`COUNT(x) AS total`) from the whole tree, subqueries included.
 *
 * The parser lists an alias like a real column, so without this `ORDER BY total` looks like an
 * unknown column.
 *
 * @returns {Set<string>} lowercased alias names
 */
function outputAliases(node, found = new Set()) {
  if (Array.isArray(node)) {
    for (const item of node) outputAliases(item, found);
    return found;
  }
  if (!node || typeof node !== 'object') return found;

  if (Array.isArray(node.columns)) {
    for (const column of node.columns) {
      if (typeof column?.as === 'string') found.add(column.as.toLowerCase());
    }
  }
  for (const value of Object.values(node)) outputAliases(value, found);
  return found;
}

/** { lowercase table name -> { name, columns: Set<lowercase> } } */
function indexSchema(schema) {
  return new Map(
    schema.tables.map((table) => [
      table.name.toLowerCase(),
      { name: table.name, columns: new Set(table.columns.map((c) => c.name.toLowerCase())) },
    ])
  );
}

/**
 * Check every table and column the query names against the schema, ignoring case.
 *
 * @returns {string[]} all problems found, deduped
 */
function schemaErrors({ tableList, columnList, ast }, schema) {
  const known = indexSchema(schema);
  const errors = [];
  const referenced = [];

  // Entries are "type::db::table"; the type prefix casing varies by statement.
  for (const entry of tableList) {
    const name = entry.split('::').pop();
    const table = known.get(name.toLowerCase());
    if (table) referenced.push(table);
    else errors.push(`Unknown table: ${name}`);
  }

  const aliases = outputAliases(ast);

  for (const entry of columnList) {
    const [, qualifier, column] = entry.split('::');
    if (column === STAR || aliases.has(column.toLowerCase())) continue;

    if (qualifier && qualifier !== 'null') {
      // The parser already resolves table aliases (t.Name -> Track.Name), so an unknown qualifier
      // is either reported above or belongs to a subquery.
      // ponytail: unknown qualifiers pass. Tighten only if false-accepts show up in eval —
      // SELECT-only and the read-only connection are what actually bound the risk.
      const table = known.get(qualifier.toLowerCase());
      if (table && !table.columns.has(column.toLowerCase())) {
        errors.push(`Unknown column: ${table.name}.${column}`);
      }
    } else if (!referenced.some((table) => table.columns.has(column.toLowerCase()))) {
      const where = referenced.map((t) => t.name).join(', ') || 'any referenced table';
      errors.push(`Unknown column: ${column} (not found in ${where})`);
    }
  }

  return [...new Set(errors)];
}

/**
 * Check LLM-written SQL before it runs. Treats the SQL as untrusted input and never throws.
 *
 * Two kinds of check. Security: one statement, SELECT only. Correctness: the tables and columns
 * must exist, and there must be a LIMIT.
 *
 * @param {string} sql
 * @param {object} schema from getSchema()
 * @param {{ maxLimit?: number }} [opts] LIMIT injected when the query has none
 * @returns {{ ok: boolean, sql: string, errors: string[] }} run the returned `sql`, not the input
 */
export function validateSQL(sql, schema, { maxLimit = 100 } = {}) {
  const parser = new Parser();

  let parsed;
  try {
    // One call gives us the syntax tree and flat lists of the tables and columns it uses.
    parsed = parser.parse(sql, PARSER_OPT);
  } catch (error) {
    return reject(sql, [`Not valid SQLite: ${error.message.split('\n')[0]}`]);
  }

  const statements = Array.isArray(parsed.ast) ? parsed.ast : [parsed.ast];
  if (statements.length > 1) {
    return reject(sql, [`Only a single statement is allowed; found ${statements.length}.`]);
  }

  const ast = statements[0];
  if (ast?.type !== 'select') {
    return reject(sql, [`Only SELECT is allowed; this is ${String(ast?.type).toUpperCase()}.`]);
  }

  const errors = schemaErrors(parsed, schema);
  if (errors.length > 0) return reject(sql, errors);

  if (!(ast.limit?.value?.length > 0)) {
    ast.limit = { seperator: '', value: [{ type: 'number', value: maxLimit }] }; // library's typo
    return { ok: true, sql: parser.sqlify(ast, PARSER_OPT), errors: [] };
  }

  return { ok: true, sql, errors: [] }; // already limited: return untouched
}
