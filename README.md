# sql-generator

Ask a database a question in plain English. An LLM writes the SQL, the SQL is validated as
untrusted input against the real schema, then executed read-only and returned as a table.

It ships with the [Chinook](https://github.com/lerocha/chinook-database) sample database (a
digital music store) as the default, and you can upload your own `.sqlite` file.

The interesting part is not the LLM call. It is the two layers that make trusting an LLM near a
database defensible:

- **A validation layer** — LLM output is untrusted input. Parsed, restricted to a single SELECT,
  checked table-by-table and column-by-column against the introspected schema, given a LIMIT, and
  finally run on a read-only connection.
- **An eval harness** — 22 labelled cases graded by *execution accuracy*: run the model's SQL and
  the hand-written gold SQL, compare the result sets. Correct means the same rows, not similar
  SQL.

## Setup

```bash
npm install
cp .env.example .env     # then fill in at least one provider's API key
npm run serve            # http://localhost:3000
npm run stop             # stops the pm2 process
```

Three providers are supported, each behind the same OpenAI-compatible client: **Gemini**
(default), **Groq**, and a **local** model through Ollama. A provider missing any of its three
env vars is simply unavailable, and a request for it falls back to the default. Every response
says which model actually answered.

For the local option, start the model first:

```bash
ollama run qwen2.5-coder:1.5b
```

## Commands

| command | what it does |
|---|---|
| `npm run serve` / `npm run stop` | start / stop the API and web UI under pm2 |
| `npm run ask -- "<question>"` | the whole pipeline in the terminal: the SQL, then the rows |
| `npm run eval` | grade all 22 cases: accuracy, failure taxonomy, per-case table |
| `npm run eval -- --model=groq` | the same, against a named provider |
| `npm run print-schema` | print the introspected schema |
| `npm run ask-sql -- "<question>"` | print the generated SQL without executing it |
| `npm run validate-sql -- "<sql>"` | print `{ ok, sql, errors }` for a SQL string |

## How it works

```
question -> LLM (question + schema + semantic context) -> validate -> execute read-only -> rows
```

Every stage returns one structured result and the pipeline never throws: a failure comes back as
`{ ok: false, stage }` naming the step that stopped it — `generate`, `refused`, `validate`,
`execute`. The UI shows the stage, so a rejected query and a provider outage never look alike.

**The model can say no.** It answers with `{ can_answer, sql, reason }` rather than a bare SQL
string. A question that needs a column the schema does not have (`pay_rate`, `salary`, an email
address) must come back as a refusal naming what is missing. This is the failure the validator
cannot catch: it checks shape, not meaning, so a confident query over the wrong columns would
sail through it and return a wrong number that looks like an answer.

**No customer row data is sent to the model.** The prompt carries schema structure plus
*semantic context* — what "sales" means, how dates are stored, which column points at which
table — which is documentation, not data. Value sampling exists behind an off-by-default
toggle and is not used. To match a value the user names, the model uses `LIKE`, so name and
category matching works without shipping any rows.

## Your own database

Upload a `.sqlite` in the UI and it gets its own tab: introspected, registered, queryable. The
Chinook database is always the first tab and cannot be removed. Files are accepted on their SQLite
magic bytes rather than their filename, opened read-only like everything else, and referenced by
an id — the client never sends a filesystem path.

An uploaded database has no facts sidecar, so the model sees only table and column names. Each
tab has a notes box for that: describe what the columns mean and the description is passed to the
model as clearly fenced, length-capped, **untrusted** context, kept outside the instruction block.
A note can steer which SELECT gets written; it cannot escape the validator.

## Results

22 cases on Chinook, graded by execution accuracy:

| provider | model | accuracy |
|---|---|---|
| Gemini (default) | `gemini-3.6-flash` | 22/22 |

Run `npm run eval -- --model=groq` or `--model=local` to compare other providers.

A small local model (1.5B) is the useful control: in earlier runs it matched text with `=` instead
of `LIKE`, fumbled date formats, and **never refused** — asked for a column that does not exist,
it returned some other column instead. Two of its invented columns were caught by the validator
rather than reaching the user. That is the whole argument for the two layers, measured.

## Documentation

- [`Spec.md`](Spec.md) — what is built and why, module contracts, the roadmap.
- [`DECISIONS.md`](DECISIONS.md) — every design decision, its alternatives, and its trade-off.
- [`CLAUDE.md`](CLAUDE.md) — operating rules for working in this repo.
