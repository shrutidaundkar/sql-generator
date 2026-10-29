import 'dotenv/config';
import OpenAI from 'openai';

/**
 * The providers a request may pick from, and the env prefix each one reads. All three speak the
 * OpenAI format, so one client covers them. API keys never leave this module.
 */
const PROVIDERS = { gemini: 'GEMINI', groq: 'GROQ', local: 'LOCAL' };

/** Used when the request names no model, an unknown one, or one with no env config. */
export const DEFAULT_MODEL_KEY = 'gemini';

/** A provider missing any of its three vars is unavailable, which is not an error. */
function configFor(modelKey) {
  const prefix = PROVIDERS[modelKey];
  if (!prefix) return null;
  const baseUrl = process.env[`${prefix}_LLM_BASE_URL`];
  const apiKey = process.env[`${prefix}_LLM_API_KEY`];
  const model = process.env[`${prefix}_LLM_MODEL`];
  return baseUrl && apiKey && model ? { baseUrl, apiKey, model } : null;
}

/** Model keys that are fully configured. Never exposes the API keys themselves. */
export function availableModels() {
  return Object.keys(PROVIDERS).filter((modelKey) => configFor(modelKey));
}

/**
 * The model key that will actually be used. Unknown or unconfigured falls back to the default,
 * so callers can report the model that ran instead of the one that was asked for (D33).
 *
 * @param {string} [modelKey]
 * @returns {string}
 */
export function resolveModelKey(modelKey) {
  return configFor(modelKey) ? modelKey : DEFAULT_MODEL_KEY;
}

/**
 * Build the client for one provider.
 *
 * @param {string} [modelKey] 'gemini' | 'groq' | 'local'; anything else resolves to the default
 * @returns {{ client: OpenAI, model: string }}
 * @throws {Error} if even the default provider has no env config
 */
export function makeClient(modelKey) {
  const resolved = resolveModelKey(modelKey);
  const config = configFor(resolved);
  if (!config) {
    const prefix = PROVIDERS[resolved];
    throw new Error(
      `No config for model "${resolved}". Set ${prefix}_LLM_BASE_URL, ${prefix}_LLM_API_KEY and ` +
        `${prefix}_LLM_MODEL in .env (see .env.example).`
    );
  }
  // maxRetries is the whole retry policy (D30). The SDK already does what we want: it retries
  // connection errors, timeouts and HTTP 408/409/429/5xx with ~0.5s then ~1s backoff, and never
  // retries a 200 — so a refusal or a wrong answer stands as the answer.
  //
  // timeout is per attempt, so a dead provider takes ~3x30s to fail instead of 30s.
  const client = new OpenAI({
    baseURL: config.baseUrl,
    apiKey: config.apiKey,
    timeout: 30_000,
    maxRetries: 2,
  });
  return { client, model: config.model };
}
