// npm run print-schema — print the introspected schema of the demo database.
import { DEMO_PATH } from '../src/db/defaultDb.js';
import { getSchema } from '../src/db/schema.js';

const { tables } = getSchema(DEMO_PATH);

console.log(`${DEMO_PATH} — ${tables.length} tables\n`);

for (const table of tables) {
  console.log(`${table.name} (${table.columns.length} columns)`);
  const width = Math.max(...table.columns.map((c) => c.name.length));
  for (const col of table.columns) {
    const flags = [col.pk && 'pk', col.notnull && 'not null'].filter(Boolean).join(' ');
    console.log(`  ${col.name.padEnd(width)}  ${(col.type || '?').padEnd(9)}${flags}`.trimEnd());
  }
  console.log();
}
