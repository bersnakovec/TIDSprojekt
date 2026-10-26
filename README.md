# RiftVault

**Sledenje zbirki in cenam kart igre Riftbound (League of Legends TCG)**

Projekt pri predmetu *Tehnologije integracije in digitalizacije storitev* (TIDS), FERI, 2026/27.
Avtor: Lenart Beršnak

---

## 1. Opis projekta

RiftVault je spletna aplikacija za igralce kartne igre **Riftbound**. Združuje podatke iz več zunanjih storitev:

- **katalog kart** (lastnosti, besedila, slike),
- **tržne cene kart** (dnevno posodobljene),
- **menjalne tečaje** (pretvorba USD → EUR),
- **obvestila** prek Discorda.

### Glavne funkcionalnosti

1. **Cena decka** – uporabnik prilepi seznam kart (decklist), aplikacija izračuna skupno ceno decka v EUR.
2. **Moja zbirka** – uporabnik vodi evidenco kart, ki jih ima; aplikacija izračuna vrednost zbirke in **ceno manjkajočih kart** za izbrani deck.
3. **Zgodovina cen** – aplikacija vsak dan shrani posnetek cen, zato lahko prikaže graf gibanja cene posamezne karte.
4. **Cenovni alarmi** – ko cena karte pade pod uporabnikov prag, aplikacija pošlje obvestilo na Discord.
5. **Obogatitev kart** – kartam championov doda zgodbo (lore) in sliko iz League of Legends.

### Obseg po fazah

| Faza | Vsebina |
|---|---|
| MVP | Riftcodex + TCGCSV + Frankfurter → katalog kart s cenami v EUR, izračun cene decka |
| Nadgradnja 1 | zbirka uporabnika, dnevni posnetki cen, zgodovina cen |
| Nadgradnja 2 | cenovni alarmi (Discord webhook), obogatitev z Data Dragon |
| Opcijsko | izvoz zbirke v Google Sheets (OAuth 2.0) |

---

## 2. Arhitektura in tok podatkov

```
                     ┌──────────────────────── zaledje (backend) ─────────────────────────┐
Riftcodex API ──────►│ [Card] ──┐                                                        │
                     │          ├─► povezava prek tcgplayer_id ─► [CardMapping]          │
TCGCSV (products) ──►│ [Product]┘                                                        │
TCGCSV (prices) ────►│ [Price] ─► Frankfurter (USD→EUR) ─► [PriceSnapshot]  (dnevni cron)│
Data Dragon ────────►│ [Champion] ─► obogatitev karte                                    │
                     │                                                                    │
                     │ [Collection] / [Deck] ─► cena decka, manjkajoče karte              │
                     │ [Alert] ─► cena < prag ───────────────────────────► Discord webhook│
                     └──────────────────────────────┬─────────────────────────────────────┘
                                                    │ lasten REST API (JSON)
                                                    ▼
                                         spletni vmesnik (frontend)
```

Zaledje vse zunanje podatke **prenese, normalizira in shrani v lastno bazo**. TCGCSV namreč prepoveduje klice iz brskalnika, podatki pa se tako ali tako posodabljajo le enkrat na dan. Uporabniški vmesnik zato komunicira samo z lastnim API-jem.

### Ključni integracijski koraki

1. **Uvoz kart** – sinhronizacija kataloga iz Riftcodex (`GET /cards`, s straničenjem).
2. **Povezava kart s cenami** – Riftcodex karta vsebuje polje `tcgplayer_id`, ki ustreza `productId` v TCGCSV. Pri tem je treba upoštevati, da je ID v Riftcodexu **niz**, v TCGCSV pa **celo število**. Karte brez ID-ja se povežejo po imenu (`clean_name` ↔ `cleanName`) in številki karte.
3. **Dnevni uvoz cen** – najprej se preveri `last-updated.txt`; če so podatki novi, se za vsak set (group) prenesejo cene.
4. **Pretvorba valute** – cene v USD se pretvorijo v EUR po dnevnem tečaju ECB.
5. **Preverjanje alarmov** – po vsakem uvozu cen se preverijo vsi aktivni alarmi.

---

## 3. Uporabljene storitve

### 3.1 Riftcodex API – katalog kart

