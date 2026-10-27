package riftvault;

import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;

import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.function.Function;

/** Reads the XML data files and deserializes them into records (DOM parser). */
public class XmlDataReader {

    private final DocumentBuilder builder;

    public XmlDataReader() throws Exception {
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        // Data files never need a DTD; disabling it also blocks XXE attacks.
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
        builder = factory.newDocumentBuilder();
    }

    public List<Card> readCards(Path file) throws Exception {
        return readAll(file, "card", e -> {
            Element set = firstChild(e, "set");
            List<String> domains = new ArrayList<>();
            NodeList domainNodes = e.getElementsByTagName("domain");
            for (int i = 0; i < domainNodes.getLength(); i++) {
                domains.add(domainNodes.item(i).getTextContent().trim());
            }
            return new Card(
                    requiredAttr(e, "id"),
                    attr(e, "riftcodexId"),
                    attr(e, "tcgplayerId"),
                    text(e, "name"),
                    set == null ? null : attr(set, "code"),
                    set == null ? null : blankToNull(set.getTextContent()),
                    toInt(text(e, "collectorNumber")),
                    text(e, "type"),
                    text(e, "rarity"),
                    List.copyOf(domains),
                    toInt(text(e, "energy")),
                    toInt(text(e, "might")),
                    text(e, "text"),
                    text(e, "artist"),
                    text(e, "imageUrl"));
        }, Card::id);
    }

    public List<Price> readPrices(Path file) throws Exception {
        return readAll(file, "price", e -> new Price(
                requiredAttr(e, "id"),
                requiredAttr(e, "cardId"),
                toDate(text(e, "date")),
                text(e, "variant"),
                toDouble(text(e, "lowPrice")),
                toDouble(text(e, "midPrice")),
                toDouble(text(e, "highPrice")),
                toDouble(text(e, "marketPrice")),
                toDouble(text(e, "directLowPrice"))), Price::id);
    }

    public List<CollectionItem> readCollection(Path file) throws Exception {
        return readAll(file, "item", e -> {
            Integer quantity = toInt(text(e, "quantity"));
            return new CollectionItem(
                    requiredAttr(e, "id"),
                    requiredAttr(e, "cardId"),
                    text(e, "variant"),
                    quantity == null ? 1 : quantity,
                    text(e, "condition"),
                    toDate(text(e, "acquiredDate")),
                    toDouble(text(e, "purchasePriceUsd")),
                    text(e, "note"));
        }, CollectionItem::id);
    }

    /** Maps every element with the given tag and checks that the IDs are unique. */
    private <T> List<T> readAll(Path file, String tag, Function<Element, T> mapper,
                                Function<T, String> idOf) throws Exception {
        Document doc = builder.parse(file.toFile());
        NodeList nodes = doc.getDocumentElement().getElementsByTagName(tag);
        List<T> result = new ArrayList<>();
        Set<String> ids = new HashSet<>();
        for (int i = 0; i < nodes.getLength(); i++) {
            T item = mapper.apply((Element) nodes.item(i));
            if (!ids.add(idOf.apply(item))) {
                throw new IllegalStateException(file.getFileName() + ": podvojen id \"" + idOf.apply(item) + "\"");
            }
            result.add(item);
        }
        return result;
    }

    private static Element firstChild(Element parent, String tag) {
        NodeList nodes = parent.getElementsByTagName(tag);
        return nodes.getLength() == 0 ? null : (Element) nodes.item(0);
    }

    /** Text of a child element; null when the element is missing or empty. */
    private static String text(Element parent, String tag) {
        Element child = firstChild(parent, tag);
        return child == null ? null : blankToNull(child.getTextContent());
    }

    private static String attr(Element e, String name) {
        return blankToNull(e.getAttribute(name));
    }

    private static String requiredAttr(Element e, String name) {
        String value = attr(e, name);
        if (value == null) {
            throw new IllegalStateException("<" + e.getTagName() + "> nima atributa " + name);
        }
        return value;
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    private static Integer toInt(String s) {
        return s == null ? null : Integer.valueOf(s);
    }

    private static Double toDouble(String s) {
        return s == null ? null : Double.valueOf(s);
    }

    private static LocalDate toDate(String s) {
        return s == null ? null : LocalDate.parse(s);
    }
}
