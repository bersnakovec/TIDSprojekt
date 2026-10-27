// RiftVault – Naloga 2: scrapes official Riftbound news from playriftbound.com into a JSON file.
//
// Decklists from "Top Decks" tournament articles are also saved separately to decklists.json.
//
// usage: node src/index.js [--limit 36] [--no-details] [--out output] [--delay 750] [--headful]

import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer';
import {
  NEWS_URL, dismissCookies, extractArticleCards, extractArticleDetails, loadArticleCards, scrollToBottom, sleep,
} from './scraper.js';
import { enrich } from './enrich.js';
import { isDecklistArticle, parseDecklists } from './decklists.js';

const USER_AGENT_SUFFIX = 'RiftVault-NewsScraper/0.1 (student project, FERI)';

function parseArgs(argv) {
  const options = { limit: 36, details: true, out: 'output', delay: 750, headful: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`${arg} potrebuje vrednost`);
      return argv[++i];
    };
    switch (arg) {
      case '--limit': options.limit = positiveInt(next(), arg); break;
      case '--delay': options.delay = positiveInt(next(), arg); break;
      case '--out': options.out = next(); break;
      case '--no-details': options.details = false; break;
      case '--headful': options.headful = true; break;
      case '--help':
        console.log('node src/index.js [--limit N] [--no-details] [--out mapa] [--delay ms] [--headful]');
        process.exit(0);
      default: throw new Error(`neznana možnost ${arg}`);
    }
  }
  return options;
}

function positiveInt(value, name) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${name} mora biti nenegativno celo število`);
  return n;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const log = message => console.log(message);

  const browser = await puppeteer.launch({ headless: !options.headful });
  try {
    const page = await browser.newPage();
    await page.setUserAgent(`${await browser.userAgent()} ${USER_AGENT_SUFFIX}`);
    await page.setViewport({ width: 1366, height: 900 });

    log(`Odpiram ${NEWS_URL}`);
    await page.goto(NEWS_URL, { waitUntil: 'networkidle2', timeout: 45000 });
    await dismissCookies(page);
    await loadArticleCards(page, options.limit, log);
    await scrollToBottom(page);

    const cards = (await extractArticleCards(page)).slice(0, options.limit);
    log(`Prebranih ${cards.length} kartic novic.`);

    const articles = [];
    for (const [index, card] of cards.entries()) {
      let details = null;
      if (options.details && card.isArticle) {
        await sleep(options.delay); // be polite to the server
        try {
          details = await extractArticleDetails(page, card.url);
          if (isDecklistArticle(card.title)) {
            details.decklists = parseDecklists(details.paragraphs, details.headings);
          }
          const decks = details.decklists ? `, ${details.decklists.length} deckov` : '';
          log(`  [${index + 1}/${cards.length}] ${card.title} (${details.wordCount} besed${decks})`);
        } catch (error) {
          log(`  [${index + 1}/${cards.length}] ${card.title} – napaka: ${error.message}`);
        }
      }
      articles.push(enrich(card, details));
    }

    const scrapedAt = new Date().toISOString();
    const decklists = collectDecklists(articles);
    // Decks live only in decklists.json; news.json keeps just their count to avoid duplication.
    for (const article of articles) {
      if (article.details?.decklists) {
        article.details.decklistCount = article.details.decklists.length;
        delete article.details.decklists;
      }
    }
    const outDir = resolve(options.out);
    await mkdir(outDir, { recursive: true });
    const newsPath = await saveJson(join(outDir, 'news.json'),
      { source: NEWS_URL, scrapedAt, count: articles.length, articles });
    const decksPath = await saveJson(join(outDir, 'decklists.json'),
      { source: NEWS_URL, scrapedAt, count: decklists.length, decklists });

    printSummary(articles);
    log(`\nShranjeno: ${newsPath}`);
    log(`Shranjeno: ${decksPath} (${decklists.length} deckov)`);
  } finally {
    await browser.close();
  }
}

/** Flattens decklists of all articles into one list; each deck keeps a reference to its article. */
function collectDecklists(articles) {
  return articles.flatMap(article => (article.details?.decklists ?? []).map((deck, i) => ({
    id: `${article.id}-${i + 1}`,
    articleId: article.id,
    event: article.title,
    date: article.date,
    url: article.url,
    ...deck,
  })));
}

async function saveJson(path, data) {
  await writeFile(path, JSON.stringify(data, null, 2) + '\n', 'utf8');
  return path;
}

function printSummary(articles) {
  console.log();
  console.table(articles.map(a => ({
    datum: a.date,
    kategorija: a.category,
    naslov: a.title.length > 50 ? `${a.title.slice(0, 47)}...` : a.title,
    teme: a.topics.join(', '),
    besed: a.details?.wordCount ?? '-',
  })));
}

main().catch(error => {
  console.error(`Napaka: ${error.message}`);
  process.exit(1);
});