- **Dokumentacija:** https://riftcodex.com/docs
- **Osnovni URL:** `https://api.riftcodex.com`
- **Avtentikacija:** ni potrebna (javni bralni dostop)
- **Format:** JSON (REST)
- **Opis:** neuradni, skupnostni API za Riftbound (po zgledu Scryfalla za Magic: The Gathering). Deluje v skladu z Riotovo politiko za vsebine oboževalcev.

| Metoda | Pot | Namen |
|---|---|---|
| GET | `/cards?page=&size=&set_id=&sort=` | seznam kart (straničenje, največ 100 na stran) |
| GET | `/cards/search?query=` | iskanje kart |
| GET | `/cards/name?exact=` / `?fuzzy=` | iskanje po imenu (za razčlenjevanje decklista) |
| GET | `/cards/{id}` | karta po Riftcodex ID |
| GET | `/cards/tcgplayer/{tcgplayer_id}` | karta po TCGplayer ID |
| GET | `/sets` | seznam setov |

### 3.2 TCGCSV – tržne cene

- **Dokumentacija:** https://tcgcsv.com/docs
- **Osnovni URL:** `https://tcgcsv.com/tcgplayer`
- **Avtentikacija:** ni potrebna
- **Format:** JSON (statične datoteke, osvežene enkrat dnevno)
- **Opis:** brezplačno dnevno zrcalo kataloga in cen trgovine TCGplayer. Riftbound ima **`categoryId = 89`** (*Riftbound League of Legends Trading Card Game*).

| Metoda | Pot | Namen |
|---|---|---|
| GET | `/categories` | seznam iger |
| GET | `/89/groups` | seti Riftbounda |
| GET | `/89/{groupId}/products` | izdelki (karte) v setu |
| GET | `/89/{groupId}/prices` | cene izdelkov v setu (USD) |
| GET | `https://tcgcsv.com/last-updated.txt` | čas zadnje posodobitve |

**Pravila uporabe, ki jih aplikacija upošteva:**
- lasten `User-Agent` v obliki `RiftVault/0.1.0`,
- vsaj 100 ms premora med zahtevami,
- največ ena sinhronizacija na dan,
- brez klicev iz brskalnika (samo zaledje).

### 3.3 Frankfurter – menjalni tečaji

- **Dokumentacija:** https://frankfurter.dev
- **Osnovni URL:** `https://api.frankfurter.dev/v1`
- **Avtentikacija:** ni potrebna
- **Format:** JSON
- **Opis:** odprtokodni API z referenčnimi tečaji Evropske centralne banke (ECB).

| Metoda | Pot | Namen |
|---|---|---|
| GET | `/latest?base=USD&symbols=EUR` | današnji tečaj |
| GET | `/{YYYY-MM-DD}?base=USD&symbols=EUR` | tečaj na izbrani dan (za zgodovino cen) |

### 3.4 League of Legends Data Dragon – championi

- **Dokumentacija:** https://developer.riotgames.com/docs/lol#data-dragon
- **Osnovni URL:** `https://ddragon.leagueoflegends.com`
- **Avtentikacija:** ni potrebna (statične datoteke, ki jih objavlja Riot)
- **Format:** JSON + slike (PNG/JPG)

| Metoda | Pot | Namen |
|---|---|---|
| GET | `/api/versions.json` | seznam verzij (prva je najnovejša) |
| GET | `/cdn/{version}/data/en_US/champion.json` | seznam vseh championov |
| GET | `/cdn/{version}/data/en_US/champion/{Champion}.json` | podrobnosti (zgodba, naziv) |
| GET | `/cdn/img/champion/splash/{Champion}_0.jpg` | slika championa |

### 3.5 Discord Webhooks – obvestila

- **Dokumentacija:** https://discord.com/developers/docs/resources/webhook#execute-webhook
- **Avtentikacija:** skrivni URL webhooka (ustvari ga uporabnik v nastavitvah Discord kanala)
- **Format:** JSON (POST)

| Metoda | Pot | Namen |
|---|---|---|
| POST | `https://discord.com/api/webhooks/{webhook.id}/{webhook.token}` | pošiljanje obvestila v kanal |

### 3.6 (Opcijsko) Google Sheets API – izvoz zbirke

- **Dokumentacija:** https://developers.google.com/sheets/api
- **Avtentikacija:** OAuth 2.0
- **Namen:** izvoz uporabnikove zbirke v preglednico (`spreadsheets.values.append`).

