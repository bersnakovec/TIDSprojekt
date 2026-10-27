// Puppeteer logic for reading the news list and individual articles on playriftbound.com.

export const BASE_URL = 'https://playriftbound.com';
export const NEWS_URL = `${BASE_URL}/en-us/news/`;

const CARD = '[data-testid="articlefeaturedcard-component"]';

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Clicks "Reject Non-Essential" on the cookie banner, if it is shown. */
export async function dismissCookies(page) {
  const [button] = await page.$$('xpath/.//button[normalize-space()="Reject Non-Essential"]');
  if (button) {
    await button.click();
    await sleep(300);
  }
}

/** Clicks "SHOW MORE" until at least `limit` cards are on the page or there is nothing left to load. */
export async function loadArticleCards(page, limit, log) {
  let count = await page.$$eval(CARD, cards => cards.length);
  while (count < limit) {
    const [showMore] = await page.$$('xpath/.//button[contains(translate(., "showre", "SHOWRE"), "SHOW MORE")]');
    if (!showMore) {
      log(`Ni več gumba SHOW MORE (naloženih ${count} novic).`);
      break;
    }
    await showMore.click();
    try {
      await page.waitForFunction((sel, prev) => document.querySelectorAll(sel).length > prev,
        { timeout: 10000 }, CARD, count);
    } catch {
      log('Po kliku SHOW MORE ni prišlo novih novic, končujem.');
      break;
    }
    count = await page.$$eval(CARD, cards => cards.length);
    log(`  naloženih ${count} novic`);
  }
}

/** Scrolls through the page so lazy-loaded card images get their real URLs. */
export async function scrollToBottom(page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += window.innerHeight / 2) {
      window.scrollTo(0, y);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  });
}

/** Reads every news card currently on the list page. */
export async function extractArticleCards(page) {
  return page.$$eval(CARD, (cards, base) => cards.map(card => {
    const text = sel => card.querySelector(sel)?.innerText.trim() || null;
    // Images that were never on screen still hold a placeholder data: URI.
    const realUrl = value => (value && value.startsWith('http') ? value : null);
    const imageUrl = realUrl(card.querySelector('[data-testid="mediaImage"]')?.getAttribute('src'))
      ?? realUrl(card.querySelector('picture source')?.getAttribute('srcset')?.split(' ')[0]);
    const href = card.getAttribute('href');
    const url = new URL(href, base).href;
    return {
      title: text('[data-testid="card-title"]') ?? card.getAttribute('aria-label'),
      category: text('[data-testid="card-category"]'),
      publishedAt: card.querySelector('[data-testid="card-date"] time')?.getAttribute('datetime') ?? null,
      summary: text('[data-testid="card-description"]'),
      url,
      // Some cards link to YouTube or other sections instead of a news article.
      isArticle: url.startsWith(`${base}/en-us/news/`),
      isVideo: card.querySelector('[data-testid="icon-action-play-video"]') !== null,
      imageUrl,
    };
  }), BASE_URL);
}

/** Opens one article and reads its tagline, headings and body text. */
export async function extractArticleDetails(page, url) {
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
  return page.evaluate(() => {
    const text = el => el?.innerText.trim() || null;
    const body = document.querySelector('[data-testid="ArticleRichTextBlade"]');
    const paragraphs = body
      ? body.innerText.split(/\n+/).map(line => line.trim()).filter(Boolean)
      : [];
    return {
      title: text(document.querySelector('[data-testid="title"]')),
      tagline: text(document.querySelector('[data-testid="tagline"]')),
      headings: body ? [...body.querySelectorAll('h2, h3')].map(h => h.innerText.trim()).filter(Boolean) : [],
      paragraphs,
      wordCount: paragraphs.join(' ').split(/\s+/).filter(Boolean).length,
      bannerImageUrl: document.querySelector('[data-testid="banner-image"] img')?.getAttribute('src') ?? null,
    };
  });
}
