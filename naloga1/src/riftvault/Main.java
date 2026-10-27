package riftvault;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.List;
import java.util.Scanner;

/**
 * RiftVault – Naloga 1: reads cards.xml, prices.xml and collection.xml, joins them by ID,
 * filters them and exports the result to filtrirano.json and filtrirano.xml.
 */
public class Main {

    public static void main(String[] args) {
        try {
            run(args);
        } catch (IllegalArgumentException e) {
            System.err.println("Napaka: " + e.getMessage());
            System.err.println("Za pomoč zaženi z --help.");
            System.exit(1);
        } catch (Exception e) {
            System.err.println("Napaka: " + e.getMessage());
            System.exit(2);
        }
    }

    private static void run(String[] args) throws Exception {
        Path dataDir = Path.of("data");
        Path outDir = Path.of("output");
        String sort = "name";
        CardFilter filter = new CardFilter();
        boolean all = false;

        for (int i = 0; i < args.length; i++) {
            String arg = args[i];
            if (!arg.startsWith("--")) {
                throw new IllegalArgumentException("nepričakovan argument \"" + arg + "\"");
            }
            String key = arg.substring(2);
            switch (key) {
                case "help" -> {
                    printUsage();
                    return;
                }
                case "all" -> all = true;
                case "owned" -> filter.set("owned", null);
                case "data" -> dataDir = Path.of(value(args, ++i, key));
                case "out" -> outDir = Path.of(value(args, ++i, key));
                case "sort" -> sort = value(args, ++i, key);
                default -> filter.set(key, value(args, ++i, key));
            }
        }

        // Without any filter flag the user picks the criteria interactively; --all skips that.
        if (filter.criteria().isEmpty() && !all) {
            askInteractively(filter);
        }
        Comparator<CardEntry> order = comparator(sort);

        XmlDataReader reader = new XmlDataReader();
        List<Card> cards = reader.readCards(dataDir.resolve("cards.xml"));
        List<Price> prices = reader.readPrices(dataDir.resolve("prices.xml"));
        List<CollectionItem> items = reader.readCollection(dataDir.resolve("collection.xml"));
        System.out.printf("Naloženo: %d kart, %d cen, %d vnosov v zbirki (%s)%n",
                cards.size(), prices.size(), items.size(), dataDir.toAbsolutePath().normalize());

        List<CardEntry> result = DataJoiner.join(cards, prices, items).stream()
                .filter(filter::matches)
                .sorted(order)
                .toList();

        System.out.println("Filter: " + filter.describe());
        System.out.println();
        TablePrinter.print(result, filter.variant());

        Files.createDirectories(outDir);
        Exporter exporter = new Exporter();
        Path json = outDir.resolve("filtrirano.json");
        Path xml = outDir.resolve("filtrirano.xml");
        exporter.writeJson(result, filter, json);
        exporter.writeXml(result, filter, xml);
        System.out.println();
        System.out.println("Shranjeno: " + json);
        System.out.println("Shranjeno: " + xml);
    }

    private static String value(String[] args, int i, String key) {
        if (i >= args.length || args[i].startsWith("--")) {
            throw new IllegalArgumentException("--" + key + " potrebuje vrednost");
        }
        return args[i];
    }

    private static Comparator<CardEntry> comparator(String sort) {
        Comparator<CardEntry> byName = Comparator.comparing(e -> e.card().name());
        return switch (sort) {
            case "name" -> byName;
            case "price" -> Comparator.comparing((CardEntry e) -> e.marketPrice(null),
                    Comparator.nullsLast(Comparator.reverseOrder())).thenComparing(byName);
            case "value" -> Comparator.comparingDouble(CardEntry::collectionValueUsd).reversed().thenComparing(byName);
            default -> throw new IllegalArgumentException("--sort mora biti name, price ali value");
        };
    }

    private static void askInteractively(CardFilter filter) {
        Scanner in = new Scanner(System.in);
        System.out.println("Interaktivni filter (Enter = preskoči).");
        ask(in, filter, "set", "Set (npr. UNL, OGN, SFD)");
        ask(in, filter, "type", "Tip (Unit, Spell, Gear, Legend, Battlefield)");
        ask(in, filter, "rarity", "Redkost (Common, Uncommon, Rare, Epic)");
        ask(in, filter, "domain", "Domena (Fury, Calm, Mind, Body, Chaos, Order)");
        ask(in, filter, "name", "Ime vsebuje");
        ask(in, filter, "variant", "Različica (Normal, Foil)");
        ask(in, filter, "min-price", "Najnižja cena v USD");
        ask(in, filter, "max-price", "Najvišja cena v USD");
        ask(in, filter, "owned", "Samo karte v zbirki? (da/ne)");
        ask(in, filter, "acquired-after", "Pridobljene po datumu (YYYY-MM-DD)");
        System.out.println();
    }

    /** Asks for one criterion and repeats the question until the answer is valid or empty. */
    private static void ask(Scanner in, CardFilter filter, String key, String label) {
        while (true) {
            System.out.print(label + ": ");
            if (!in.hasNextLine()) {
                return;
            }
            String answer = in.nextLine().trim();
            if (answer.isEmpty()) {
                return;
            }
            try {
                filter.set(key, answer);
                return;
            } catch (IllegalArgumentException e) {
                System.out.println("  " + e.getMessage() + ", poskusi znova.");
            }
        }
    }

    private static void printUsage() {
        System.out.println("""
                RiftVault – Naloga 1 (XML -> filter -> JSON/XML)

                Uporaba:
                  java -cp build riftvault.Main [možnosti]
                  Brez filtrov (in brez --all) program filter vpraša interaktivno.

                Filtri (vsi so opcijski, kombinirajo se z IN):
                  --set <koda>              set, npr. UNL
                  --type <tip>              Unit, Spell, Gear, Legend, Battlefield
                  --rarity <redkost>        Common, Uncommon, Rare, Epic
                  --domain <domena>         Fury, Calm, Mind, Body, Chaos, Order
                  --name <besedilo>         ime vsebuje besedilo
                  --variant <različica>     Normal ali Foil (cena se gleda za to različico)
                  --min-price <USD>         tržna cena vsaj
                  --max-price <USD>         tržna cena največ
                  --owned                   samo karte, ki so v zbirki
                  --acquired-after <datum>  v zbirko dodane po datumu YYYY-MM-DD
                  --all                     brez filtra (vse karte)

                Ostalo:
                  --sort name|price|value   razvrščanje (privzeto name)
                  --data <mapa>             mapa z XML datotekami (privzeto data)
                  --out <mapa>              mapa za izhod (privzeto output)
                  --help                    ta pomoč
                """);
    }
}
