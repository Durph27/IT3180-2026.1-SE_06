package com.bluemoon.backend.api;

import java.io.IOException;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;
import static com.bluemoon.backend.api.Values.*;

/** Request schemas and SQL identifiers are loaded from a reviewed, local allowlist. */
@Component
public class Contract {
    public final JsonMapper json = JsonMapper.builder().build();
    private final Map<String, Object> document;
    @SuppressWarnings("unchecked")
    public Contract() throws IOException {
        document = ContractMetadata.load(json);
    }
    public Map<String, Object> section(String name) { return object(document.get(name)); }
    public Map<String, Object> route(String key) { return object(section("routes").get(key)); }
    public Map<String, Object> entity(String name) {
        var entity = object(section("entities").get(name));
        if (entity == null) throw new IllegalArgumentException("Unknown storage model");
        return entity;
    }
    @SuppressWarnings("unchecked")
    public List<String> permissions() { return (List<String>) document.get("permissions"); }
    public Map<String, Object> resolve(Map<String, Object> schema) {
        return schema.containsKey("$ref") ? object(section("schemas").get(schema.get("$ref").toString().replace("#/components/schemas/", ""))) : schema;
    }
    public void validate(Object value, Map<String, Object> original, String path) {
        Map<String, Object> s = resolve(original);
        if (value == null) {
            if (!Boolean.TRUE.equals(s.get("nullable"))) throw ApiException.bad(path + " không được null.");
            return;
        }
        if (s.containsKey("enum") && !((List<?>) s.get("enum")).contains(value)) throw ApiException.bad(path + " không thuộc enum.");
        if (s.containsKey("not")) {
            boolean matched = false;
            try { validate(value, object(s.get("not")), path); matched = true; } catch (ApiException ignored) { }
            if (matched) throw ApiException.bad(path + " có giá trị không hợp lệ.");
        }
        if (s.containsKey("oneOf")) {
            int matches = 0;
            for (var branch : objects(s.get("oneOf"))) {
                try { validate(value, branch, path); matches++; } catch (ApiException ignored) { }
            }
            if (matches != 1) throw ApiException.bad(path + " không khớp cấu trúc nghiệp vụ.");
        }
        String type = Objects.toString(s.get("type"), s.containsKey("properties") || s.containsKey("required") ? "object" : "");
        switch (type) {
            case "object" -> {
                if (!(value instanceof Map<?, ?>)) throw ApiException.bad(path + " phải là object.");
                var m = object(value);
                for (Object required : (List<?>) s.getOrDefault("required", List.of()))
                    if (!m.containsKey(required.toString())) throw ApiException.bad(path + "." + required + " bị thiếu.");
                var props = object(s.getOrDefault("properties", Map.of()));
                for (var entry : m.entrySet()) {
                    if (!props.containsKey(entry.getKey())) {
                        if (Boolean.FALSE.equals(s.get("additionalProperties"))) throw new ApiException(400, "UNKNOWN_FIELD", path + "." + entry.getKey() + " không được hỗ trợ.");
                    } else validate(entry.getValue(), object(props.get(entry.getKey())), path + "." + entry.getKey());
                }
                if (s.containsKey("minProperties") && m.size() < ((Number)s.get("minProperties")).intValue()) throw ApiException.bad("Body rỗng.");
            }
            case "string" -> {
                if (!(value instanceof String)) throw ApiException.bad(path + " phải là chuỗi.");
                String str = (String) value;
                if (str.length() < ((Number)s.getOrDefault("minLength", 0)).intValue() || str.length() > ((Number)s.getOrDefault("maxLength", Integer.MAX_VALUE)).intValue()) throw ApiException.bad(path + " sai độ dài.");
                if (s.containsKey("pattern") && !str.matches(s.get("pattern").toString())) throw ApiException.bad(path + " sai định dạng.");
                try {
                    switch (Objects.toString(s.get("format"), "")) {
                        case "uuid" -> { if (!UUID.fromString(str).toString().equalsIgnoreCase(str)) throw new IllegalArgumentException(); }
                        case "date" -> LocalDate.parse(str);
                        case "date-time" -> OffsetDateTime.parse(str);
                        default -> { }
                    }
                } catch (IllegalArgumentException | DateTimeException e) { throw ApiException.bad(path + " sai định dạng."); }
            }
            case "integer", "number" -> {
                if (!(value instanceof Number)) throw ApiException.bad(path + " phải là số.");
                var n = decimal(value);
                if (type.equals("integer") && n.stripTrailingZeros().scale() > 0) throw ApiException.bad(path + " phải là số nguyên.");
                if ("int32".equals(s.get("format")) && (n.compareTo(BigDecimal.valueOf(Integer.MIN_VALUE)) < 0 || n.compareTo(BigDecimal.valueOf(Integer.MAX_VALUE)) > 0)
                    || "int64".equals(s.get("format")) && (n.compareTo(BigDecimal.valueOf(Long.MIN_VALUE)) < 0 || n.compareTo(BigDecimal.valueOf(Long.MAX_VALUE)) > 0))
                    throw ApiException.bad(path + " vượt giới hạn kiểu số nguyên.");
                if (s.containsKey("minimum") && n.compareTo(decimal(s.get("minimum"))) < 0 || s.containsKey("maximum") && n.compareTo(decimal(s.get("maximum"))) > 0) throw ApiException.bad(path + " ngoài giới hạn.");
            }
            case "boolean" -> { if (!(value instanceof Boolean)) throw ApiException.bad(path + " phải là boolean."); }
            case "array" -> {
                if (!(value instanceof List<?>)) throw ApiException.bad(path + " phải là mảng.");
                var list = (List<?>) value;
                if (list.size() < ((Number)s.getOrDefault("minItems", 0)).intValue() || list.size() > ((Number)s.getOrDefault("maxItems", Integer.MAX_VALUE)).intValue()) throw ApiException.bad(path + " sai số phần tử.");
                if (Boolean.TRUE.equals(s.get("uniqueItems")) && new HashSet<>(list).size() != list.size()) throw ApiException.bad(path + " bị trùng phần tử.");
                for (Object item : list) validate(item, object(s.get("items")), path + "[]");
            }
            default -> { }
        }
    }

