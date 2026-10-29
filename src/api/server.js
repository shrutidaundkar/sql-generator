// npm run serve — POST /ask, database registry endpoints, plus public/ as static files.
import { randomUUID } from 'node:crypto';
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';
import {
  DEMO_ID,
  UPLOAD_DIR,
  forget,
  listDbs,
  pathFor,
  register,
  scanUploads,
} from '../db/registry.js';
import { answerQuestion } from '../pipeline.js';

const PORT = process.env.PORT || 3000;
const MAX_UPLOAD = '20mb';

/** Every SQLite file starts with these 16 bytes. Stricter than trusting the filename. */
const SQLITE_MAGIC = Buffer.from('SQLite format 3\0', 'latin1');

const app = express();
app.use(express.json());
app.use(express.static('public'));

/** The filename is only ever displayed, never used to build a path, so it just has to print. */
const displayName = (name, fallback) =>
  String(name ?? '')
    .replace(/[^\w .\-()]/g, '')
    .trim()
    .slice(0, 60) || fallback;

/** Databases the client may name, with their tables. */
app.get('/dbs', (req, res) => res.json({ dbs: listDbs(), demoId: DEMO_ID }));


app.post('/upload', express.raw({ type: '*/*', limit: MAX_UPLOAD }), (req, res) => {
  const bytes = req.body;
  if (!Buffer.isBuffer(bytes) || !bytes.subarray(0, 16).equals(SQLITE_MAGIC)) {
    return res.status(400).json({ error: 'That is not a SQLite database file.' });
  }

  const dbId = `${randomUUID()}.sqlite`;
  const path = join(UPLOAD_DIR, dbId);
  mkdirSync(UPLOAD_DIR, { recursive: true });
  writeFileSync(path, bytes);

  try {
    res.json(register(dbId, path, displayName(req.query.name, dbId)));
  } catch (error) {
    unlinkSync(path);
    res.status(400).json({ error: error.message });
  }
});

/** Removes it from the picker only*/
app.delete('/dbs/:dbId', (req, res) => {
  if (req.params.dbId === DEMO_ID) {
    return res.status(400).json({ error: 'The demo database cannot be removed.' });
  }
  if (!forget(req.params.dbId)) return res.status(404).json({ error: 'unknown database' });
  res.json({ ok: true });
});

/**
 * Every handled outcome is 200, including a refusal or a rejected query
 */
app.post('/ask', async (req, res) => {
  const question = String(req.body?.question ?? '').trim();
  if (!question) return res.status(400).json({ error: 'question is required' });

  // A model key only 
  const modelKey = String(req.body?.model ?? '');

  const dbPath = pathFor(String(req.body?.dbId ?? DEMO_ID));
  if (!dbPath) return res.status(400).json({ error: 'unknown database' });

  // The user's description of this DB. Untrusted 
  const note = String(req.body?.note ?? '');

  res.json(await answerQuestion(question, { modelKey, dbPath, note }));
});

const found = scanUploads();
app.listen(PORT, () => {
  console.log(`http://localhost:${PORT}`);
  for (const db of found) console.log(`  loaded ${db.label} (${db.tables.length} tables)`);
});
