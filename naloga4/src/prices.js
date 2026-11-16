// Card prices from TCGCSV (TCGplayer data, category 89 = Riftbound) and the
// USD → EUR rate from Frankfurter. Rules for TCGCSV: backend only, at most
// once per day, own User-Agent, 100 ms between requests, check
// last-updated.txt first.

import { readCache, writeCache, sleep, DAY_MS, USER_AGENT } from './cache.js';

const TCGCSV = 'https://tcgcsv.com';
const CATEGORY = 89;
const FRANKFURTER = 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR';

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

async function download(lastUpdated) {
  const groups = (await getJson(`${TCGCSV}/tcgplayer/${CATEGORY}/groups`)).results;
  const usd = {}; // productId → cheapest market price (USD), Normal finish preferred
  for (const g of groups) {
    await sleep(100);
    const prices = (await getJson(`${TCGCSV}/tcgplayer/${CATEGORY}/${g.groupId}/prices`)).results;
    for (const p of prices) {
      const value = p.marketPrice ?? p.lowPrice ?? p.midPrice;
      if (value == null) continue;
      const id = String(p.productId);
      const normal = p.subTypeName === 'Normal';
      const prev = usd[id];
      if (!prev || (normal && !prev.normal) || (normal === prev.normal && value < prev.value)) {
        usd[id] = { value, normal };
      }
    }
  }
  const fx = await getJson(FRANKFURTER);
  return {
    fetchedAt: new Date().toISOString(),
    lastUpdated,
    usdToEur: fx.rates.EUR,
    fxDate: fx.date,
    usd: Object.fromEntries(Object.entries(usd).map(([k, v]) => [k, v.value])),
  };
}

let memo = null;

export async function getPrices() {
  if (memo && Date.now() - Date.parse(memo.fetchedAt) < DAY_MS) return memo;

  let cached = await readCache('prices.json');
  if (!cached || Date.now() - Date.parse(cached.fetchedAt) >= DAY_MS) {
    try {
      const lastUpdated = (await (await fetch(`${TCGCSV}/last-updated.txt`, { headers: { 'User-Agent': USER_AGENT } })).text()).trim();
      if (cached && cached.lastUpdated === lastUpdated) {
        cached.fetchedAt = new Date().toISOString(); // nothing new on TCGCSV
      } else {
        cached = await download(lastUpdated);
        console.log(`TCGCSV: ${Object.keys(cached.usd).length} prices, 1 USD = ${cached.usdToEur} EUR`);
      }
      await writeCache('prices.json', cached);
    } catch (err) {
      if (!cached) {
        console.warn('Prices unavailable:', err.message);
        return { fetchedAt: null, usdToEur: null, usd: {} };
      }
      console.warn('TCGCSV unreachable, using cached prices:', err.message);
    }
  }
  memo = cached;
  return memo;
}

/** Cheapest EUR price over all base printings of a catalog card (variants only as a fallback). */
export function cardPriceEur(card, prices) {
  if (!card || !prices.usdToEur) return null;
  const pick = (ids) => ids.map((id) => prices.usd[id]).filter((v) => v != null);
  const values = pick(card.tcgplayerIds).length ? pick(card.tcgplayerIds) : pick(card.variantIds);
  return values.length ? Math.round(Math.min(...values) * prices.usdToEur * 100) / 100 : null;
}
