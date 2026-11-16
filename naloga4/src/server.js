// RiftVault – Naloga 4: LLM deck advisor.
// GET  /api/decks   tournament decks for the picker (+ form options)
// GET  /api/deck    one resolved deck (cards, prices, value)
// POST /api/advice  builds the prompt from the form, asks Claude, returns DeckAdvice

import './env.js'; // first: loads .env before llm.js reads the API key
import express from 'express';
import path from 'node:path';
import { getCatalog } from './catalog.js';
import { getPrices } from './prices.js';
import { listDecks, findDeck, parseDeckText, resolveDeck } from './deck.js';
import { SYSTEM_PROMPT, buildUserPrompt, EXPERIENCE, GOALS, STYLES, LANGUAGES } from './prompt.js';
import { askModel, estimateCostUsd, MODEL, MOCK } from './llm.js';
import { DeckAdvice, DeserializationError } from './models.js';

const PORT = Number(process.env.PORT) || 3000;
const app = express();
app.use(express.json({ limit: '50kb' }));
app.use(express.static(path.resolve(import.meta.dirname, '..', 'public')));

const badRequest = (msg) => Object.assign(new Error(msg), { status: 400 });

async function loadData() {
  const [{ cards }, prices] = await Promise.all([getCatalog(), getPrices()]);
  return { catalog: cards, prices };
}

app.get('/api/decks', (req, res) => {
  res.json({
    model: MOCK ? 'mock' : MODEL,
    mock: MOCK,
    decks: listDecks(),
    options: { experience: Object.keys(EXPERIENCE), goal: Object.keys(GOALS), styles: Object.keys(STYLES), language: Object.keys(LANGUAGES) },
  });
});

app.get('/api/deck', async (req, res, next) => {
  try {
    const raw = findDeck(String(req.query.id));
    if (!raw) throw badRequest('Deck ne obstaja.');
    const { catalog, prices } = await loadData();
    const { pool, ...deck } = resolveDeck(raw, catalog, prices);
    res.json({ ...deck, poolSize: pool.length, fx: { usdToEur: prices.usdToEur, date: prices.fxDate } });
  } catch (err) { next(err); }
});

/** Validates and normalises the form input (never trust the browser). */
function readInput(body) {
  const pick = (v, allowed, fallback) => (allowed.includes(v) ? v : fallback);
  const budget = Number(body.budgetEur);
  const swapCount = Number(body.swapCount);
  if (!Number.isFinite(budget) || budget < 0 || budget > 1000) throw badRequest('Proračun mora biti med 0 in 1000 €.');
  if (!Number.isInteger(swapCount) || swapCount < 1 || swapCount > 5) throw badRequest('Število zamenjav mora biti med 1 in 5.');
  return {
    deckId: typeof body.deckId === 'string' ? body.deckId : null,
    deckText: typeof body.deckText === 'string' ? body.deckText.slice(0, 5000) : null,
    budgetEur: Math.round(budget * 100) / 100,
    swapCount,
    experience: pick(body.experience, Object.keys(EXPERIENCE), 'intermediate'),
    goal: pick(body.goal, Object.keys(GOALS), 'local'),
    language: pick(body.language, Object.keys(LANGUAGES), 'sl'),
    styles: Array.isArray(body.styles) ? body.styles.filter((s) => s in STYLES) : [],
    notes: typeof body.notes === 'string' ? body.notes.replace(/[<>]/g, '').trim().slice(0, 300) : '',
  };
}

app.post('/api/advice', async (req, res, next) => {
  try {
    const input = readInput(req.body ?? {});
    const { catalog, prices } = await loadData();

    let raw;
    let unknown = [];
    if (input.deckText) {
      ({ deck: raw, unknown } = parseDeckText(input.deckText, catalog));
    } else {
      raw = findDeck(input.deckId);
      if (!raw) throw badRequest('Izberi deck ali prilepi seznam kart.');
    }
    const deck = resolveDeck(raw, catalog, prices, input.budgetEur);

    // 1) dynamic prompt
    const user = buildUserPrompt(deck, input);

    // 2) LLM call with a JSON schema
    const t0 = Date.now();
    const answer = await askModel(SYSTEM_PROMPT, user, deck, input);
    const ms = Date.now() - t0;

    // 3) JSON → classes
    let json;
    try {
      json = JSON.parse(answer.text);
    } catch {
      throw new DeserializationError('$', 'veljaven JSON', answer.text.slice(0, 60));
    }
    const advice = DeckAdvice.fromJSON(json, deck, { catalog, prices, budgetEur: input.budgetEur });

    res.json({
      advice,
      deck: { title: deck.title, legend: deck.legend, domains: deck.domains, totalEur: deck.totalEur, unknown },
      llm: { model: answer.model, mock: answer.mock, usage: answer.usage, costUsd: estimateCostUsd(answer.model, answer.usage), ms },
      prompt: { system: SYSTEM_PROMPT, user },
      rawJson: answer.text,
    });
  } catch (err) { next(err); }
});

app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`RiftVault deck advisor: http://localhost:${PORT}  (${MOCK ? 'TESTNI NAČIN – brez API ključa' : `model ${MODEL}`})`);
  loadData().catch((err) => console.error('Data warm-up failed:', err.message));
});
