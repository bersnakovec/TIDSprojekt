# Naloga 1 – XML → filter → JSON / XML

Prvi korak projekta **RiftVault** (sledenje zbirki in cenam kart igre Riftbound).
Aplikacija v Javi prebere tri med seboj povezane XML datoteke, jih poveže prek ID-jev, filtrira po kriterijih uporabnika, rezultat izpiše v konzolo kot tabelo in ga izvozi v `filtrirano.json` in `filtrirano.xml`.

## Vsebina

```
naloga1/
├── data/
│   ├── cards.xml        karte (25)
│   ├── prices.xml       cene kart (35)
│   └── collection.xml   uporabnikova zbirka (19)
├── src/riftvault/       izvorna koda (Java 21, samo JDK – brez zunanjih knjižnic)
├── output/              primer izhoda: filtrirano.json, filtrirano.xml
└── README.md
```

## Podatki

Karte in cene so **resnični podatki**, pridobljeni 27. 10. 2026 iz storitev, ki jih bo uporabljal celoten projekt:

- `cards.xml` – [Riftcodex API](https://riftcodex.com/docs) (`GET https://api.riftcodex.com/cards`)
- `prices.xml` – [TCGCSV](https://tcgcsv.com/docs) (dnevno zrcalo trgovine TCGplayer, kategorija 89 = Riftbound), cene v USD na dan 2026-10-26
- `collection.xml` – vzorčna osebna zbirka, ki jo vnese uporabnik (izmišljeni podatki)

### Povezave med datotekami

```
cards.xml          prices.xml               collection.xml
<card id="C05"> ◄── <price cardId="C05">     
                ◄─────────────────────────── <item cardId="C05">
```

| Datoteka | Entiteta | ID | Tuji ključ |
|---|---|---|---|
| `cards.xml` | `card` | `id` (C01 …) | – |
| `prices.xml` | `price` | `id` (P01 …) | `cardId` → `card/@id` |
| `collection.xml` | `item` | `id` (K01 …) | `cardId` → `card/@id` |

### Izpolnjene zahteve

| Zahteva | Kje |
|---|---|
| ≥ 10–15 elementov v datoteki | 25 kart, 35 cen, 19 vnosov |
| unikaten atribut ID | `id` na vsakem elementu; program ob branju preveri, da se ID ne podvaja |
| povezave prek ID | `price/@cardId`, `item/@cardId` |
| datum `YYYY-MM-DD` | `price/date`, `item/acquiredDate` |
| številčna polja | `energy`, `might`, `collectorNumber`, cene, `quantity` |
| besedilna polja | `name`, `type`, `rarity`, `text`, `condition`, `note` |
| prazna vrednost | `<energy/>`, `<might/>` (legende, battlefieldi), `<directLowPrice/>`, `<acquiredDate></acquiredDate>` pri K12 |
| manjkajoč podatek | `purchasePriceUsd` in `note` sta pri večini vnosov izpuščena |

Primer karte:

```xml
<card id="C02" riftcodexId="69c4407d9288b1e85d94de98" tcgplayerId="685595">
  <name>Vi - Peacekeeper</name>
  <set code="UNL">Unleashed</set>
  <collectorNumber>176</collectorNumber>
  <type>Unit</type>
  <rarity>Rare</rarity>
  <domains><domain>Order</domain></domains>
  <energy>5</energy>
  <might>5</might>
  ...
</card>
```

## Delovanje aplikacije

| Korak | Razred |
|---|---|
| Branje XML in deserializacija v objekte (DOM parser, Java `record`) | `XmlDataReader`, `Card`, `Price`, `CollectionItem` |
| Povezovanje prek ID-jev (karta + njene cene + vnosi v zbirki) | `DataJoiner`, `CardEntry` |
| Filtriranje (več kriterijev, kombinirajo se z IN) | `CardFilter` |
| Izpis tabele v konzolo | `TablePrinter` |
| Izvoz v JSON (lasten serializator, brez knjižnic) | `Exporter`, `JsonWriter` |
| Izvoz v nov XML (DOM + `Transformer`) | `Exporter` |

Sklici na neobstoječo karto se izpišejo kot opozorilo in preskočijo. Podvojen ID ali manjkajoč atribut `id` ustavi program z napako.

**Vrednost zbirke** je seštevek *količina × tržna cena* za vsak vnos, po ceni različice (Normal/Foil), ki jo uporabnik dejansko ima. Stolpec **Cena** prikazuje najcenejšo različico oziroma različico, izbrano z `--variant`.

## Zagon

Potrebna je **Java 21** (JDK). Ukazi se izvedejo v mapi `naloga1`.

```bash
# prevajanje
javac -d build -sourcepath src src/riftvault/Main.java

# pomoč
java -cp build riftvault.Main --help
```

### Filtri

| Možnost | Pomen |
|---|---|
| `--set <koda>` | set, npr. `UNL`, `OGN`, `SFD` |
| `--type <tip>` | `Unit`, `Spell`, `Gear`, `Legend`, `Battlefield`, `Rune` |
| `--rarity <redkost>` | `Common`, `Uncommon`, `Rare`, `Epic` |
| `--domain <domena>` | `Fury`, `Calm`, `Mind`, `Body`, `Chaos`, `Order` |
| `--name <besedilo>` | ime vsebuje besedilo |
| `--variant <različica>` | `Normal` ali `Foil` |
| `--min-price` / `--max-price <USD>` | razpon tržne cene |
| `--owned` | samo karte v zbirki |
| `--acquired-after <YYYY-MM-DD>` | v zbirko dodane po datumu |
| `--all` | brez filtra |
| `--sort name\|price\|value` | razvrščanje |
| `--data <mapa>` / `--out <mapa>` | vhodna / izhodna mapa (privzeto `data` / `output`) |

Brez filtrov (in brez `--all`) program kriterije vpraša **interaktivno**; Enter vprašanje preskoči.

### Primeri

```bash
# karte v zbirki, pridobljene v letu 2026, razvrščene po vrednosti (= primer v mapi output/)
java -cp build riftvault.Main --owned --acquired-after 2026-01-01 --sort value

# vse karte iz seta Origins
java -cp build riftvault.Main --set OGN

# foil karte domene Fury do 1 USD
java -cp build riftvault.Main --variant Foil --domain Fury --max-price 1

# interaktivno
java -cp build riftvault.Main
```

Primer izpisa:

```
Naloženo: 25 kart, 35 cen, 19 vnosov v zbirki (...\naloga1\data)
Filter: owned=true, acquired-after=2026-01-01

ID   Ime                                  Set  Tip         Redkost   Domene          Cena USD  Kos   Vrednost
-------------------------------------------------------------------------------------------------------------
C04  Jhin - Virtuoso (Overnumbered)       UNL  Legend      Rare      Fury/Mind          68.23    1      68.23
C23  Arise!                               SFD  Spell       Epic      Calm/Order         17.69    1      17.69
C21  Salvage                              OGN  Spell       Uncommon  Order               3.36    2       6.72
...
Zadetkov: 15 | kosov v zbirki: 27 | vrednost zbirke: 121.18 USD

Shranjeno: output\filtrirano.json
Shranjeno: output\filtrirano.xml
```

> Če se šumniki v Windows konzoli ne izpišejo pravilno, zaženi `chcp 65001` ali dodaj `-Dstdout.encoding=UTF-8` k ukazu `java`.

## Izhod

`filtrirano.json` – objekt z metapodatki in seznamom kart; vsaka karta vsebuje svoje cene in vnose iz zbirke:

```json
{
  "generatedAt": "2026-10-27T00:32:41",
  "filter": { "owned": "true", "acquired-after": "2026-01-01" },
  "count": 15,
  "totalCollectionValueUsd": 121.18,
  "cards": [
    {
      "id": "C04",
      "name": "Jhin - Virtuoso (Overnumbered)",
      "set": { "code": "UNL", "name": "Unleashed" },
      "energy": null,
      "prices": [ { "id": "P04", "date": "2026-10-26", "variant": "Foil", "marketPrice": 68.23, "currency": "USD" } ],
      "collection": { "quantity": 1, "valueUsd": 68.23, "items": [ { "id": "K15", "acquiredDate": "2026-08-05" } ] }
    }
  ]
}
```

`filtrirano.xml` – enaka vsebina v XML; povezani zapisi (cene, vnosi zbirke) so vgnezdeni v `<card>`, ID-ji ostanejo v atributih:

```xml
<filteredCards count="15" generatedAt="..." totalCollectionValueUsd="121.18">
  <filter>
    <criterion name="owned">true</criterion>
    <criterion name="acquired-after">2026-01-01</criterion>
  </filter>
  <card id="C04" riftcodexId="..." tcgplayerId="685602">
    <name>Jhin - Virtuoso (Overnumbered)</name>
    ...
    <prices currency="USD">
      <price date="2026-10-26" id="P04" variant="Foil">...</price>
    </prices>
    <collection quantity="1" valueUsd="68.23">
      <item id="K15">...</item>
    </collection>
  </card>
</filteredCards>
```
