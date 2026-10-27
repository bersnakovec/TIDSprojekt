package riftvault;

import java.time.LocalDate;

/** A daily price snapshot of one card variant, in USD (source: TCGCSV). */
public record Price(
        String id,
        String cardId,
        LocalDate date,
        String variant,
        Double lowPrice,
        Double midPrice,
        Double highPrice,
        Double marketPrice,
        Double directLowPrice) {

    /** Market price, or the lowest listing when TCGplayer has no market price yet. */
    public Double effectivePrice() {
        return marketPrice != null ? marketPrice : lowPrice;
    }
}