    public void residenceDetails(Map<String, Object> body) {
        if (!(body.get("details") instanceof Map<?, ?>)) return;
        var schema = object(section("schemas").get("ResidenceChangeCreate"));
        for (var branch : objects(schema.get("oneOf"))) {
            var properties = object(branch.get("properties"));
            if (((List<?>) object(properties.get("changeType")).get("enum")).contains(body.get("changeType"))) {
                var detailFields = object(object(properties.get("details")).get("properties"));
                if (!detailFields.keySet().containsAll(object(body.get("details")).keySet()))
                    throw new ApiException(422, "BUSINESS_RULE_VIOLATION", "Field details không thuộc loại biến động.");
            }
        }
    }
    public Object normalize(Object value) {
        if (value instanceof Map<?, ?>) {
            var out = new LinkedHashMap<String, Object>();
            object(value).forEach((k,v) -> {
                Object normalized = k.toLowerCase(Locale.ROOT).contains("password") ? v : normalize(v);
                if (k.endsWith("Id")) normalized = normalizeUuid(normalized);
                if (k.endsWith("Ids") && normalized instanceof List<?> list) normalized = list.stream().map(this::normalizeUuid).toList();
                out.put(k, normalized);
            });
            return out;
        }
        if (value instanceof List<?> list) return list.stream().map(this::normalize).toList();
        return value instanceof String str ? str.trim() : value;
    }
    private Object normalizeUuid(Object value) {
        if (value instanceof String str && str.matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")) return UUID.fromString(str).toString();
        return value;
    }
    public String canonical(Object value) {
        if (value instanceof Map<?, ?>) {
            var sorted = new TreeMap<String,Object>();
            object(value).forEach((k,v) -> sorted.put(k, json.readValue(canonical(v), Object.class)));
            return json.writeValueAsString(sorted);
        }
        if (value instanceof List<?> list) return "[" + String.join(",", list.stream().map(this::canonical).toList()) + "]";
        return json.writeValueAsString(value);
    }
}
