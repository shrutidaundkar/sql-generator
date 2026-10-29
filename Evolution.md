# Project

- The danger with an LLM writing SQL isn't a crash — it's a query that runs clean and returns a plausible wrong number.
----------------
## Build timeline
- DB foundation — read-only connection, immutable demo DB
- LLM adapter — one swappable OpenAI-compatible function
- Validation layer  — parse, SELECT-only, 
- Pipeline — generate → validate → execute 
- Eval harness  — labelled cases, execution accuracy
- API + UI — Express /ask, one HTML
- Enhancements — model picker; upload-your-own-DB.
-----------------
## Pivots — where the design changed (the interesting part)
- Value injection: ON → OFF. 
- Semantic context: hardcoded → sidecar. 
- Response contract: bare SQL → structured. 
- Derived states pinned in the facts file, not left to the model.
- Eval comparison: labels → values → fixed. Compared column names (too strict) → 
- Model: Groq 70B → local → Gemini Flash. 
------------------
## Prompt evolution
- v1 — "return one SELECT statement, nothing else."
- v2 — + semantic context , loaded from the facts sidecar.
- v3 — + "match text values with col LIKE '%value%'" (no injected row values).
- v4 — structured JSON {can_answer, sql, reason}; refuse columns that don't exist.
- v5 — ordered the decision: a named person/place/category is a value (answerable) first; only then ask whether a column exists — this stopped the model over-refusing valid questions.
------------------
## Command evolution
print-schema → ask-sql (SQL only, no execution) → validate-sql → ask (full pipeline) → eval → serve / stop.
```
npm run eval

npm run print-schema

npm run ask-sql -- "how many invoices were issued in 2023?"

npm run ask -- "which genre has the most tracks?"

npm run validate-sql -- "DROP TABLE Track"


```
## Example questions (Chinook)
- Which country 3 countries produce the highest total sales by volume, list countries and their produce

- Who reports to whom in the Employee organizational hierarchy?

- What is the average dollar amount spent per invoice, and how does it vary across regions?

- How many customers per country have not placed an order in the last 6 months of available database records?
-------------------

## What each layer guarantees (one line each)
- Read-only connection — no write can ever happen.
- Validator — only a single, real-table/column, LIMIT-capped SELECT reaches execution. 
- Eval — turns questions into a number, and surfaces the ran-but-wrong cases nothing else can catch.
