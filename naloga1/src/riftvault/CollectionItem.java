package riftvault;

import java.time.LocalDate;

/** One entry of the user's collection. acquiredDate, purchasePriceUsd and note may be null. */
public record CollectionItem(
        String id,
        String cardId,
        String variant,
        int quantity,
        String condition,
        LocalDate acquiredDate,
        Double purchasePriceUsd,
        String note) {
}
