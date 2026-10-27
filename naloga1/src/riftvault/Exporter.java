package riftvault;

import org.w3c.dom.Document;
import org.w3c.dom.Element;

import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.transform.OutputKeys;
import javax.xml.transform.Transformer;
import javax.xml.transform.TransformerFactory;
import javax.xml.transform.dom.DOMSource;
import javax.xml.transform.stream.StreamResult;
import java.io.StringWriter;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Writes the filtered cards to filtrirano.json and filtrirano.xml. */
public final class Exporter {

    private final String generatedAt = LocalDateTime.now().truncatedTo(ChronoUnit.SECONDS).toString();

    // ---------- JSON ----------

    public void writeJson(List<CardEntry> entries, CardFilter filter, Path file) throws Exception {
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("generatedAt", generatedAt);
        root.put("filter", stringify(filter.criteria()));
        root.put("count", entries.size());
        root.put("totalCollectionValueUsd", totalValue(entries));
        List<Object> cards = new ArrayList<>();
        for (CardEntry e : entries) {
            cards.add(cardToMap(e));
        }
        root.put("cards", cards);
        Files.writeString(file, JsonWriter.write(root), StandardCharsets.UTF_8);
    }

    private static Map<String, Object> cardToMap(CardEntry e) {
        Card c = e.card();
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", c.id());
        m.put("riftcodexId", c.riftcodexId());
        m.put("tcgplayerId", c.tcgplayerId());
        m.put("name", c.name());
        Map<String, Object> set = new LinkedHashMap<>();
        set.put("code", c.setCode());
        set.put("name", c.setName());
        m.put("set", set);
        m.put("collectorNumber", c.collectorNumber());
        m.put("type", c.type());
        m.put("rarity", c.rarity());
        m.put("domains", c.domains());
        m.put("energy", c.energy());
        m.put("might", c.might());
        m.put("text", c.text());
        m.put("imageUrl", c.imageUrl());

        List<Object> prices = new ArrayList<>();
        for (Price p : e.prices()) {
            Map<String, Object> pm = new LinkedHashMap<>();
            pm.put("id", p.id());
            pm.put("date", str(p.date()));
            pm.put("variant", p.variant());
            pm.put("lowPrice", p.lowPrice());
            pm.put("midPrice", p.midPrice());
            pm.put("highPrice", p.highPrice());
            pm.put("marketPrice", p.marketPrice());
            pm.put("currency", "USD");
            prices.add(pm);
        }
        m.put("prices", prices);

        List<Object> items = new ArrayList<>();
        for (CollectionItem i : e.items()) {
            Map<String, Object> im = new LinkedHashMap<>();
            im.put("id", i.id());
            im.put("variant", i.variant());
            im.put("quantity", i.quantity());
            im.put("condition", i.condition());
            im.put("acquiredDate", str(i.acquiredDate()));
            im.put("purchasePriceUsd", i.purchasePriceUsd());
            im.put("note", i.note());
            items.add(im);
        }
        Map<String, Object> collection = new LinkedHashMap<>();
        collection.put("quantity", e.ownedQuantity());
        collection.put("valueUsd", e.collectionValueUsd());
        collection.put("items", items);
        m.put("collection", collection);
        return m;
    }

    // ---------- XML ----------

    public void writeXml(List<CardEntry> entries, CardFilter filter, Path file) throws Exception {
        Document doc = DocumentBuilderFactory.newInstance().newDocumentBuilder().newDocument();
        Element root = doc.createElement("filteredCards");
        root.setAttribute("generatedAt", generatedAt);
        root.setAttribute("count", String.valueOf(entries.size()));
        root.setAttribute("totalCollectionValueUsd", str(totalValue(entries)));
        doc.appendChild(root);

        Element filterEl = child(doc, root, "filter", null);
        stringify(filter.criteria()).forEach((k, v) -> child(doc, filterEl, "criterion", v).setAttribute("name", k));

        for (CardEntry e : entries) {
            Card c = e.card();
            Element card = child(doc, root, "card", null);
            card.setAttribute("id", c.id());
            card.setAttribute("riftcodexId", c.riftcodexId());
            card.setAttribute("tcgplayerId", c.tcgplayerId());
            child(doc, card, "name", c.name());
            child(doc, card, "set", c.setName()).setAttribute("code", c.setCode());
            child(doc, card, "collectorNumber", str(c.collectorNumber()));
            child(doc, card, "type", c.type());
            child(doc, card, "rarity", c.rarity());
            Element domains = child(doc, card, "domains", null);
            c.domains().forEach(d -> child(doc, domains, "domain", d));
            child(doc, card, "energy", str(c.energy()));
            child(doc, card, "might", str(c.might()));
            child(doc, card, "text", c.text());

            Element prices = child(doc, card, "prices", null);
            prices.setAttribute("currency", "USD");
            for (Price p : e.prices()) {
                Element price = child(doc, prices, "price", null);
                price.setAttribute("id", p.id());
                price.setAttribute("variant", p.variant());
                price.setAttribute("date", str(p.date()));
                child(doc, price, "lowPrice", str(p.lowPrice()));
                child(doc, price, "midPrice", str(p.midPrice()));
                child(doc, price, "highPrice", str(p.highPrice()));
                child(doc, price, "marketPrice", str(p.marketPrice()));
            }

            Element collection = child(doc, card, "collection", null);
            collection.setAttribute("quantity", String.valueOf(e.ownedQuantity()));
            collection.setAttribute("valueUsd", str(e.collectionValueUsd()));
            for (CollectionItem i : e.items()) {
                Element item = child(doc, collection, "item", null);
                item.setAttribute("id", i.id());
                child(doc, item, "variant", i.variant());
                child(doc, item, "quantity", String.valueOf(i.quantity()));
                child(doc, item, "condition", i.condition());
                child(doc, item, "acquiredDate", str(i.acquiredDate()));
                child(doc, item, "purchasePriceUsd", str(i.purchasePriceUsd()));
                child(doc, item, "note", i.note());
            }
        }

        Transformer t = TransformerFactory.newInstance().newTransformer();
        t.setOutputProperty(OutputKeys.INDENT, "yes");
        t.setOutputProperty("{http://xml.apache.org/xslt}indent-amount", "2");
        // The JDK transformer puts the root element on the declaration line, so the declaration is written by hand.
        t.setOutputProperty(OutputKeys.OMIT_XML_DECLARATION, "yes");
        StringWriter body = new StringWriter();
        t.transform(new DOMSource(doc), new StreamResult(body));
        Files.writeString(file, "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n" + body, StandardCharsets.UTF_8);
    }

    /** Appends a child element; a null text produces an empty element, as in the input files. */
    private static Element child(Document doc, Element parent, String name, String text) {
        Element el = doc.createElement(name);
        if (text != null) {
            el.setTextContent(text);
        }
        parent.appendChild(el);
        return el;
    }

    // ---------- helpers ----------

    private static double totalValue(List<CardEntry> entries) {
        double total = entries.stream().mapToDouble(CardEntry::collectionValueUsd).sum();
        return Math.round(total * 100) / 100.0;
    }

    private static Map<String, String> stringify(Map<String, Object> criteria) {
        Map<String, String> out = new LinkedHashMap<>();
        criteria.forEach((k, v) -> out.put(k, String.valueOf(v)));
        return out;
    }

    private static String str(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Double d) {
            return BigDecimal.valueOf(d).stripTrailingZeros().toPlainString();
        }
        return value.toString();
    }
}
