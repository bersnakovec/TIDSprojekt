# Naloga 3 – odprti podatki v formatu PC-Axis

Del projekta **RiftVault**. Spletna stran prikazuje, kako so se v Sloveniji spreminjale cene **iger in igrač** (kamor spadajo tudi kartne igre, kot je Riftbound) v primerjavi s splošno inflacijo. Podatki so iz **Statističnega urada RS (SURS)** in se ob nalaganju strani pridobijo kot datoteka **PC-Axis (`.px`)**.

## Podatki

| | |
|---|---|
| Tabela | **0400608S** – *Indeksi cen življenjskih potrebščin (ECOICOP ver. 2), Slovenija, mesečno* |
| Vir | SURS, SiStat ([pxweb.stat.si](https://pxweb.stat.si/SiStatData/pxweb/sl/Data/-/0400608S.px)); objavljeno tudi na portalu OPSI |
| Datoteka | `https://pxweb.stat.si/SiStatData/Resources/PX/Databases/Data/0400608S.px` (~7 MB, `windows-1250`) |
| Obseg | 435 kategorij × 322 mesecev (2000M01–2026M10) × 9 meritev = 1.260.630 vrednosti |
| Posodobitve | mesečno (naslednja objava je zapisana v datoteki, `NEXT-UPDATE`) |

**Povezava s temo:** kategorija **09.2.1.2 *Druge igre, igrače in izdelki za prostočasne dejavnosti*** zajema tudi družabne in zbirateljske kartne igre. RiftVault spremlja cene kart Riftbound, ta tabela pa da širši kontekst: ali so se igre podražile bolj ali manj kot vse ostalo.

Uporabljeni meritvi:
- **33 – Indeks (mesec / povprečje leta 2025)**: edina meritev, ki pokriva celotno obdobje in se še posodablja (indeks 2015 = 100 se po opombi SURS ne posodablja več),
- **0 – Struktura (%)**: delež kategorije v košarici življenjskih potrebščin.

Izbrane kategorije (fiksni vrstni red določa barvo v grafih): 09.2.1.2 druge igre in igrače, SKUPAJ, 09.2.1.1 videoigre in konzole, 09.2.1 igre, igrače in hobiji, 09 rekreacija, šport in kultura, 09.2.2 športna oprema, 09.7.1 knjige, 09.6.1 kino, gledališče in koncerti.

## Kako deluje

```
pxweb.stat.si/…/0400608S.px
  │  pogojni GET (If-None-Match / If-Modified-Since) ob vsakem nalaganju strani
  │  → 304: uporabi podatke v pomnilniku · 200: prenesi in razčleni na novo
  ▼
src/surs.js     prenos, dekodiranje windows-1250, razčlenitev s px.js, kopija v cache/
  ▼
src/cpi.js      izbor serij → preračun bazno leto = 100 → mesečne in letne vrednosti → povzetki
  ▼
src/server.js   Express: /api/meta, /api/cpi
  ▼
public/         Chart.js: črtni graf indeksa, stolpčni graf letne inflacije, kartice, kalkulator, tabela
```

| Datoteka | Vloga |
|---|---|
| `src/surs.js` | prenos `.px` s SURS, pogojni GET, predpomnilnik v pomnilniku in v `cache/` |
| `src/cpi.js` | razčlenjene podatke s **px.js** pretvori v časovne vrste, filtrira in agregira |
| `src/server.js` | Express strežnik in REST API |
| `public/index.html`, `app.js`, `style.css` | uporabniški vmesnik, grafi (Chart.js 4.4.1) |

### Zakaj prek zaledja

- Datoteka ima ~7 MB in je kodirana v `windows-1250`. Brskalnik dobi le nekaj kB obdelanih podatkov.
- Strežnik pri vsaki zahtevi (največ enkrat na 30 s) SURS vpraša, ali je datoteka nova. SURS odgovori `304 Not Modified`, dokler ne objavi novih podatkov, zato so podatki vedno sveži in nepotrebnih prenosov ni.
- Če SURS ni dosegljiv, se uporabi zadnja shranjena kopija iz `cache/`, stran pa to izpiše v vrstici stanja.
- Opomba: SURS-ov strežnik (IIS) na pogojne zahteve iz vgrajenega `fetch` (undici) vrača 200 namesto 304, zato prenos uporablja `node:https`.

### Razčlenjevanje PC-Axis

Uporabljena je knjižnica **[px.js](http://fod.github.io/px.js/)** (npm paket `px`). Iz datoteke se preberejo spremenljivke (`STUB`, `HEADING`), šifre (`CODES`), vrednosti (`VALUES`), metapodatki (`TITLE`, `SOURCE`, `LAST-UPDATED`, `NEXT-UPDATE`) in podatkovni blok `DATA`. Manjkajoče vrednosti (`"..."`, `"-"`) se pretvorijo v `null`.

## Obdelava podatkov

| Obdelava | Opis |
|---|---|
| **Filtriranje** | izbor kategorij in obdobja (od–do leta) |
| **Preračun baze** | indeks se preračuna tako, da je povprečje izbranega baznega leta = 100 (`indeks / povprečje(bazno leto) × 100`) |
| **Agregacija** | letna povprečja iz mesečnih indeksov; mesečni ali letni prikaz |
| **Medletna rast** | mesečno: mesec / isti mesec lani; letno: povprečje leta / povprečje lani. Za nedokončano leto (npr. 2026, jan–okt) se primerja z istimi meseci prejšnjega leta. |
| **Povzetki** | skupna sprememba v obdobju, povprečna letna rast (CAGR), zadnja medletna rast, razlika do splošne inflacije v odstotnih točkah, leto z najvišjo in najnižjo inflacijo |
| **Kalkulator** | preračun cene iz izbranega leta na zadnji mesec po indeksu iger oz. splošnem indeksu |

Rezultati se ujemajo s SURS-ovimi izračunanimi meritvami. Za 09.2.1.2 je medletna rast oktobra 2026 +2,7 % (SURS: indeks 102,7), povprečje jan–okt 2026 / jan–okt 2025 pa +3,75 % (SURS: 103,7).

## REST API

| Klic | Vrne |
|---|---|
| `GET /api/meta` | naslov, vir, obdobje, datum posodobitve in naslednje objave, seznam kategorij, stanje zadnjega prenosa |
| `GET /api/cpi?cats=09212,TOT&from=2015&to=2026&base=2015&freq=month` | izbrane serije (`points`), letne vrednosti (`yearly`), povzetke (`summary`) in opozorila |

Parametri: `cats` (šifre kategorij, ločene z vejico), `from`, `to` (leta), `base` (bazno leto, mora biti zaključeno), `freq` (`month` ali `year`).

## Namestitev in zagon

Potreben je **Node.js 18+**.

```bash
cd naloga3
npm install
npm start          # http://localhost:3000  (vrata lahko spremeniš s PORT=8080)
```

Ob zagonu strežnik prenese in razčleni tabelo (~1–2 s). Filtri so shranjeni v URL-ju (npr. `/?cats=09212,TOT&from=2005&base=2015&freq=year`), zato se pogled lahko deli s povezavo.

## Kaj stran pokaže

- **Kartice:** skupna sprememba cen v izbranem obdobju za vsako kategorijo in razlika do splošne inflacije. Od januarja 2015 do oktobra 2026 so se druge igre in igrače podražile za 16,2 %, vse življenjske potrebščine pa za 37,2 %.
- **Indeks cen:** gibanje indeksov skozi čas, s črtkano črto pri 100 (bazno leto).
- **Letna inflacija:** stolpčni graf sprememb letnih povprečij po kategorijah.
- **Kalkulator:** npr. izdelek za 4,99 € iz leta 2020 bi oktobra 2026 po indeksu iger stal 5,68 €, po splošni inflaciji pa 6,46 €.
- **Tabela** letnih vrednosti (dostopna različica grafov).
