package org.unlaxer.tramli.plugins.audit;

import java.util.Iterator;
import java.util.List;
import java.util.Map;

public final class AuditJsonExporter {
    private AuditJsonExporter() {}

    public static String toJson(List<AuditedTransitionRecord> records) {
        StringBuilder sb = new StringBuilder("[\n");
        for (int i = 0; i < records.size(); i++) {
            AuditedTransitionRecord r = records.get(i);
            sb.append("  {\"flowId\":\"").append(esc(r.flowId())).append("\",")
              .append("\"from\":").append(jsonString(r.from())).append(',')
              .append("\"to\":").append(jsonString(r.to())).append(',')
              .append("\"trigger\":\"").append(esc(r.trigger())).append("\",")
              .append("\"timestamp\":\"").append(r.timestamp()).append("\",")
              .append("\"producedData\":").append(mapToJson(r.producedData()))
              .append('}');
            if (i + 1 < records.size()) sb.append(',');
            sb.append('\n');
        }
        return sb.append(']').toString();
    }

    private static String mapToJson(Map<String, String> map) {
        StringBuilder sb = new StringBuilder("{");
        Iterator<Map.Entry<String, String>> it = map.entrySet().iterator();
        while (it.hasNext()) {
            Map.Entry<String, String> e = it.next();
            sb.append('"').append(esc(e.getKey())).append("\":").append(e.getValue());
            if (it.hasNext()) sb.append(',');
        }
        return sb.append('}').toString();
    }

    private static String jsonString(String s) {
        return s == null ? "null" : ('"' + esc(s) + '"');
    }

    private static String esc(String s) {
        return s.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
