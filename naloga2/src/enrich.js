// Turns raw scraped values into the fields RiftVault needs (ids, dates, topics, sets).

const SETS = ['Origins', 'Spiritforged', 'Unleashed', 'Vendetta', 'Radiance'];

// Topic is assigned when any keyword appears in the title or summary.
const TOPICS = {
  'decklists': [/top decks/i],
  'ban-list': [/\bban(s|ned)?\b/i, /ban list/i],
  'rules': [/\brules?\b/i, /errata/i, /changelog/i, /patch notes/i, /\bfaq\b/i, /clarification/i],
  'event': [/regional/i, /championship/i, /\bopen\b/i, /pre-rift/i, /tournament/i, /eyes on/i, /gen con/i, /\bpax\b/i, /premier play/i, /local play/i],
  'product': [/drawing/i, /bundle/i, /merch/i, /pre-?order/i, /box set/i, /collection/i, /restock/i, /how to buy/i],
  'set-preview': [/preview/i, /overview/i, /begins/i, /enters the rift/i],
};

/** Slug from the article URL, used as a stable ID (e.g. "july-ban-list-updates"). */
export function articleId(url) {
  const parts = new URL(url).pathname.split('/').filter(Boolean);
  return parts.at(-1) ?? url;
}

export function enrich(card, details) {
  const haystack = [card.title, card.summary, details?.tagline].filter(Boolean).join(' ');
  return {
    id: articleId(card.url),
    title: card.title,
    category: card.category,
    publishedAt: card.publishedAt,
    date: card.publishedAt ? card.publishedAt.slice(0, 10) : null,
    url: card.url,
    type: card.isVideo ? 'video' : card.isArticle ? 'article' : 'link',
    summary: card.summary,
    imageUrl: card.imageUrl,
    topics: Object.entries(TOPICS)
      .filter(([, patterns]) => patterns.some(p => p.test(haystack)))
      .map(([topic]) => topic),
    sets: SETS.filter(set => haystack.toLowerCase().includes(set.toLowerCase())),
    details: details ?? null,
  };
}
