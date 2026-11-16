// Builds the prompt from the user's form input and the resolved deck.
// Nothing here is a fixed question: the profile, the deck with its card texts
// and prices, the budget and the replacement pool all change per request.

export const EXPERIENCE = {
  beginner: 'a beginner who is still learning the rules',
  intermediate: 'an intermediate player who knows the rules and basic strategy',
  competitive: 'a competitive player who wants to maximise win rate',
};

export const GOALS = {
  casual: 'casual games with friends',
  local: 'a local weekly tournament',
  regional: 'a large regional / national tournament',
};

export const STYLES = {
  aggressive: 'prefers a more aggressive, proactive game plan',
  control: 'prefers more control and interaction',
  consistent: 'wants a more consistent deck with less randomness',
  simple: 'wants a deck that is simpler to pilot',
  cheap: 'wants to keep the deck as cheap as possible',
};

export const LANGUAGES = {
  sl: 'Slovenian – natural, grammatically correct Slovenian with proper diacritics (č, š, ž); never replace them with c, s, z',
  en: 'English',
};

export const SYSTEM_PROMPT = `You are an experienced coach for Riftbound, the League of Legends trading card game.
You analyse decks and give practical, honest advice tailored to the player.

Deck-building rules you must respect:
- A deck has 1 Champion Legend, a 40-card main deck (including the chosen Champion unit), 12 runes and 3 battlefields.
- At most 3 copies of a card with the same name.
- Every main-deck card must belong to the Legend's domains.

How to answer:
- Base every statement on the card texts provided; do not invent card abilities.
- Suggested replacements ("add") must be copied exactly from the CANDIDATE POOL, and removed cards ("remove") exactly from the MAIN DECK list.
- A swap replaces "quantity" copies of "remove" with the same number of "add", so the deck stays at 40 cards.
- The budget is an upper limit for the cards added, not a target. Choose the swaps that improve the deck most for this player;
  a more expensive card is fine if it fits the budget, and a card is not a good choice just because it is cheap
  (unless the player asked for a cheap deck). Prices are listed per copy in EUR.
- Prefer removing the weakest cards for this player's goals, not necessarily the cards with the fewest copies.
- In card texts, tokens like :rb_energy_1: or [ADD] are game symbols (energy, power, etc.).
- Write all free-text fields in the language requested by the user. Keep names of cards in English.
- matchups[].rating is an integer from 1 (very unfavourable) to 5 (very favourable).`;

const fmtPrice = (p) => (p == null ? 'n/a' : `${p.toFixed(2)} €`);

function cardLine({ quantity, name, card, priceEur }) {
  if (!card) return `${quantity}x ${name} | (card not found in database)`;
  const stats = [
    card.energy != null && `energy ${card.energy}`,
    card.power != null && `power ${card.power}`,
    card.might != null && `might ${card.might}`,
  ].filter(Boolean).join(', ');
  const head = [quantity != null ? `${quantity}x ${card.name}` : card.name, card.type, card.domains.join('/'), stats, fmtPrice(priceEur)]
    .filter(Boolean).join(' | ');
  return `${head}\n   ${card.text.replace(/\s+/g, ' ').trim() || '(no rules text)'}`;
}

/**
 * @param {object} deck   result of resolveDeck()
 * @param {object} input  validated form input
 */
export function buildUserPrompt(deck, input) {
  const styles = input.styles.map((s) => `- ${STYLES[s]}`).join('\n') || '- no special preferences';
  const origin = deck.player
    ? `This is ${deck.player}'s deck from "${deck.event}" (${deck.date}${deck.rank ? `, legend rank ${deck.rank}` : ''}).`
    : 'This is the player\'s own deck.';

  const s = deck.sections;
  const list = (entries) => entries.map(cardLine).join('\n');

  return `PLAYER
- Experience: ${EXPERIENCE[input.experience]}.
- Will play the deck in: ${GOALS[input.goal]}.
- Budget for new cards: ${input.budgetEur} € in total.
- Wants exactly ${input.swapCount} swap suggestion(s) (fewer only if the deck truly needs fewer).
${styles}${input.notes ? `\n- Player's own note: <note>${input.notes}</note>` : ''}
- Answer language: ${LANGUAGES[input.language]}.

DECK
${origin}
Legend: ${s.legend.map(cardLine).join('\n')}
Domains: ${deck.domains.join(', ')}
Current deck value: ${deck.totalEur.toFixed(2)} € (TCGplayer market prices).

CHAMPION
${list(s.champion) || '(not listed)'}

MAIN DECK (${deck.counts.mainDeck} cards incl. champion)
${list(s.mainDeck)}

BATTLEFIELDS
${s.battlefields.map((e) => e.name).join(', ') || '(not listed)'}

RUNES
${s.runes.map((e) => `${e.quantity}x ${e.name}`).join(', ') || '(not listed)'}
${s.sideboard.length ? `\nSIDEBOARD\n${s.sideboard.map((e) => `${e.quantity}x ${e.name}`).join(', ')}\n` : ''}
CANDIDATE POOL (all legal cards not in the deck that fit the budget, by type and name, price per copy)
${deck.pool.map((p) => cardLine({ quantity: null, ...p })).join('\n')}

TASK
Analyse this deck for this player. Explain the game plan, strengths and weaknesses, the key cards,
mulligan advice and how it fares against common archetypes, and suggest ${input.swapCount} swap(s)
that fit the player's preferences and budget. In budgetComment, say how the suggestions fit the budget.`;
}
