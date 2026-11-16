// Classes the LLM's JSON answer is deserialised into.
// fromJSON() checks types and required fields (throws DeserializationError),
// then checks the content against real data: card names against the deck
// and the catalog, domains, copy limits, prices and the budget. Problems with
// content don't throw – they are collected in `issues` and shown to the user.

import { normName } from './catalog.js';
import { cardPriceEur } from './prices.js';

export class DeserializationError extends Error {
  constructor(path, expected, value) {
    super(`Neveljaven JSON pri "${path}": pričakovan ${expected}, dobljeno ${JSON.stringify(value)?.slice(0, 60)}`);
    this.name = 'DeserializationError';
    this.status = 502;
  }
}

// --- small type guards -------------------------------------------------------

function str(obj, key, path) {
  const v = obj?.[key];
  if (typeof v !== 'string') throw new DeserializationError(`${path}.${key}`, 'niz', v);
  return v.trim();
}

function int(obj, key, path) {
  const v = obj?.[key];
  if (!Number.isInteger(v)) throw new DeserializationError(`${path}.${key}`, 'celo število', v);
  return v;
}

function arr(obj, key, path, map) {
  const v = obj?.[key];
  if (!Array.isArray(v)) throw new DeserializationError(`${path}.${key}`, 'seznam', v);
  return v.map((item, i) => map(item, `${path}.${key}[${i}]`));
}

function oneOf(obj, key, path, allowed) {
  const v = str(obj, key, path);
  if (!allowed.includes(v)) throw new DeserializationError(`${path}.${key}`, allowed.join(' | '), v);
  return v;
}

const strItem = (v, path) => {
  if (typeof v !== 'string') throw new DeserializationError(path, 'niz', v);
  return v.trim();
};

// --- classes -----------------------------------------------------------------

export class KeyCard {
  constructor({ name, role, inDeck }) {
    this.name = name;
    this.role = role;
    this.inDeck = inDeck;
  }

  static fromJSON(json, path, ctx) {
    const name = str(json, 'name', path);
    return new KeyCard({ name, role: str(json, 'role', path), inDeck: ctx.deckNames.has(normName(name)) });
  }
}

export class CardSwap {
  constructor({ remove, add, quantity, reason, addCard = null, priceEach = null, issues = [] }) {
    this.remove = remove;
    this.add = add;
    this.quantity = quantity;
    this.reason = reason;
    this.addCard = addCard;
    this.priceEach = priceEach;
    this.issues = issues;
  }

  /** Cost of the added copies in EUR (null when the price is unknown). */
  get cost() {
    return this.priceEach == null ? null : Math.round(this.priceEach * this.quantity * 100) / 100;
  }

  get isValid() {
    return this.issues.length === 0;
  }

  static fromJSON(json, path, ctx) {
    const remove = str(json, 'remove', path);
    const add = str(json, 'add', path);
    const quantity = int(json, 'quantity', path);
    const reason = str(json, 'reason', path);
    const issues = [];

    if (quantity < 1 || quantity > 3) issues.push(`količina ${quantity} ni med 1 in 3`);

    const removed = ctx.mainDeck.get(normName(remove));
    if (!removed) issues.push(`»${remove}« ni v glavnem decku`);
    else if (quantity > removed.quantity) issues.push(`v decku sta le ${removed.quantity} kopiji »${remove}«`);

    const card = ctx.catalog.get(normName(add));
    if (!card) {
      issues.push(`karte »${add}« ni v bazi kart (možna halucinacija)`);
    } else {
      if (!card.domains.every((d) => ctx.domains.includes(d))) {
        issues.push(`»${card.name}« (${card.domains.join('/')}) ni v domenah legende`);
      }
      const already = ctx.mainDeck.get(normName(card.name))?.quantity ?? 0;
      if (already + quantity > 3) issues.push(`skupaj bi bilo ${already + quantity} kopij »${card.name}« (največ 3)`);
    }

    return new CardSwap({
      remove: removed?.name ?? remove,
      add: card?.name ?? add,
      quantity,
      reason,
      addCard: card ? { name: card.name, type: card.type, domains: card.domains, text: card.text, image: card.image } : null,
      priceEach: cardPriceEur(card, ctx.prices),
      issues,
    });
  }

  toJSON() {
    return { ...this, cost: this.cost, isValid: this.isValid };
  }
}

export class Matchup {
  constructor({ opponent, rating, tip }) {
    this.opponent = opponent;
    this.rating = rating;
    this.tip = tip;
  }

  static fromJSON(json, path) {
    const rating = int(json, 'rating', path);
    // Clamp instead of failing – the rating is only a hint for the UI.
    return new Matchup({ opponent: str(json, 'opponent', path), rating: Math.min(5, Math.max(1, rating)), tip: str(json, 'tip', path) });
  }
}

export class DeckAdvice {
  constructor(fields) {
    Object.assign(this, fields);
  }

  /** Total EUR for all added cards (only swaps with a known price). */
  get swapCost() {
    return Math.round(this.swaps.reduce((a, s) => a + (s.cost ?? 0), 0) * 100) / 100;
  }

  get withinBudget() {
    return this.swapCost <= this.budgetEur;
  }

  get validSwaps() {
    return this.swaps.filter((s) => s.isValid);
  }

  /**
   * @param {unknown} json  parsed JSON from the model
   * @param {object}  deck  resolved deck (resolveDeck)
   * @param {object}  ctx   { catalog: Map, prices, budgetEur }
   */
  static fromJSON(json, deck, { catalog, prices, budgetEur }) {
    if (json === null || typeof json !== 'object' || Array.isArray(json)) {
      throw new DeserializationError('$', 'objekt', json);
    }
    const mainDeck = new Map(
      [...deck.sections.mainDeck, ...deck.sections.champion].map((e) => [normName(e.name), e]),
    );
    const deckNames = new Set(
      Object.values(deck.sections).flat().map((e) => normName(e.name)),
    );
    const ctx = { catalog, prices, mainDeck, deckNames, domains: deck.domains };
    const p = '$';

    const swaps = arr(json, 'swaps', p, (v, path) => CardSwap.fromJSON(v, path, ctx));
    // The same card removed in several swaps must not exceed the copies in the deck.
    const removedTotals = new Map();
    for (const s of swaps) {
      const key = normName(s.remove);
      removedTotals.set(key, (removedTotals.get(key) ?? 0) + s.quantity);
      const have = mainDeck.get(key)?.quantity;
      if (have != null && removedTotals.get(key) > have && !s.issues.length) {
        s.issues.push(`»${s.remove}« je odstranjen večkrat, kot je kopij v decku`);
      }
    }

    return new DeckAdvice({
      archetype: str(json, 'archetype', p),
      summary: str(json, 'summary', p),
      gamePlan: str(json, 'gamePlan', p),
      difficulty: oneOf(json, 'difficulty', p, ['easy', 'medium', 'hard']),
      strengths: arr(json, 'strengths', p, strItem),
      weaknesses: arr(json, 'weaknesses', p, strItem),
      keyCards: arr(json, 'keyCards', p, (v, path) => KeyCard.fromJSON(v, path, ctx)),
      swaps,
      mulligan: arr(json, 'mulligan', p, strItem),
      matchups: arr(json, 'matchups', p, (v, path) => Matchup.fromJSON(v, path)),
      budgetComment: str(json, 'budgetComment', p),
      budgetEur,
    });
  }

  toJSON() {
    return {
      ...this,
      swapCost: this.swapCost,
      withinBudget: this.withinBudget,
      validSwapCount: this.validSwaps.length,
    };
  }
}
