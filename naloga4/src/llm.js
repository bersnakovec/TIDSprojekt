// Calls the Claude API with a structured-output format, so the answer is
// guaranteed to be JSON matching DeckAdviceSchema. Without an API key (or with
// --mock) a mock answer built from the real deck is returned instead.

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { DeckAdviceSchema } from './schema.js';

export const MODEL = process.env.LLM_MODEL || 'claude-haiku-5-5';
export const MOCK = process.argv.includes('--mock') || process.env.LLM_MOCK === '1' || !process.env.ANTHROPIC_API_KEY;

const client = MOCK ? null : new Anthropic();

// USD per million tokens (input, output) – for the cost shown in the UI.
const PRICES = {
  'claude-haiku-5-5': [0.10, 0.50],
  'claude-sonnet-5-5': [2, 10],
  'claude-opus-5-5': [4, 20],
};

export function estimateCostUsd(model, usage) {
  const p = PRICES[model];
  if (!p || !usage) return null;
  return (usage.input_tokens * p[0] + usage.output_tokens * p[1]) / 1e6;
}

export class LlmError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = 'LlmError';
    this.status = status;
  }
}

/**
 * @returns {Promise<{ text: string, model: string, usage: object|null, mock: boolean }>}
 *          `text` is the raw JSON string returned by the model.
 */
export async function askModel(system, user, deck, input) {
  if (MOCK) return mockAnswer(deck, input);

  let response;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system,
      messages: [{ role: 'user', content: user }],
      output_config: {
        effort: 'medium',
        format: zodOutputFormat(DeckAdviceSchema),
      },
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new LlmError('Neveljaven API ključ (ANTHROPIC_API_KEY v .env).', 500);
    if (err instanceof Anthropic.PermissionDeniedError) throw new LlmError('Ključ nima dostopa do modela ali ni dobroimetja.', 500);
    if (err instanceof Anthropic.RateLimitError) throw new LlmError('Preveč zahtev – poskusi čez nekaj sekund.', 429);
    if (err instanceof Anthropic.BadRequestError) throw new LlmError(`Zahteva zavrnjena: ${err.message}`, 500);
    if (err instanceof Anthropic.APIConnectionError) throw new LlmError('Povezava s Claude API ni uspela.', 503);
    if (err instanceof Anthropic.APIError) throw new LlmError(`Claude API napaka ${err.status}: ${err.message}`, 502);
    throw err;
  }

  if (response.stop_reason === 'refusal') {
    throw new LlmError(`Model je zavrnil odgovor${response.stop_details?.category ? ` (${response.stop_details.category})` : ''}.`);
  }
  if (response.stop_reason === 'max_tokens') {
    throw new LlmError('Odgovor je bil odrezan (max_tokens).');
  }
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  if (!text) throw new LlmError('Model ni vrnil besedila.');

  return { text, model: response.model, usage: response.usage, mock: false };
}

// ---------------------------------------------------------------------------
// Mock answer: same JSON shape, built from the actual deck, so the frontend and
// the classes can be developed and tested without an API key.

function mockAnswer(deck, input) {
  const main = deck.sections.mainDeck.filter((e) => e.card);
  const removable = [...main].sort((a, b) => a.quantity - b.quantity).slice(0, input.swapCount);
  const pool = deck.pool.filter((p) => p.priceEur != null);
  const swaps = removable.map((e, i) => ({
    remove: e.name,
    add: pool[i]?.card.name ?? 'Nonexistent Card',
    quantity: Math.min(e.quantity, 2),
    reason: 'TESTNI NAČIN: to je vzorčen predlog brez klica modela.',
  }));
  // one deliberately wrong swap shows the validation in the UI
  swaps.push({ remove: main[0]?.name ?? 'X', add: 'Teemo, Supreme Overlord', quantity: 1, reason: 'TESTNI NAČIN: izmišljena karta za prikaz preverjanja.' });

  const json = {
    archetype: `${deck.domains.join('/')} (testni način)`,
    summary: `Testni odgovor za deck z legendo ${deck.legend}. Pravi odgovor vrne Claude, ko je v .env nastavljen ANTHROPIC_API_KEY.`,
    gamePlan: 'Zgodaj razvij enote, v srednjem delu igre nadzoruj bojišča, pozno zmagaj s ključnimi kartami.',
    difficulty: 'medium',
    strengths: ['Primer prednosti 1', 'Primer prednosti 2'],
    weaknesses: ['Primer slabosti 1'],
    keyCards: main.slice(0, 3).map((e) => ({ name: e.name, role: 'Primer vloge ključne karte.' })),
    swaps,
    mulligan: ['Obdrži roko z vsaj dvema poceni enotama.'],
    matchups: [
      { opponent: 'Agresivni decki', rating: 3, tip: 'Primer nasveta.' },
      { opponent: 'Kontrolni decki', rating: 4, tip: 'Primer nasveta.' },
    ],
    budgetComment: `Proračun: ${input.budgetEur} €.`,
  };
  return new Promise((resolve) =>
    setTimeout(() => resolve({ text: JSON.stringify(json), model: 'mock', usage: null, mock: true }), 600));
}