### Povzetek

| Storitev | Smer | Protokol | Avtentikacija | Pogostost klicev |
|---|---|---|---|---|
| Riftcodex | vhod | REST/JSON | – | ob sinhronizaciji kataloga |
| TCGCSV | vhod | HTTP/JSON (statične datoteke) | – (User-Agent) | 1× dnevno |
| Frankfurter | vhod | REST/JSON | – | 1× dnevno |
| Data Dragon | vhod | HTTP/JSON + slike | – | ob novi verziji |
| Discord | izhod | REST/JSON (webhook) | skrivni URL | ob sprožitvi alarma |
| Google Sheets | izhod | REST/JSON | OAuth 2.0 | na zahtevo uporabnika |

---

## 4. Opis podatkov

Vsi podatki se prenašajo v formatu **JSON** prek protokola **HTTPS**. Slike so podane kot URL-ji (PNG/JPG/WebP).

### 4.1 Vhodni podatki

#### Karta – Riftcodex (`Card`)

| Polje | Tip | Opis |
|---|---|---|
| `id` | string | Riftcodex ID |
| `name` | string | ime karte |
| `riftbound_id` | string | uradna oznaka karte |
| `tcgplayer_id` | string | ID izdelka na TCGplayer (= `productId` v TCGCSV) |
| `collector_number` | integer | zaporedna številka v setu |
| `attributes.energy` / `might` / `power` | integer (opcijsko) | cena energije, moč, power |
| `classification.type` / `supertype` | string | tip karte (Unit, Spell, Gear, Legend, Battlefield, Rune …) |
| `classification.rarity` | string | redkost |
| `classification.domain` | string[] | domene (barve) |
| `text.plain` / `text.rich` / `text.flavour` | string | besedilo karte |
| `set.set_id` / `set.label` | string | set |
| `media.image_url` | string (URL) | slika karte |
| `metadata.alternate_art` / `overnumbered` / `signature` | boolean | posebne različice |

Primer (skrajšano):

```json
{
  "id": "abc123",
  "name": "Jinx, Loose Cannon",
  "riftbound_id": "OGN-001",
  "tcgplayer_id": "612345",
  "collector_number": 1,
  "attributes": { "energy": 3, "might": 4 },
  "classification": { "type": "Unit", "rarity": "Rare", "domain": ["Fury"] },
  "text": { "plain": "..." },
  "set": { "set_id": "OGN", "label": "Origins" },
  "media": { "image_url": "https://..." }
}
```

*(Vrednosti v primeru so ilustrativne.)*

#### Set – TCGCSV (`Group`)

| Polje | Tip | Opis |
|---|---|---|
| `groupId` | int32 | ID seta (primarni ključ) |
| `name` | string | ime seta |
| `abbreviation` | string | okrajšava |
| `isSupplemental` | boolean | dodatni izdelek |
| `publishedOn` / `modifiedOn` | timestamp | datum izida / spremembe |
| `categoryId` | int32 | `89` za Riftbound |

#### Izdelek – TCGCSV (`Product`)

| Polje | Tip | Opis |
|---|---|---|
| `productId` | int32 | ID izdelka (primarni ključ) |
| `name` / `cleanName` | string | ime |
| `groupId` | int32 | set |
| `imageUrl` / `url` | string | slika / povezava na TCGplayer |
| `extendedData[]` | `{name, displayName, value}` | številka karte, redkost … |

#### Cena – TCGCSV (`Price`)

| Polje | Tip | Opis |
|---|---|---|
| `productId` | int32 | povezava na izdelek |
| `subTypeName` | string | različica (`Normal`, `Foil` …); ključ = `productId` + `subTypeName` |
| `lowPrice` / `midPrice` / `highPrice` | double | najnižja / srednja / najvišja cena (USD) |
| `marketPrice` | double (nullable) | tržna cena (USD) |
| `directLowPrice` | double (nullable) | najnižja cena TCGplayer Direct |

```json
{ "productId": 612345, "lowPrice": 1.25, "midPrice": 2.10, "highPrice": 9.99,
  "marketPrice": 1.87, "directLowPrice": null, "subTypeName": "Normal" }
```

