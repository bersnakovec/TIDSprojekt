package riftvault;

import java.util.List;

/** A Riftbound card as stored in cards.xml (source: Riftcodex API). */
public record Card(
        String id,
        String riftcodexId,
        String tcgplayerId,
        String name,
        String setCode,
        String setName,
        Integer collectorNumber,
        String type,
        String rarity,
        List<String> domains,
        Integer energy,
        Integer might,
        String text,
        String artist,
        String imageUrl) {
}
