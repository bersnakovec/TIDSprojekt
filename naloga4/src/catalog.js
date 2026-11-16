// Card catalog from Riftcodex (https://api.riftcodex.com), cached for 24 h.
// Several printings of the same card (signature, alternate art …) are merged
// into one entry; all their TCGplayer ids are kept for the price lookup.

import { readCache, writeCache, sleep, DAY_MS, USER_AGENT } from './cache.js';

const API = 'https://api.riftcodex.com/cards';
const PAGE_SIZE = 100;

/** "Renata Glasc, Chem-Baroness" and "Renata Glasc - Chem-Baroness" → "renataglascchembaroness" */
export const normName = (name) => name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');

async function fetchAllCards() {
  const items = [];
  for (let page = 1; ; page++) {
    const res = await fetch(`${API}?page=${page}&size=${PAGE_SIZE}`, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) throw new Error(`Riftcodex HTTP ${res.status}`);
    const body = await res.json();
    items.push(...body.items);
    if (page >= body.pages) break;
    await sleep(150);
  }
  return items;
}

const ENTITIES = { '&quot;': '"', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&#39;': "'", '&apos;': "'" };

/** Riftcodex plain text still has HTML entities and paragraphs glued together ("exhausted.While"). */
function cleanText(t) {
  return (t ?? '')
    .replace(/&(quot|amp|lt|gt|apos|#39);/g, (m) => ENTITIES[m])
    .replace(/([.)])(?=[A-Z[:])/g, '$1 ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isVariant(c) {
  const m = c.metadata ?? {};
  return m.signature || m.alternate_art || m.overnumbered || /\((signature|alternate art|overnumbered)\)/i.test(c.name);
}

function buildCatalog(items) {
  const byName = new Map();
  // base printings first, so they define the canonical entry
  const sorted = [...items].sort((a, b) => isVariant(a) - isVariant(b));
  for (const c of sorted) {
    const baseName = c.name.replace(/\s*\((signature|alternate art|overnumbered)\)\s*$/i, '');
    const key = normName(baseName);
    let card = byName.get(key);
    if (!card) {
      card = {
        name: baseName,
        type: c.classification?.type ?? null,
        supertype: c.classification?.supertype ?? null,
        rarity: c.classification?.rarity ?? null,
        domains: c.classification?.domain ?? [],
        energy: c.attributes?.energy ?? null,
        power: c.attributes?.power ?? null,
        might: c.attributes?.might ?? null,
        text: cleanText(c.text?.plain),
        tags: c.tags ?? [],
        set: c.set?.label ?? null,
        image: c.media?.image_url ?? null,
        tcgplayerIds: [],
        variantIds: [],
      };
      byName.set(key, card);
    }
    if (c.tcgplayer_id) (isVariant(c) ? card.variantIds : card.tcgplayerIds).push(String(c.tcgplayer_id));
  }
  return byName;
}

let memo = null;

/** @returns {Promise<{cards: Map<string, object>, fetchedAt: string}>} */
export async function getCatalog() {
  if (memo && Date.now() - Date.parse(memo.fetchedAt) < DAY_MS) return memo;

  let cached = await readCache('cards.json');
  if (!cached || Date.now() - Date.parse(cached.fetchedAt) >= DAY_MS) {
    try {
      const items = await fetchAllCards();
      cached = { fetchedAt: new Date().toISOString(), items };
      await writeCache('cards.json', cached);
      console.log(`Riftcodex: ${items.length} printings downloaded`);
    } catch (err) {
      if (!cached) throw err;
      console.warn('Riftcodex unreachable, using cached catalog:', err.message);
    }
  }
  memo = { fetchedAt: cached.fetchedAt, cards: buildCatalog(cached.items) };
  return memo;
}
