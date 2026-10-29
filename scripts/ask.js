// npm run ask -- "<question>" — the whole pipeline: SQL, then the rows or the failing stage.
import { answerQuestion } from '../src/pipeline.js';
import { formatTable } from '../src/table.js';

const question = process.argv.slice(2).join(' ').trim();
if (!question) {
  console.error('usage: npm run ask -- "which genre has the most tracks?"');
  process.exit(1);
}

const result = await answerQuestion(question);
if (result.sql) console.log(`${result.sql}\n`);

if (!result.ok) {
  console.error(
    result.stage === 'refused'
      ? `Can't answer: ${result.error}`
      : `failed at stage "${result.stage}": ${result.error}`
  );
  process.exit(1);
}

console.log(formatTable(result.columns, result.rows));
