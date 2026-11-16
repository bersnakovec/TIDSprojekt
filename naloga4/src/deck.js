// Decks: tournament decklists from Naloga 2 (data/decklists.json) or a pasted
// list. A deck is resolved against the catalog and prices, and the pool of
// legal replacement cards (same domains as the legend) is built for the prompt.

import fs from 'node:fs';
import path from 'node:path';
import { normName } from './catalog.js';
import { cardPriceEur } from './prices.js';

const SECTIONS = ['legend', 'champion', 'mainDeck', 'battlefields', 'runes', 'sideboard'];
const POOL_TYPES = new Set(['Unit', 'Spell', 'Gear']);
const TYPE_ORDER = { Unit: 0, Spell: 1, Gear: 2 };

const file = path.resolve(import.meta.dirname, '..', 'data', 'decklists.json');
const tournamentDecks = JSON.parse(fs.readFileSync(file, 'utf8')).decklists;

/** Short list for the deck picker. */
export function listDecks() {
  return tournamentDecks.map((d) => ({
    id: d.id,
    event: d.event.replace(/’s? Top Decks$/i, '').trim(),
    date: d.date,
    player: d.player,
    legend: d.legend[0]?.name ?? '?',
    rank: d.info?.legendRank ?? null,
  }));
}

export function findDeck(id) {
  return tournamentDecks.find((d) => d.id === id) ?? null;
}

/**
 * Parses a pasted decklist: lines like "3 Hidden Blade" or "3x Hidden Blade".
 * Optional section headers (Legend, Champion, Main deck, Battlefields, Runes,
 * Sideboard) are recognised; without them sections are inferred from card types.
 */
export function parseDeckText(text, catalog) {
  const deck = { id: 'custom', event: 'Lasten deck', player: null, info: {} };
  for (const s of SECTIONS) deck[s] = [];
  const headers = [
    [/^legend/i, 'legend'], [/^champion/i, 'champion'], [/^(main|deck)/i, 'mainDeck'],
    [/^battlefield/i, 'battlefields'], [/^rune/i, 'runes'], [/^side/i, 'sideboard'],
  ];
  let section = null;
  const unknown = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(\d+)\s*x?\s+(.+)$/i);
    if (!m) {
      const h = headers.find(([re]) => re.test(line));
      if (h) section = h[1];
      continue;
    }
    const quantity = Number(m[1]);
    const name = m[2].replace(/\s*\(.*\)\s*$/, '').trim();
    const card = catalog.get(normName(name));
    if (!card) unknown.push(name);
    let target = section;
    if (!target) {
      target = { Legend: 'legend', Battlefield: 'battlefields', Rune: 'runes' }[card?.type] ?? 'mainDeck';
    }
    deck[target].push({ quantity, name: card?.name ?? name });
  }
  if (!deck.legend.length) throw Object.assign(new Error('V seznamu ni legende (Legend).'), { status: 400 });
  return { deck, unknown };
}

/**
 * Joins a deck with card data and prices, and builds the replacement pool.
 * @param {number} [maxPriceEur] leave out cards whose single copy costs more than this (the budget)
 */
export function resolveDeck(deck, catalog, prices, maxPriceEur = Infinity) {
  const sections = {};
  const missing = [];
  let totalEur = 0;
  let unpriced = 0;

  for (const s of SECTIONS) {
    sections[s] = (deck[s] ?? []).map(({ quantity, name }) => {
      const card = catalog.get(normName(name)) ?? null;
      if (!card) missing.push(name);
      const priceEur = cardPriceEur(card, prices);
      if (s !== 'sideboard') {
        if (priceEur != null) totalEur += priceEur * quantity;
        else if (card?.type !== 'Rune') unpriced++;
      }
      return { quantity, name: card?.name ?? name, card, priceEur };
    });
  }

  const legend = sections.legend[0]?.card;
  const domains = legend?.domains ?? [];
  const inDeck = new Set([...sections.champion, ...sections.mainDeck].map((e) => normName(e.name)));

  // Replacement pool: every unit, spell and gear whose domains all belong to the
  // legend and that fits the budget. Sorted by type and name – not by price, so
  // the model isn't nudged towards the cheapest cards.
  const pool = [...catalog.values()]
    .filter((c) => POOL_TYPES.has(c.type) && !inDeck.has(normName(c.name)))
    .filter((c) => c.domains.length && c.domains.every((d) => domains.includes(d)))
    .map((c) => ({ card: c, priceEur: cardPriceEur(c, prices) }))
    .filter((p) => p.priceEur == null || p.priceEur <= maxPriceEur)
    .sort((a, b) => TYPE_ORDER[a.card.type] - TYPE_ORDER[b.card.type] || a.card.name.localeCompare(b.card.name));

  const count = (s) => sections[s].reduce((a, e) => a + e.quantity, 0);

  return {
    id: deck.id,
    title: deck.player ? `${deck.player} – ${deck.event}` : deck.event,
    event: deck.event,
    date: deck.date ?? null,
    player: deck.player,
    rank: deck.info?.legendRank ?? null,
    legend: sections.legend[0]?.name ?? '?',
    domains,
    sections,
    counts: { mainDeck: count('mainDeck') + count('champion'), runes: count('runes'), battlefields: count('battlefields') },
    totalEur: Math.round(totalEur * 100) / 100,
    unpriced,
    missing,
    pool,
  };
}
