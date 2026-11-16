// RiftVault – Naloga 3
// Express server: serves the frontend and a small JSON API on top of the
// SURS PC-Axis table 0400608S (consumer price indices, ECOICOP ver. 2).

import express from 'express';
import path from 'node:path';
import { getTable, PX_URL, TABLE_ID, TABLE_PAGE } from './surs.js';
import { analyse, getMeta, DEFAULT_CATEGORIES } from './cpi.js';

const PORT = Number(process.env.PORT) || 3000;
const app = express();

app.use(express.static(path.resolve(import.meta.dirname, '..', 'public')));

// Table metadata, categories and info about the last refresh from SURS.
app.get('/api/meta', async (req, res, next) => {
  try {
    const state = await getTable();
    res.json({ tableId: TABLE_ID, pxUrl: PX_URL, tablePage: TABLE_PAGE, ...getMeta(state) });
  } catch (err) { next(err); }
});

// Filtered and aggregated series.
// /api/cpi?cats=09212,TOT&from=2015&to=2026&base=2015&freq=month|year
app.get('/api/cpi', async (req, res, next) => {
  try {
    const state = await getTable();
    const int = (v, fallback) => (Number.isInteger(Number(v)) && v !== '' && v != null ? Number(v) : fallback);
    const cats = typeof req.query.cats === 'string' && req.query.cats
      ? req.query.cats.split(',').map((c) => c.trim()).filter(Boolean)
      : DEFAULT_CATEGORIES;
    const result = analyse(state, {
      cats,
      from: int(req.query.from, 2015),
      to: int(req.query.to, 9999),
      base: int(req.query.base, 2015),
      freq: req.query.freq,
    });
    res.json(result);
  } catch (err) { next(err); }
});

app.use((err, req, res, next) => {
  const status = err.status || 502;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`RiftVault CPI: http://localhost:${PORT}`);
  // Warm up: download and parse the table so the first page load is fast.
  getTable().catch((err) => console.error(err.message));
});
