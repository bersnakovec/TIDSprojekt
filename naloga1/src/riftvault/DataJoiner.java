package riftvault;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Joins prices and collection items to cards through the cardId reference. */
public final class DataJoiner {

    private DataJoiner() {
    }

    public static List<CardEntry> join(List<Card> cards, List<Price> prices, List<CollectionItem> items) {
        Map<String, List<Price>> pricesByCard = new LinkedHashMap<>();
        Map<String, List<CollectionItem>> itemsByCard = new LinkedHashMap<>();
        for (Card card : cards) {
            pricesByCard.put(card.id(), new ArrayList<>());
            itemsByCard.put(card.id(), new ArrayList<>());
        }

        for (Price price : prices) {
            List<Price> list = pricesByCard.get(price.cardId());
            if (list == null) {
                warnDangling("cena", price.id(), price.cardId());
            } else {
                list.add(price);
            }
        }
        for (CollectionItem item : items) {
            List<CollectionItem> list = itemsByCard.get(item.cardId());
            if (list == null) {
                warnDangling("vnos v zbirki", item.id(), item.cardId());
            } else {
                list.add(item);
            }
        }

        List<CardEntry> entries = new ArrayList<>();
        for (Card card : cards) {
            entries.add(new CardEntry(card,
                    List.copyOf(pricesByCard.get(card.id())),
                    List.copyOf(itemsByCard.get(card.id()))));
        }
        return entries;
    }

    private static void warnDangling(String what, String id, String cardId) {
        System.err.printf("Opozorilo: %s %s se sklicuje na neobstoječo karto %s, preskočeno.%n", what, id, cardId);
    }
}
