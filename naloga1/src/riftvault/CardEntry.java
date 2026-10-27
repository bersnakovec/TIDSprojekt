package riftvault;

import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

/** A card joined with its prices and the collection items that reference it. */
public record CardEntry(Card card, List<Price> prices, List<CollectionItem> items) {

    public Optional<Price> price(String variant) {
        return prices.stream()
                .filter(p -> p.variant().equalsIgnoreCase(variant))
                .findFirst();
    }

    /**
     * Price of the given variant, or the cheapest variant when variant is null.
     * Returns null when the card has no price.
     */
    public Double marketPrice(String variant) {
        if (variant != null) {
            return price(variant).map(Price::effectivePrice).orElse(null);
        }
        return prices.stream()
                .map(Price::effectivePrice)
                .filter(Objects::nonNull)
                .min(Comparator.naturalOrder())
                .orElse(null);
    }

    public int ownedQuantity() {
        return items.stream().mapToInt(CollectionItem::quantity).sum();
    }

    /** Current value of the owned copies; each item is valued at the price of its own variant. */
    public double collectionValueUsd() {
        double total = 0;
        for (CollectionItem item : items) {
            Double p = marketPrice(item.variant());
            if (p != null) {
                total += item.quantity() * p;
            }
        }
        return Math.round(total * 100) / 100.0;
    }
}
