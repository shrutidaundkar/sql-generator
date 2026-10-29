# Spec — Text-to-SQL

The authoritative "what to build." `CLAUDE.md` = operating rules; `DECISIONS.md` = the "why"
and the trade-offs. Priority order is **MVP-first** (see Roadmap). Security default:
**no customer row data leaves the process to the LLM.**

## 1. Problem & framing

Instead of a one-off script that answers one fixed question, this builds the general
capability: ask any question in plain English, get correct SQL and results. The engineering value is
not the LLM call; it's the two layers that make trusting an LLM near a database defensible: a
**validation layer** and an **eval harness**.

## 2. Pipeline

`question → LLM (question + schema + semantic context → SQL) → validate (untrusted SQL)
→ execute (read-only) → results`

Every stage returns a structured result; the pipeline never throws to its caller (see §8).
Schema introspection feeds both the prompt and the validator — one source of truth. The eval
harness runs the same generate → validate → execute path offline.

## 3. Module contracts

- `getSchema(dbPath)` → `{ tables: [{ name, columns: [{ name, type, notnull, pk }] }] }`
- `loadFacts(dbPath)` → per-DB semantic-context string (facts sidecar; keeps `prompt.js` DB-agnostic)
- `pathFor(dbId)` → the registered path, or undefined — the only way a request names a database
- `makeClient(modelKey)` → `{ client, model }` for one provider; `availableModels()` lists the
  configured keys, and never exposes their API keys
- `generateSQL(question, schema, opts)` → `{ can_answer, sql, reason }` (structured contract)
- `validateSQL(sql, schema, opts)` → `{ ok, sql, errors }`
- `executeSQL(sql, db)` → `{ columns, rows }`
- pipeline wraps these into `{ ok, stage, question, model, sql, columns, rows, error }`, taking
  `{ dbPath, modelKey, note }` — `model` names the provider that *actually* ran, which is not
  always the one requested (an unknown or unconfigured key falls back to the default).
Each is independently testable. The LLM is mockable so the pipeline and eval run with no network.

## 4. Database

SQLite at `data/chinook.sqlite` — the Chinook sample database (a digital music store). Tables:

```
Artist(ArtistId, Name)
Album(AlbumId, Title, ArtistId)
Track(TrackId, Name, AlbumId, MediaTypeId, GenreId, Composer, Milliseconds, Bytes, UnitPrice)
Genre(GenreId, Name)            MediaType(MediaTypeId, Name)
Playlist(PlaylistId, Name)      PlaylistTrack(PlaylistId, TrackId)
Customer(CustomerId, FirstName, LastName, Company, ..., Country, Email, SupportRepId)
Employee(EmployeeId, LastName, FirstName, Title, ReportsTo, BirthDate, HireDate, ...)
Invoice(InvoiceId, CustomerId, InvoiceDate, BillingAddress, ..., BillingCountry, Total)
InvoiceLine(InvoiceLineId, InvoiceId, TrackId, UnitPrice, Quantity)
```

### Data quirks — get these wrong and results are silently incorrect

- **Dates are TEXT** `'YYYY-MM-DD HH:MM:SS'`. Use half-open ranges
  (`>= '2023-01-01' AND < '2024-01-01'`); `<= '2023-12-31'` silently drops the 31st.
- **Money is US dollars.** "Sales" = `SUM(Invoice.Total)`, which equals the sum of its lines.
- **Implicit relationships:** `Customer.SupportRepId` → `Employee.EmployeeId`;
  `Employee.ReportsTo` → the manager's `EmployeeId` (NULL at the top).
- **Track length** is `Milliseconds`; there is no duration column.
- **Internal tables hidden:** `sqlite_sequence`, any `_*`/`sqlite_*`.

## 5. Validation layer (centerpiece #1)

Treat LLM SQL as untrusted input:

- Parse with `node-sql-parser` (`{ database: 'sqlite' }`); reject anything that doesn't parse.
- SELECT-only: reject INSERT/UPDATE/DELETE/DDL/PRAGMA/ATTACH and multiple statements.
- Every referenced table and column must exist in the introspected schema.
- Enforce a `LIMIT` (inject a default cap when absent).
- Execute on a read-only connection as the final backstop.

Two kinds of check, not to be conflated: **security gates** (single statement, SELECT-only,
read-only connection) bound what is *possible*; **correctness gates** (table/column existence,
LIMIT) fail fast on hallucinations with a clear message. Security comes from the former.
Rejections return a clear reason and are recorded as eval failures, not crashes.

## 6. LLM adapter & prompt (security-first)

