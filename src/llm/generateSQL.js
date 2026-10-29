import { makeClient } from './models.js';
import { buildPrompt } from './prompt.js';

/** Models wrap their answer in ```json however firmly the prompt says not to. */
function stripFences(text) {
  const fenced = text.match(/```(?:\w+)?\s*([\s\S]*?)```/);
  return (fenced ? fenced[1] : text).trim();
}

/** Enough of the model's text to see what went wrong, not enough to flood a log. */
const snippet = (text) => text.slice(0, 200);

/**
 * Read the model's `{ can_answer, sql, reason }` reply. Anything of the wrong shape throws,
 * because half-understanding the answer is worse than failing.
 *
 * @param {string} text raw message content
 * @returns {{ can_answer: boolean, sql: string|null, reason: string|null }}
 * @throws {Error} if the text is not JSON, or is JSON of the wrong shape
 */
function parseAnswer(text) {
  const raw = stripFences(text);

  let answer;
  try {
    answer = JSON.parse(raw);
  } catch {
    throw new Error(`Model did not return JSON: ${snippet(raw)}`);
  }

  const { can_answer, sql = null, reason = null } = answer ?? {};
  if (typeof can_answer !== 'boolean') {
    throw new Error(`Model response has no boolean can_answer: ${snippet(raw)}`);
  }
  if (can_answer && typeof sql !== 'string') {
    throw new Error(`Model said can_answer true but gave no sql string: ${snippet(raw)}`);
  }
  if (!can_answer && typeof reason !== 'string') {
    throw new Error(`Model said can_answer false but gave no reason string: ${snippet(raw)}`);
  }

  return { can_answer, sql, reason };
}

/**
 * Ask the model a question. The `sql` it returns is untrusted text — always pass it through
 * validateSQL() before running it.
 *
 * @param {string} question plain English
 * @param {object} schema from getSchema()
 * @param {object} [options] `modelKey` picks the provider; the rest is forwarded to
 *   buildPrompt(): { facts, includeValueHints, valueHints }
 * @param {{ client: object, model: string }} [provider] inject a mock to run offline
 * @returns {Promise<{ can_answer: boolean, sql: string|null, reason: string|null }>}
 * @throws {Error} on a provider error, or a response that breaks the contract
 */
export async function generateSQL(
  question,
  schema,
  options = {},
  provider = makeClient(options.modelKey)
) {
  const response = await provider.client.chat.completions.create({
    model: provider.model,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: buildPrompt(question, schema, options),
  });
  return parseAnswer(response.choices[0]?.message?.content ?? '');
}
