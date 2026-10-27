package riftvault;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Filter criteria; all criteria that are set must match (logical AND). */
public final class CardFilter {

    /** Criterion keys, shared by command-line flags (--key) and the interactive prompt. */
    public static final List<String> KEYS = List.of(
            "set", "type", "rarity", "domain", "name", "variant",
            "min-price", "max-price", "owned", "acquired-after");

    private final Map<String, Object> criteria = new LinkedHashMap<>();

    public void set(String key, String value) {
        if (!KEYS.contains(key)) {
            throw new IllegalArgumentException("neznan filter --" + key);
        }
        if (key.equals("owned")) {
            criteria.put(key, value == null || value.isBlank() || isYes(value));
            return;
        }
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("filter --" + key + " potrebuje vrednost");
        }
        criteria.put(key, switch (key) {
            case "min-price", "max-price" -> parsePrice(key, value);
            case "acquired-after" -> parseDate(value);
            default -> value.trim();
        });
    }

    public String variant() {
        return (String) criteria.get("variant");
    }

    public boolean matches(CardEntry entry) {
        Card card = entry.card();
        if (!equalsIgnoreCase("set", card.setCode())
                || !equalsIgnoreCase("type", card.type())
                || !equalsIgnoreCase("rarity", card.rarity())) {
            return false;
        }
        if (criteria.get("domain") instanceof String domain
                && card.domains().stream().noneMatch(domain::equalsIgnoreCase)) {
            return false;
        }
        if (criteria.get("name") instanceof String name
                && !card.name().toLowerCase().contains(name.toLowerCase())) {
            return false;
        }
        if (variant() != null && entry.price(variant()).isEmpty()) {
            return false;
        }

        Double price = entry.marketPrice(variant());
        if (criteria.get("min-price") instanceof Double min && (price == null || price < min)) {
            return false;
        }
        if (criteria.get("max-price") instanceof Double max && (price == null || price > max)) {
            return false;
        }

        if (Boolean.TRUE.equals(criteria.get("owned")) && entry.ownedQuantity() == 0) {
            return false;
        }
        if (criteria.get("acquired-after") instanceof LocalDate after
                && entry.items().stream().noneMatch(i -> i.acquiredDate() != null && i.acquiredDate().isAfter(after))) {
            return false;
        }
        return true;
    }

    /** Active criteria in insertion order, used for the console header and the exports. */
    public Map<String, Object> criteria() {
        return new LinkedHashMap<>(criteria);
    }

    public String describe() {
        if (criteria.isEmpty()) {
            return "(brez filtra – vse karte)";
        }
        StringBuilder sb = new StringBuilder();
        criteria.forEach((k, v) -> sb.append(sb.isEmpty() ? "" : ", ").append(k).append('=').append(v));
        return sb.toString();
    }

    private boolean equalsIgnoreCase(String key, String actual) {
        Object expected = criteria.get(key);
        return expected == null || ((String) expected).equalsIgnoreCase(actual);
    }

    private static boolean isYes(String value) {
        return switch (value.trim().toLowerCase()) {
            case "da", "d", "yes", "y", "true" -> true;
            default -> false;
        };
    }

    private static Double parsePrice(String key, String value) {
        try {
            return Double.valueOf(value.trim().replace(',', '.'));
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("--" + key + " mora biti število, npr. 2.50");
        }
    }

    private static LocalDate parseDate(String value) {
        try {
            return LocalDate.parse(value.trim());
        } catch (DateTimeParseException e) {
            throw new IllegalArgumentException("datum mora biti v obliki YYYY-MM-DD");
        }
    }
}
