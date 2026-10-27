// Parses tournament decklists from the text of official "Top Decks" articles.
//
// A deck in the article text looks like:
//   SGF Sevya                      <- player (an <h2> heading)
//   Legend Rank: #1/27             <- optional "Key: value" info lines
//   Legend:                        <- section header
//   1 Shen, Eye of Twilight        <- "<quantity> <card name>"
//   Main Deck:
//   2 B.F. Sword
//   ...

const SECTIONS = {
  'Legend:': 'legend',
  'Champion:': 'champion',
  'Main Deck:': 'mainDeck',
  'Battlefields:': 'battlefields',
  'Rune Pool:': 'runes',
  'Sideboard:': 'sideboard',
};

const CARD_LINE = /^(\d+)\s+(.+)$/;
const INFO_LINE = /^([A-Za-z][A-Za-z ]+):\s*(.+)$/;

export function isDecklistArticle(title) {
  return /top decks/i.test(title);
}

export function parseDecklists(paragraphs, headings) {
  const headingSet = new Set(headings);
  const decks = [];
  let deck = null;
  let section = null;

  const finish = () => {
    if (deck && deck.mainDeck.length > 0) {
      deck.mainDeckCount = deck.mainDeck.reduce((sum, card) => sum + card.quantity, 0);
      decks.push(deck);
    }
    deck = null;
    section = null;
  };

  for (let i = 0; i < paragraphs.length; i++) {
    const line = paragraphs[i];

    // A heading starts a deck only if a "Legend:" section follows within a few lines.
    if (headingSet.has(line) && paragraphs.slice(i + 1, i + 6).includes('Legend:')) {
      finish();
      deck = {
        player: line, info: {}, legend: [], champion: [], mainDeck: [], battlefields: [], runes: [], sideboard: [],
      };
      continue;
    }
    if (!deck) continue;

    if (SECTIONS[line]) {
      section = SECTIONS[line];
      continue;
    }

    const card = CARD_LINE.exec(line);
    if (card && section) {
      deck[section].push({ quantity: Number(card[1]), name: card[2].trim() });
      continue;
    }

    const info = INFO_LINE.exec(line);
    if (info && !section) {
      deck.info[toCamelCase(info[1])] = info[2].trim();
      continue;
    }

    // Any other text ends the current deck (e.g. the next paragraph of the article).
    finish();
  }
  finish();
  return decks;
}

function toCamelCase(label) {
  return label.trim().toLowerCase().replace(/\s+(\w)/g, (_, c) => c.toUpperCase());
}
