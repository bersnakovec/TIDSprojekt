package riftvault;

import java.util.List;
import java.util.Locale;

/** Prints filtered cards as a fixed-width console table. */
public final class TablePrinter {

    private static final String ROW = "%-4s %-36s %-4s %-11s %-9s %-13s %10s %4s %10s%n";

    private TablePrinter() {
    }

    public static void print(List<CardEntry> entries, String variant) {
        String priceHeader = variant == null ? "Cena USD" : "Cena " + variant;
        String header = String.format(Locale.ROOT, ROW,
                "ID", "Ime", "Set", "Tip", "Redkost", "Domene", priceHeader, "Kos", "Vrednost");
        System.out.print(header);
        System.out.println("-".repeat(header.length() - System.lineSeparator().length()));

        double totalValue = 0;
        int totalCopies = 0;
        for (CardEntry e : entries) {
            Card c = e.card();
            System.out.printf(Locale.ROOT, ROW,
                    c.id(),
                    truncate(c.name(), 36),
                    c.setCode(),
                    c.type(),
                    c.rarity(),
                    truncate(String.join("/", c.domains()), 13),
                    money(e.marketPrice(variant)),
                    e.ownedQuantity() == 0 ? "-" : e.ownedQuantity(),
                    e.ownedQuantity() == 0 ? "-" : money(e.collectionValueUsd()));
            totalValue += e.collectionValueUsd();
            totalCopies += e.ownedQuantity();
        }

        System.out.println();
        System.out.printf(Locale.ROOT, "Zadetkov: %d | kosov v zbirki: %d | vrednost zbirke: %s USD%n",
                entries.size(), totalCopies, money(totalValue));
    }

    private static String money(Double value) {
        return value == null ? "-" : String.format(Locale.ROOT, "%.2f", value);
    }

    private static String truncate(String s, int max) {
        return s.length() <= max ? s : s.substring(0, max - 3) + "...";
    }
}