The prompt contains schema structure + **static semantic context** only: the date-format
note, what "sales" means, the implicit relationships, and a single-SELECT / no-markdown
instruction. It does **not** contain sampled row values. The semantic context is not hardcoded —
it is loaded per database from a facts sidecar (`data/chinook.facts.md` via `loadFacts()`), so
`prompt.js` stays database-agnostic (D20).

**Response contract.** The model returns a small JSON object, not a bare SQL string:
`{ can_answer, sql, reason }`. If the question is answerable from the schema, `can_answer` is
true and `sql` is set. If it references a column, attribute, or metric not in the schema, the
model must set `can_answer` false and name what's missing in `reason` — it must NOT invent a
query over unrelated columns. The pipeline surfaces a refusal as `stage: 'refused'` (§8). The
object is deliberately extensible: Phase 2 adds `explanation`, `assumptions`, and a
clarification field additively, without changing existing consumers.

To match a user-named text value of an **existing** text column (a name, genre, country),
the model uses `column LIKE '%value%'` (case-insensitive), not `=`, except for known
status/enum values — this keeps name and category matching working without shipping data and
scales to any DB size. LIKE applies only to values of columns that exist; a missing column is a
refusal, not a value to fuzzy-match (this is what let the earlier `pay_rate` question misfire).

Value injection (sampling actual column values into the prompt) lives behind an off-by-default
toggle `includeValueHints`; it is not used in the MVP or in eval.

Distinction to hold: **semantic context** (what a status code *means*) is documentation and is
safe to send; **sampled row values** are data and are not sent.

Model access is behind one function via an OpenAI-compatible client (Groq / Llama 3.3 70B by
default), temperature 0, config from env. Mockable for tests.

## 7. Value handling — now vs later

- **MVP (now):** LIKE-based fuzzy matching, no data in the prompt. Trade-off: LIKE can
  over-match and cannot rank candidates.
- **Later (v2):** a value-resolution lookup loop — on-demand fuzzy match against the DB,
  ranked, to disambiguate precisely — gated by a per-column allowlist so sensitive columns
  (PII) are never queried or sent to the model. (DECISIONS D14, D15)

## 8. Error handling (MVP posture: fail soft, structured)

- The LLM call has a 30s timeout **per attempt**, and a bounded retry sits behind it: 3 attempts
  with ~0.5s/1s jittered backoff, on transient transport failures only — connection errors,
  timeouts, HTTP 429/5xx (D30, pulled forward from D23). Outcomes are never retried: a refusal, a
  validation rejection and a wrong answer all stand as they are. A provider that is genuinely
  down still surfaces as a clear `error` on the result after the last attempt, not a crash.
- A model refusal (`can_answer:false`) is a first-class outcome: `stage:'refused'` with the
  model's `reason`. This is the honest failure for a question that can't map to the schema —
  the confident-wrong-number case the validator cannot see (it checks shape, not meaning).
- A validation rejection is a normal `{ ok:false, errors }` result, not an exception.
- Execution errors are caught and returned with the failing SQL.
- The pipeline never throws to its caller; the API maps a result to an HTTP status and the UI
  renders the message. The failing stage is named — the same taxonomy the eval harness reports.

## 9. Eval harness (centerpiece #2)

- **22 labelled cases shipped** (target ~40): `{ question, goldSql }`. Every gold query is
  hand-written and run against `data/chinook.sqlite` before its case is accepted, to confirm the
  question has exactly one defensible answer — a question with a tie, or one whose output shape
  is open to interpretation, measures nothing and is rewritten or dropped.
- **Execution accuracy:** run generated SQL and gold SQL, compare result sets (order-insensitive
  where appropriate). Correct = same rows. Column *names* are not compared, column count is.
- **The model is selectable per run** (`npm run eval -- --model=<key>`), so accuracy can be
  compared across providers. The harness refuses an unconfigured provider rather than falling
  back the way the API does: a run labelled with one provider that silently used another is a
  wrong number. Each failure prints its case id, stage and the SQL produced, so a transient
  provider blip is distinguishable from a real wrong answer without re-running.
- Report overall accuracy + a failure taxonomy: refused / rejected-by-validator / invalid-SQL /
  ran-but-wrong. Report honestly, including failures. Eval runs with value injection OFF (the
  secure default), so metrics reflect the real MVP capability and LIKE-ambiguity failures show up.
  The response contract (§6) *reduces* ran-but-wrong by letting the model refuse clear cases; eval
  *measures* the residual it can't self-catch — prevention and measurement are complementary.
