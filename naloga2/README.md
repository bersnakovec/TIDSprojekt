# Naloga 2 – razčlenjevalnik spletne strani (Puppeteer)

Del projekta **RiftVault**. Razčlenjevalnik s knjižnico [Puppeteer](https://pptr.dev/) prebere **uradne novice igre Riftbound** s strani [playriftbound.com/en-us/news](https://playriftbound.com/en-us/news/) in jih shrani v JSON. Iz člankov s turnirskimi rezultati (»Top Decks«) izlušči tudi **celotne deckliste** najboljših igralcev.

V končni aplikaciji bodo podatki služili za:
- **zavihek Novice** – zadnje objave, filtrirane po temi (ban list, pravila, dogodki, izdelki),
- **turnirske decke** – ceno vsakega decka bo RiftVault izračunal iz cen kart (TCGCSV) in pokazal, koliko kart uporabniku manjka glede na njegovo zbirko.

## Zakaj ta stran

- uradni vir (Riot Games), novice so vezane neposredno na projekt,
- `robots.txt` strani dovoljuje dostop (`User-agent: * / Allow: /`),
- stran je dinamična (Next.js), seznam novic se dopolnjuje z gumbom **SHOW MORE**, zato je potreben pravi brskalnik – Puppeteer.

## Kako deluje

```
playriftbound.com/en-us/news
  │ 1. odpri stran, zavrni neobvezne piškotke
  │ 2. klikaj SHOW MORE, dokler ni naloženih --limit novic
  │ 3. pomakni stran do dna (lazy-load slik)
  │ 4. preberi kartice: naslov, kategorija, datum, povzetek, URL, slika
  ▼
za vsak članek (premor --delay ms med zahtevami)
  │ 5. odpri članek, preberi podnaslov, naslove razdelkov, odstavke
  │ 6. članek »Top Decks« → razčleni deckliste
  ▼
obogatitev: ID (slug), datum YYYY-MM-DD, teme (ban-list, rules, event …), omenjeni seti
  ▼
output/news.json, output/decklists.json
```

| Datoteka | Vloga |
|---|---|
| `src/index.js` | ukazna vrstica, potek, shranjevanje, izpis tabele |
| `src/scraper.js` | Puppeteer: piškotki, SHOW MORE, branje kartic in člankov |
| `src/decklists.js` | razčlenjevanje decklistov iz besedila člankov »Top Decks« |
| `src/enrich.js` | ID-ji, datumi, določanje tem in setov |

Elementi se iščejo prek atributov `data-testid` (npr. `card-title`, `card-date`), ki so stabilnejši od generiranih CSS razredov.

## Namestitev in zagon

Potreben je **Node.js 18+**. Ob namestitvi Puppeteer prenese svoj Chrome.

```bash
cd naloga2
npm install

npm run scrape                 # 36 novic s podrobnostmi (≈ 1 min)
npm run scrape:quick           # samo prvih 12 kartic, brez odpiranja člankov
node src/index.js --limit 60 --delay 1000
node src/index.js --headful    # odpre vidno okno brskalnika
```

| Možnost | Privzeto | Pomen |
|---|---|---|
| `--limit N` | 36 | največ toliko novic |
| `--no-details` | – | ne odpira posameznih člankov |
| `--delay ms` | 750 | premor med odpiranjem člankov |
| `--out mapa` | `output` | kam se shranita JSON datoteki |
| `--headful` | – | brskalnik z oknom (za razhroščevanje) |

> Če Puppeteer ne deluje: izbriši `node_modules` in namesti `npm install puppeteer@18.1.0` (navodilo predmeta).

Primer izpisa:

```
Odpiram https://playriftbound.com/en-us/news/
  naloženih 24 novic
  naloženih 36 novic
Prebranih 36 kartic novic.
  [1/36] Radiance Rules FAQ and Clarifications (1566 besed)
  ...
  [14/36] Los Angeles’ Top Decks (5001 besed, 41 deckov)
  ...
┌─────────┬──────────────┬──────────────────┬───────────────────────────────────────┬─────────────┬───────┐
│ (index) │ datum        │ kategorija       │ naslov                                │ teme        │ besed │
├─────────┼──────────────┼──────────────────┼───────────────────────────────────────┼─────────────┼───────┤
│ 0       │ '2026-10-26' │ 'ORGANIZED PLAY' │ 'Radiance Rules FAQ and Clarifications'│ 'rules'     │ 1566  │
...
Shranjeno: ...\naloga2\output\news.json
Shranjeno: ...\naloga2\output\decklists.json (123 deckov)
```

## Oblika podatkov

### `output/news.json`

```json
{
  "source": "https://playriftbound.com/en-us/news/",
  "scrapedAt": "2026-10-26T23:53:10.000Z",
  "count": 36,
  "articles": [
    {
      "id": "september-ban-list-updates-effective-september-18-2026",
      "title": "September Ban List Updates (Effective September 18, 2026)",
      "category": "ANNOUNCEMENTS",
      "publishedAt": "2026-09-15T00:00:00.000Z",
      "date": "2026-09-15",
      "url": "https://playriftbound.com/en-us/news/announcements/september-ban-list-updates-effective-september-18-2026",
      "type": "article",
      "summary": "We’re announcing the latest cards added to the Standard and Constructed 2v2 ban list.",
      "imageUrl": "https://cmsassets.rgpub.io/...",
      "topics": ["ban-list"],
      "sets": [],
      "details": {
        "title": "SEPTEMBER BAN LIST UPDATES (EFFECTIVE SEPTEMBER 18, 2026)",
        "tagline": "We’re announcing the latest cards added to the Standard and Constructed 2v2 ban list.",
        "headings": ["Ekko, Recurrent", "Stacked Deck"],
        "paragraphs": ["Effective: September 18, 2026", "..."],
        "wordCount": 593,
        "bannerImageUrl": null
      }
    }
  ]
}
```

| Polje | Opis |
|---|---|
| `id` | zadnji del URL-ja (slug), stabilen identifikator |
| `type` | `article` (novica), `video` (YouTube), `link` (druga podstran) – podrobnosti se berejo samo za `article` |
| `topics` | `decklists`, `ban-list`, `rules`, `event`, `product`, `set-preview` (po ključnih besedah) |
| `sets` | seti, omenjeni v naslovu ali povzetku |
| `details` | `null` pri `--no-details` ali če članka ni bilo mogoče prebrati |
| `details.decklistCount` | samo pri člankih »Top Decks« |

### `output/decklists.json`

```json
{
  "count": 123,
  "decklists": [
    {
      "id": "los-angeles-top-decks-1",
      "articleId": "los-angeles-top-decks",
      "event": "Los Angeles’ Top Decks",
      "date": "2026-09-30",
      "player": "Cliffsunder",
      "info": { "legendRank": "#1/24", "overallRanking": "#567" },
      "legend": [{ "quantity": 1, "name": "Renata Glasc, Chem-Baroness" }],
      "champion": [{ "quantity": 1, "name": "Renata Glasc, Industrialist" }],
      "mainDeck": [{ "quantity": 3, "name": "Baited Hook" }, "..."],
      "battlefields": [{ "quantity": 1, "name": "Seat of Power" }, "..."],
      "runes": [{ "quantity": 7, "name": "Order Rune" }, "..."],
      "sideboard": [{ "quantity": 1, "name": "Hostile Takeover" }, "..."],
      "mainDeckCount": 39
    }
  ]
}
```

`articleId` povezuje deck s člankom v `news.json`. Imena kart bo RiftVault povezal s katalogom Riftcodex in cenami; pri tem jih je treba normalizirati, ker članki pišejo `Vi, Peacekeeper`, Riftcodex pa `Vi - Peacekeeper`. `mainDeckCount` je 39, ker je 40. karta glavnega decka izbrani `champion`.

## Omejitve

- Teme se določajo s ključnimi besedami, zato nekaj novic ostane brez teme.
- Razčlenjevalnik je vezan na trenutno strukturo strani; če Riot spremeni `data-testid` atribute ali obliko člankov »Top Decks«, ga je treba prilagoditi.
- Zahteve so namerno počasne (`--delay`), da strani ne obremenjujemo.
