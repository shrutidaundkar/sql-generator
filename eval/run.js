// npm run eval [-- --model=groq] — grade every labelled case offline through answerQuestion().
// No HTTP. The model defaults to the pipeline's default provider.
import { openReadOnly } from '../src/db/connection.js';
import { DEMO_PATH } from '../src/db/defaultDb.js';
import { executeSQL } from '../src/db/executeSQL.js';
import { availableModels, resolveModelKey } from '../src/llm/models.js';
import { answerQuestion } from '../src/pipeline.js';
import { formatTable } from '../src/table.js';
import { cases } from './cases.js';
import { sameResult } from './compare.js';

/** Listed in full so a count of 0 still prints — an empty bucket is information too. */
const TAXONOMY = [
  'correct',
  'refused-wrongly',
  'rejected-by-validator',
  'invalid-SQL',
  'execution-error',
  'generate-error',
  'ran-but-wrong',
];

/** Why a result did not match gold — enough to act on without printing both result sets. */
function describeDiff(got, gold) {
  const columns = (result) => `[${result.columns.join(', ')}]`;
  // Compare values only, so we can say whether a column mismatch is cosmetic or a wrong answer.
  const values = (result) => JSON.stringify(result.rows.map((row) => Object.values(row)).sort());

  if (columns(got) !== columns(gold)) {
    const verdict = values(got) === values(gold) ? 'values identical' : 'values differ too';
    return `columns ${columns(got)} vs gold ${columns(gold)} — ${verdict}`;
  }
  if (got.rows.length !== gold.rows.length) {
    return `${got.rows.length} rows vs gold ${gold.rows.length}`;
  }
  return `same shape, different values: ${JSON.stringify(got.rows[0])} vs gold ${JSON.stringify(gold.rows[0])}`;
}

/** A failure that never reached execution is named after the stage that stopped it. */
function stageOutcome({ stage, error }) {
  if (stage === 'refused') return 'refused-wrongly';
  if (stage === 'validate') {
    return error.startsWith('Not valid SQLite') ? 'invalid-SQL' : 'rejected-by-validator';
  }
  if (stage === 'execute') return 'execution-error';
  return 'generate-error'; // 'generate' and 'setup': no SQL was ever produced
}

/**
 * Grade one case.
 *
 * @returns {{ outcome: string, detail: string }} outcome is one of TAXONOMY
 */
function grade(expect, result, db) {
  if (expect.type === 'refused') {
    if (result.stage === 'refused') return { outcome: 'correct', detail: result.error };
    // Only a real answer counts against the model: a provider error is not a wrong answer.
    if (result.stage !== 'done') return { outcome: stageOutcome(result), detail: result.error };
    return { outcome: 'ran-but-wrong', detail: 'answered a question the schema cannot support' };
  }

  if (result.stage !== 'done') return { outcome: stageOutcome(result), detail: result.error };

  const gold = executeSQL(expect.sql, db);
  if (sameResult(result, gold)) return { outcome: 'correct', detail: '' };
  return { outcome: 'ran-but-wrong', detail: describeDiff(result, gold) };
}

// ponytail: fixed 6s pace, because Groq's free tier allows 12k tokens/minute and a run is about
// 12k. Without it the second half of every run gets rate-limited. Read the provider's
// rate-limit headers instead, or drop this, once the account has a real quota.
const PACE_MS = 6000;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Which provider this run measures. answerQuestion() falls back to the default for an
// unconfigured key, which is fine for a user's question but wrong for a benchmark: a run
// labelled "groq" that quietly used gemini is a wrong number. So refuse instead.
const requested = process.argv.find((arg) => arg.startsWith('--model='))?.slice('--model='.length);
const modelKey = requested ?? process.env.EVAL_MODEL ?? resolveModelKey();
if (!availableModels().includes(modelKey)) {
  console.error(
    `Model "${modelKey}" is not configured. Available: ${availableModels().join(', ') || '(none)'}`
  );
  process.exit(1);
}
console.log(`model: ${modelKey}\n`);

const db = openReadOnly(DEMO_PATH);
const results = [];
try {
  for (const testCase of cases) {
    await pause(PACE_MS);
    const result = await answerQuestion(testCase.question, { db, modelKey });
    const { outcome, detail } = grade(testCase.expect, result, db);
    results.push({ id: testCase.id, expected: testCase.expect.type, result, outcome, detail });
  }
} finally {
  db.close();
}

const correct = results.filter((r) => r.outcome === 'correct').length;
console.log(`accuracy: ${correct}/${results.length} (${Math.round((correct / results.length) * 100)}%)\n`);

console.log('taxonomy');
console.log(
  formatTable(
    ['outcome', 'n'],
    TAXONOMY.map((outcome) => ({ outcome, n: results.filter((r) => r.outcome === outcome).length }))
  )
);

console.log('\nper case');
console.log(
  formatTable(
    ['id', 'expected', 'stage', 'outcome', 'pass'],
    results.map((r) => ({
      id: r.id,
      expected: r.expected,
      stage: r.result.stage,
      outcome: r.outcome,
      pass: r.outcome === 'correct' ? 'PASS' : 'FAIL',
    }))
  )
);

// Stage and SQL are printed with every failure, so a provider blip can be told apart from a real
// wrong answer without re-running the case.
const failures = results.filter((r) => r.outcome !== 'correct');
if (failures.length > 0) {
  console.log('\nfailures');
  for (const failure of failures) {
    console.log(`  case ${failure.id} [${failure.outcome}] stage=${failure.result.stage}`);
    console.log(`    detail: ${failure.detail}`);
    console.log(`    sql: ${failure.result.sql ?? '(none produced)'}`);
  }
}
