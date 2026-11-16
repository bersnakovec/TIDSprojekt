# Naloga 4 – podatki iz LLM (deck svetovalec)

Del projekta **RiftVault**. Uporabnik izbere turnirski deck igre Riftbound (ali prilepi svojega) in opiše, kako igra. Aplikacija iz tega in iz pravih podatkov o kartah **dinamično sestavi prompt**. **Claude API** vrne analizo decka in predloge zamenjav kart v **JSON** po vnaprej določeni shemi, ta pa se **deserializira v razred `DeckAdvice`**, ki odgovor preveri proti podatkom.

## Ponudnik LLM

| | |
|---|---|
| Ponudnik | Anthropic – Claude API (`@anthropic-ai/sdk`) |
| Model | `claude-haiku-5-5` (privzeto; spremeniš z `LLM_MODEL` v `.env`) |
| JSON | *structured outputs*: `output_config.format` z JSON shemo iz `src/schema.js` – model lahko odgovori **samo** z veljavnim JSON te oblike |
| Cena | ≈ 26.000 vhodnih + 3.500 izhodnih tokenov na analizo ≈ **0,004 $** (Haiku 5.5: 0,10 $ / 0,50 $ na milijon tokenov), ~25 s |

## Vhodni podatki → dinamičen prompt

| Vir | Kaj gre v prompt |
|---|---|
| **Obrazec** | izkušnje (začetnik / povprečen / tekmovalec), kje bo igral (doma / lokalni / regionalni turnir), želje (agresivno, kontrola, manj naključja, preprosto, poceni), opomba, proračun v €, število zamenjav, jezik odgovora |
| **Izbrani deck** | turnirski deck iz naloge 2 (`data/decklists.json`, 123 deckov) ali prilepljen seznam |
| **Riftcodex API** | za vsako karto v decku: tip, domene, cena (energy/power), might in **celotno besedilo pravil** |
| **TCGCSV + Frankfurter** | tržna cena vsake karte v EUR, vrednost decka |
| **Nabor kandidatov** | vse karte iz domen legende, ki jih v decku še ni in katerih ena kopija ne presega proračuna (~250, s cenami in besedili), razvrščene po tipu in imenu (ne po ceni, da model ne izbira samo najcenejših) – edine dovoljene zamenjave |

Primer začetka sestavljenega prompta (v aplikaciji ga v celoti vidiš pod »Pod pokrovom → Prompt, poslan modelu«):

```
PLAYER
- Experience: a beginner who is still learning the rules.
- Will play the deck in: a local weekly tournament.
- Budget for new cards: 20 € in total.
- Wants exactly 3 swap suggestion(s) …
- wants a more consistent deck with less randomness
- Player's own note: <note>Pogosto igram proti agresivnim deckom …</note>
- Answer language: Slovenian.

DECK
This is Lunar's deck from "Los Angeles' Top Decks" (2026-09-30, legend rank #1/24).
Legend: 1x Shen - Eye of Twilight | Legend | Calm/Order | 0.31 €
   …
MAIN DECK (40 cards incl. champion)
3x Block | Spell | Calm | energy 1 | 0.05 €
   …
CANDIDATE POOL (all legal cards not in the deck that fit the budget, by type and name, price per copy)
…
```

## JSON shema in razredi

Shema (`src/schema.js`, Zod → JSON Schema za API):

```json
{
  "archetype": "string",
  "summary": "string",
  "gamePlan": "string",
  "difficulty": "easy | medium | hard",
  "strengths": ["string"],
  "weaknesses": ["string"],
  "keyCards": [{ "name": "string", "role": "string" }],
  "swaps": [{ "remove": "string", "add": "string", "quantity": 1, "reason": "string" }],
  "mulligan": ["string"],
  "matchups": [{ "opponent": "string", "rating": 1, "tip": "string" }],
  "budgetComment": "string"
}
```

Razredi v `src/models.js`:

| Razred | Vsebina | Izpeljane lastnosti |
|---|---|---|
| `DeckAdvice` | celoten odgovor | `swapCost`, `withinBudget`, `validSwaps` |
| `CardSwap` | ena zamenjava | `cost`, `priceEach`, `addCard`, `isValid`, `issues` |
| `KeyCard` | ključna karta | `inDeck` |
| `Matchup` | ocena proti arhetipu | `rating` omejen na 1–5 |

`DeckAdvice.fromJSON(json, deck, ctx)` deluje v dveh korakih:
1. **Struktura:** preveri tipe in obvezna polja. Ob napaki vrže `DeserializationError` in odgovor se ne prikaže.
2. **Vsebina proti pravim podatkom:** ali je odstranjena karta res v decku in v dovolj kopijah, ali dodana karta obstaja v Riftcodex (**zaznava halucinacij**), ali je v domenah legende, ali bi bilo več kot 3 kopije, ali je skupna cena v okviru proračuna. Te težave se zberejo v `issues` in se prikažejo z opozorilom ⚠.

## Potek zahteve

```
obrazec ──POST /api/advice──► readInput()            preverjanje vnosov (meje, dovoljene vrednosti)
                               resolveDeck()          deck + Riftcodex + cene → nabor kandidatov
                               buildUserPrompt()      dinamičen prompt
                               askModel()             Claude API, output_config.format = JSON shema
                               JSON.parse()
                               DeckAdvice.fromJSON()  deserializacija + preverjanje
        ◄── JSON (advice, prompt, surovi odgovor, porabljeni tokeni, cena) ──
```

| Datoteka | Vloga |
|---|---|
| `src/server.js` | Express, API, preverjanje vnosov |
| `src/catalog.js` | Riftcodex katalog kart (predpomnilnik 24 h, združevanje variant) |
| `src/prices.js` | TCGCSV cene (največ 1× na dan, `last-updated.txt`), Frankfurter USD → EUR |
| `src/deck.js` | turnirski decki, razčlenjevanje prilepljenega seznama, nabor kandidatov |
| `src/prompt.js` | sistemski prompt in sestavljanje uporabniškega prompta |
| `src/schema.js` | JSON shema odgovora |
| `src/llm.js` | klic Claude API, obravnava napak in zavrnitev, testni način |
| `src/models.js` | razredi `DeckAdvice`, `CardSwap`, `KeyCard`, `Matchup` |
| `public/` | obrazec in prikaz rezultata |

## Namestitev in zagon

Potreben je **Node.js 20.12+**.

```bash
cd naloga4
npm install
cp .env.example .env        # vpiši ANTHROPIC_API_KEY=sk-ant-...
npm start                   # http://localhost:3000
```

- Brez ključa (ali z `npm run mock`) aplikacija teče v **testnem načinu**: vrne vzorčen JSON iste oblike, sestavljen iz pravega decka, z eno namerno izmišljeno karto, da se vidi preverjanje.
- Ob prvem zagonu strežnik prenese katalog (Riftcodex, ~15 zahtev) in cene (TCGCSV, ~30 zahtev, lahko traja nekaj minut). Oboje se shrani v `cache/` in osveži največ enkrat na dan.
- Ključ API je samo v `.env` na strežniku in nikoli ne pride v brskalnik.

## Varnost

- Vse vrednosti iz obrazca strežnik preveri (dovoljene vrednosti, meje). Opomba je omejena na 300 znakov, brez `<` in `>`, in je v promptu zaprta v `<note>`.
- Besedilo modela se v brskalniku vedno escapira, preden se vstavi v stran.