#### Tečaj – Frankfurter (`ExchangeRate`)

```json
{ "amount": 1.0, "base": "USD", "date": "2026-10-26", "rates": { "EUR": 0.92 } }
```

#### Champion – Data Dragon (`Champion`)

| Polje | Tip | Opis |
|---|---|---|
| `id` | string | ključ championa (npr. `Jinx`) |
| `name` / `title` | string | ime in naziv |
| `lore` | string | zgodba |
| `image.full` | string | ime slikovne datoteke |

### 4.2 Interni podatkovni model (lastna baza)

| Entiteta | Polja | Opis |
|---|---|---|
| `Card` | `id`, `name`, `setId`, `collectorNumber`, `type`, `rarity`, `domains[]`, `energy`, `might`, `text`, `imageUrl`, `championKey` | normalizirana karta |
| `CardMapping` | `cardId`, `tcgProductId`, `matchMethod` (`tcgplayer_id` / `name`) | povezava katalog ↔ cene |
| `PriceSnapshot` | `cardId`, `variant`, `date`, `marketUsd`, `lowUsd`, `usdEurRate`, `marketEur`, `lowEur` | dnevni posnetek cene |
| `Collection` | `userId`, `items[] {cardId, variant, quantity}` | uporabnikova zbirka |
| `Deck` | `id`, `userId`, `name`, `legendId`, `battlefields[]`, `main[] {cardId, qty}`, `runes[] {cardId, qty}` | deck |
| `Alert` | `id`, `userId`, `cardId`, `variant`, `thresholdEur`, `webhookUrl`, `active`, `lastTriggeredAt` | cenovni alarm |

### 4.3 Izhodni podatki

#### Lasten REST API (primeri)

| Metoda | Pot | Opis |
|---|---|---|
| GET | `/api/cards?search=&set=` | iskanje kart s trenutno ceno v EUR |
| GET | `/api/cards/{id}/prices?from=&to=` | zgodovina cen |
| POST | `/api/decks/price` | telo: decklist (besedilo) → cena decka v EUR |
| GET/PUT | `/api/collection` | branje / posodobitev zbirke |
| GET | `/api/decks/{id}/missing` | manjkajoče karte in njihova cena |
| POST/DELETE | `/api/alerts` | upravljanje cenovnih alarmov |

Primer odgovora `POST /api/decks/price`:

```json
{
  "currency": "EUR",
  "rateDate": "2026-10-26",
  "total": 84.30,
  "cards": [
    { "cardId": "abc123", "name": "Jinx, Loose Cannon", "qty": 3, "unitEur": 1.72, "subtotalEur": 5.16 }
  ],
  "unmatched": ["Neznana karta"]
}
```

#### Obvestilo – Discord webhook

```json
{
  "content": "📉 Cena karte je padla pod tvoj prag!",
  "embeds": [{
    "title": "Jinx, Loose Cannon",
    "thumbnail": { "url": "https://..." },
    "fields": [
      { "name": "Prej", "value": "2,10 €", "inline": true },
      { "name": "Zdaj", "value": "1,72 €", "inline": true },
      { "name": "Prag", "value": "1,80 €", "inline": true }
    ]
  }]
}
```

#### Format decklista (vhod uporabnika)

Navadno besedilo, ena vrstica na karto: `<količina> <ime karte>`, npr.

```
1 Jinx, Loose Cannon
3 Get Excited!
3 Fury Rune
```

---

## 5. Tveganja

| Tveganje | Ukrep |
|---|---|
| Riftcodex je neuradna storitev (v0.x), API se lahko spremeni | lokalni predpomnilnik kataloga; uvoz izoliran v ločenem modulu |
| `tcgplayer_id` manjka ali se ne ujema | rezervno povezovanje po imenu in številki karte; neujemanja se beležijo |
| TCGCSV omeji ali blokira IP | upoštevanje pravil (User-Agent, premori, 1× dnevno) |
| Cene so iz ameriškega trga (TCGplayer) | jasna oznaka vira; pretvorba v EUR po tečaju ECB |

---

## 6. Pravno obvestilo

RiftVault was created under Riot Games' "Legal Jibber Jabber" policy using assets owned by Riot Games. Riot Games does not endorse or sponsor this project.

Projekt je nekomercialen in nastaja izključno v študijske namene.