- Cases cover counts, filters, top-N with no tie at the boundary, multi-table joins, a
  many-to-many, a self-join, date ranges, NULL handling, and 4 refusals whose trap is a
  similar column on the wrong table. Gold SQL is hand-written in `eval/cases.js`.
- Gold cases use **absolute** date ranges (e.g. `2023-01-01 .. 2024-01-01`), never
  "now"-relative predicates: the data is fixed in time while "now" moves.

## 10. Schema access & metadata

- **MVP:** introspect once and cache the schema in memory (not per query). No catalog DB.
- **Shipped alongside it:** an in-memory **registry** mapping `dbId` → path, holding the demo DB
  plus every database found in `data/uploads/` at boot. A request names a database by key only;
  a path is not a key, so an uploaded DB cannot be addressed by its location. This is the
  minimum the catalog will replace, not a parallel design.
- **Later:** a small SQLite **metadata catalog**, created on first run, registering databases
  (chinook.sqlite as default) and storing cached schema + per-column security flags + per-DB
  semantic profiles. It unifies schema caching, the PII allowlist (§7), and prompt/DB
  decoupling (§11) in one structure. (DECISIONS D17)

## 11. Prompt / DB coupling

- **Partly shipped:** the DB-specific semantic context (enum meanings, date format, derived
  states, safe vocabularies) lives in a per-database *facts sidecar* (`data/chinook.facts.md`,
  loaded by `loadFacts()`), so `prompt.js` is already database-agnostic (D20).
- **Also shipped — user-authored notes.** An uploaded DB has no sidecar, so each one has an
  optional note field in the UI describing what its columns mean. Two sources, two trust levels,
  never conflated: the sidecar is operator-authored and trusted like code; the note is
  user-authored, so it is fenced, labelled untrusted, capped at 2000 characters, and placed
  *before* the instruction block so the rules remain the last thing the model reads (D28). A
  note can steer which SELECT is written; it cannot escape the validator.
- **Later:** fold these annotations into the metadata catalog (§10) so each registered/uploaded
  DB carries its own, alongside cached schema and per-column security flags.

## 12. Demo DB behavior

`data/chinook.sqlite` is committed and opened read-only (`readonly: true, fileMustExist: true`),
so the app can't modify or delete it and it's always the boot default. A deletion in a checkout
is recoverable with `git restore`. Future uploads go to `data/uploads/`, never the demo.

## 13. Roadmap (MVP-first)

**Done:** DB foundation; LLM adapter.

**Phase 1 — MVP (secure, end-to-end, demoable): COMPLETE.**
- ✅ Validation layer (centerpiece #1)
- ✅ Executor + wire generate → validate → execute, with fail-soft error handling (§8)
- ✅ Prompt = schema + semantic context + LIKE; value injection off (§6)
- ✅ Structured LLM response contract `{ can_answer, sql, reason }` with a `refused` stage (§6, §8)
- ✅ HTTP API
- ✅ Minimal frontend (query box, results table, error display; no fluff)
- ✅ Eval harness (centerpiece #2)
- ✅ In-memory schema cache (§10)

**Pulled forward out of order** (each has its own decision entry, and each was pulled because
measurement demanded it, not because it was next):
- ✅ Per-request model choice across three providers, and cross-model eval (D25 wanted model
  choice to be eval-driven; that needs the eval to accept a model).
- ✅ Bounded retry with backoff (D30) — was Phase 2. Transport flakiness was corrupting the
  centerpiece metric: a different case failed each run, so the number measured the network.
- ✅ Upload a `.sqlite` → introspect → register → query, with per-DB tabs (D28) — was Phase 5.
  The `.csv` half and the per-column security flags are still Phase 5.

**Phase 2 — decouple & explain:** per-DB semantic profile (§11); extend the response contract
with `explanation` + `assumptions` (additive) and show them to the user — surfacing assumptions
is transparency + safety. *(Bounded retry/backoff: done early, see D30.)*

**Phase 3 — security & data-exposure:** metadata catalog DB (§10) with a per-column PII
allowlist enforced end-to-end.

**Phase 4 — smarter values:** value-resolution lookup loop (§7), gated by the allowlist.

**Phase 5 — reach:** upload-your-own-data — *the `.sqlite` path is shipped (§10, D28)*; still to
do: CSV import, per-column security flags on uploaded DBs, and follow-up questions.

## 14. Constraints / non-goals

- Security-first default: no customer row data sent to the LLM in the MVP.
- Incremental, vertical-slice build; only what each phase needs (no speculative code).
- No ORM / Prisma. Frontend intentionally minimal. Few dependencies, each justified.