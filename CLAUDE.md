# CLAUDE.md

Context for Claude Code. Read this and `Spec.md` before doing anything. `DECISIONS.md`
records *why* each choice was made and is the source of truth in the
repo. Don't edit it as a side effect of code changes — but DO flag when the code and
`DECISIONS.md` drift; surfacing that drift is exactly the right move.

## What this project is

A text-to-SQL tool: a plain-English question is turned into SQL by an LLM, the SQL is
validated as untrusted input against the real schema, then executed read-only and returned
as a table. Any question about the loaded database is just something you type. Full detail
is in `Spec.md`.

## Stack

- Node.js + JavaScript (no TypeScript unless asked).
- `better-sqlite3` (pinned to v11 — see D10) for all database access. No ORM, no Prisma.
- `node-sql-parser` for validating LLM SQL; `openai` + `dotenv` for the model call.
- `express` for the API and static UI. No frontend framework, no CDN, no build step.
- Three OpenAI-compatible providers behind one client, chosen per request: `GEMINI_LLM_*`
  (default), `GROQ_LLM_*`, `LOCAL_LLM_*` (Ollama). See `.env.example`.
- Default SQLite database at `data/chinook.sqlite` (the Chinook sample music store).

## How to work here (important)

- Build ONLY what the current step asks for. No speculative code, no "we'll need this
  later" abstractions, no extra files. When in doubt, do less.
- Do not add a dependency without first saying so and why.
- Simple and readable beats clever. Small, single-purpose modules.
- Never write to the database. Every connection is read-only.
- Treat any LLM-generated SQL as untrusted input.
- Match existing style; don't reformat files you weren't asked to touch.
- If a request conflicts with `Spec.md`, stop and ask.

## Project structure

- `src/db/` — connection, default-DB resolution, schema introspection (+ cache), per-DB facts,
  value sampling, executor, registry (`dbId` → path; the Chinook DB plus a boot scan of
  `data/uploads/`)
- `src/llm/` — LLM adapter: models(provider registry), prompt builder, `generateSQL`
- `src/validate/` — validation layer
- `src/pipeline.js` — `answerQuestion()`: generate → validate → execute, one structured result
- `src/table.js` — fixed-width text table, shared by `scripts/ask.js` and the eval harness
- `src/api/` — HTTP endpoints: `POST /ask`, `GET /dbs`, `POST /upload`, `DELETE /dbs/:dbId`
- `public/index.html` — the whole frontend: DB tabs, model picker, per-DB notes, results table
- `data/chinook.sqlite` — fixed, read-only default database (committed)
- `data/chinook.facts.md` — its semantic facts, loaded into the prompt (committed)
- `data/uploads/` — uploaded databases, scanned at boot (gitignored)
- `scripts/` — dev utilities (print-schema, ask-sql, validate-sql)
- `eval/` — labelled cases, result comparison, harness

## Commands

- `npm run print-schema` — print the introspected schema
- `npm run ask-sql -- "<question>"` — print the SQL the LLM generates (no execution)
- `npm run validate-sql -- "<sql>"` — print `{ ok, sql, errors }` for a SQL string
- `npm run ask -- "<question>"` — the whole pipeline: SQL, then the rows or the failing stage
- `npm run eval` — grade every labelled case: accuracy, failure taxonomy, per-case table
- `npm run eval -- --model=<gemini|groq|local>` — the same, against one named provider. Unlike
  the API, the harness *refuses* an unconfigured key instead of falling back — a run labelled
  `groq` that quietly used gemini would be a wrong number.
- `npm run serve` / `npm run stop` — start / stop the API + UI under pm2

(More will be added as the project grows.)

## Data facts you MUST respect

These are here for *your* benefit. The copy the **model** sees is `data/chinook.facts.md`, loaded
per-database by `loadFacts()` — never hardcode them into `src/llm/prompt.js`, which must stay
database-agnostic. Change one, change both.

- 11 tables: `Artist`, `Album`, `Track`, `Genre`, `MediaType`, `Playlist`,
  `PlaylistTrack`, `Customer`, `Employee`, `Invoice`, `InvoiceLine`. Ignore internal tables
  (`sqlite_sequence`, and anything starting with `_` or `sqlite_`).
- Dates (`InvoiceDate`, `BirthDate`, `HireDate`) are **TEXT** `'YYYY-MM-DD HH:MM:SS'`. Use
  half-open ranges: `>= '2023-01-01' AND < '2024-01-01'`. `<= '2023-12-31'` drops the 31st.
- Money is US dollars. "Sales" = `SUM(Invoice.Total)`.
- `Customer.SupportRepId` → `Employee.EmployeeId`; `Employee.ReportsTo` → the manager's
  `EmployeeId`.
- Track length is `Track.Milliseconds`.

## Current step

See the roadmap in `Spec.md`. Do the step the human names — nothing beyond it.