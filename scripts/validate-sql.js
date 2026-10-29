// npm run validate-sql -- "<sql>" — print { ok, sql, errors } for one SQL string.
import { DEMO_PATH } from '../src/db/defaultDb.js';
import { getSchema } from '../src/db/schema.js';
import { validateSQL } from '../src/validate/validateSQL.js';

const sql = process.argv.slice(2).join(' ').trim();
if (!sql) {
  console.error('usage: npm run validate-sql -- "SELECT COUNT(*) FROM Track"');
  process.exit(1);
}

console.log(JSON.stringify(validateSQL(sql, getSchema(DEMO_PATH)), null, 2));
