package riftvault;

import java.math.BigDecimal;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

/**
 * Minimal pretty-printing JSON serializer for Map, List, String, Number, Boolean and null.
 * Written by hand so the project needs nothing beyond the JDK.
 */
public final class JsonWriter {

    private JsonWriter() {
    }

    public static String write(Object value) {
        StringBuilder sb = new StringBuilder();
        write(sb, value, 0);
        return sb.append('\n').toString();
    }

    private static void write(StringBuilder sb, Object value, int indent) {
        switch (value) {
            case null -> sb.append("null");
            case String s -> writeString(sb, s);
            case Double d -> sb.append(BigDecimal.valueOf(d).stripTrailingZeros().toPlainString());
            case Number n -> sb.append(n);
            case Boolean b -> sb.append(b);
            case Map<?, ?> map -> writeMap(sb, map, indent);
            case List<?> list -> writeList(sb, list, indent);
            default -> writeString(sb, value.toString());
        }
    }

    private static void writeMap(StringBuilder sb, Map<?, ?> map, int indent) {
        if (map.isEmpty()) {
            sb.append("{}");
            return;
        }
        sb.append("{\n");
        Iterator<? extends Map.Entry<?, ?>> it = map.entrySet().iterator();
        while (it.hasNext()) {
            Map.Entry<?, ?> e = it.next();
            pad(sb, indent + 1);
            writeString(sb, e.getKey().toString());
            sb.append(": ");
            write(sb, e.getValue(), indent + 1);
            sb.append(it.hasNext() ? ",\n" : "\n");
        }
        pad(sb, indent);
        sb.append('}');
    }

    private static void writeList(StringBuilder sb, List<?> list, int indent) {
        if (list.isEmpty()) {
            sb.append("[]");
            return;
        }
        sb.append("[\n");
        for (int i = 0; i < list.size(); i++) {
            pad(sb, indent + 1);
            write(sb, list.get(i), indent + 1);
            sb.append(i < list.size() - 1 ? ",\n" : "\n");
        }
        pad(sb, indent);
        sb.append(']');
    }

    private static void writeString(StringBuilder sb, String s) {
        sb.append('"');
        for (char c : s.toCharArray()) {
            switch (c) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                default -> {
                    if (c < 0x20) {
                        sb.append(String.format("\\u%04x", (int) c));
                    } else {
                        sb.append(c);
                    }
                }
            }
        }
        sb.append('"');
    }

    private static void pad(StringBuilder sb, int indent) {
        sb.append("  ".repeat(indent));
    }
}
