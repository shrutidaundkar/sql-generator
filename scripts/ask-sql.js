// npm run ask-sql -- "<question>" — print the LLM's raw { can_answer, sql, reason }.
// No validation, no execution.
import { DEMO_PATH } from '../src/db/defaultDb.js';
import { getSchema } from '../src/db/schema.js';
import { factsPathFor, loadFacts } from '../src/db/facts.js';
import { generateSQL } from '../src/llm/generateSQL.js';

const question = process.argv.slice(2).join(' ').trim();
if (!question) {
  console.error('usage: npm run ask-sql -- "how many invoices were issued in 2023?"');
  process.exit(1);
}

const facts = loadFacts(DEMO_PATH);
if (!facts) {
  // stderr, so stdout stays SQL-only
  console.error(`warning: no facts at ${factsPathFor(DEMO_PATH)} — the model has no semantic context`);
}

console.log(JSON.stringify(await generateSQL(question, getSchema(DEMO_PATH), { facts }), null, 2));
