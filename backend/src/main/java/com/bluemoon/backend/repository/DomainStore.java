package com.bluemoon.backend.repository;

import com.bluemoon.backend.api.*;

import java.sql.*;
import java.time.*;
import java.util.*;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import static com.bluemoon.backend.api.Values.*;

/**
 * JDBC persistence with contract-allowlisted identifiers and bound values only.
 */
@Repository
public class DomainStore {
    private final JdbcTemplate jdbc;

    public JdbcTemplate jdbc() {
        return jdbc;
    }

    private final Contract contract;

    public DomainStore(JdbcTemplate jdbc, Contract contract) {
        this.jdbc = jdbc;
        this.contract = contract;
    }

    public String table(String model) {
        return contract.entity(model).get("table").toString();
    }

    public Map<String, Object> fields(String model) {
        return object(contract.entity(model).get("fields"));
    }

    public String column(String model, String field) {
        if (!fields(model).containsKey(field)) throw ApiException.bad("Trường không được hỗ trợ: " + field);
        return object(fields(model).get(field)).get("column").toString();
    }

    public void lockWrites() {
        // Cross-process DB lock, not a JVM monitor. All mutating services share this
        // ordering until finer-grained locks are introduced for higher throughput.
        jdbc.queryForObject("SELECT id FROM business_lock WHERE id=1 FOR UPDATE", Integer.class);
    }

    public List<Map<String, Object>> all(String model) {
        return query(model, "", new Object[0]);
    }

    public List<Map<String, Object>> where(String model, String field, Object value) {
        return query(model, " WHERE " + column(model, field) + " = ?", convert(model, field, value));
    }

    public List<Map<String, Object>> query(String model, String suffix, Object... args) {
        return jdbc.query("SELECT * FROM " + table(model) + suffix, (rs, n) -> read(model, rs), args);
    }

    private Map<String, Object> read(String model, ResultSet rs) throws SQLException {
        var result = new LinkedHashMap<String, Object>();
        for (var field : fields(model).entrySet()) {
            var meta = object(field.getValue());
            Object raw = rs.getObject(meta.get("column").toString());
            if (raw != null) {
                String type = meta.get("type").toString();
                if (Boolean.TRUE.equals(meta.get("json"))) raw = contract.json.readValue(raw.toString(), Object.class);
                else if (type.equals("DATE"))
                    raw = rs.getObject(meta.get("column").toString(), LocalDate.class).toString();
                else if (type.startsWith("TIMESTAMP"))
                    raw = rs.getObject(meta.get("column").toString(), OffsetDateTime.class).toInstant().toString();
                else if (type.equals("UUID") || type.startsWith("NUMERIC")) raw = raw.toString();
            }
            result.put(field.getKey(), raw);
        }
        return result;
    }

    private Object convert(String model, String field, Object value) {
        if (value == null) return null;
        var meta = object(fields(model).get(field));
        if (Boolean.TRUE.equals(meta.get("json"))) return contract.json.writeValueAsString(value);
        String type = meta.get("type").toString();
        if (type.equals("UUID")) return UUID.fromString(value.toString());
        if (type.equals("DATE")) return LocalDate.parse(value.toString());
        if (type.startsWith("TIMESTAMP")) return OffsetDateTime.parse(value.toString());
        if (type.startsWith("NUMERIC")) return decimal(value);
        return value;
    }

    public Map<String, Object> get(String model, Object id) {
        var rows = where(model, "id", id);
        if (rows.isEmpty()) throw ApiException.missing();
        return rows.getFirst();
    }

    public Map<String, Object> insert(String model, Map<String, Object> values) {
        var row = new LinkedHashMap<>(values);
        row.putIfAbsent("id", UUID.randomUUID().toString());
        var keys = new ArrayList<>(row.keySet());
        var columns = keys.stream().map(k -> column(model, k)).toList();
        var args = keys.stream().map(k -> convert(model, k, row.get(k))).toArray();
        jdbc.update("INSERT INTO " + table(model) + " (" + String.join(",", columns) + ") VALUES (" + String.join(",", Collections.nCopies(keys.size(), "?")) + ")", args);
        return get(model, row.get("id"));
    }

    public Map<String, Object> update(String model, Object id, Map<String, Object> values) {
        get(model, id);
        if (values.isEmpty()) return get(model, id);
        var args = new ArrayList<Object>();
        var sets = new ArrayList<String>();
        values.forEach((k, v) -> {
            sets.add(column(model, k) + "=?");
            args.add(convert(model, k, v));
        });
        args.add(UUID.fromString(id.toString()));
        jdbc.update("UPDATE " + table(model) + " SET " + String.join(",", sets) + " WHERE id=?", args.toArray());
        return get(model, id);
    }

    public void delete(String model, Object id) {
        jdbc.update("DELETE FROM " + table(model) + " WHERE id=?", UUID.fromString(id.toString()));
    }
}
