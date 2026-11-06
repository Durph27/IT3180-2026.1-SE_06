package com.bluemoon.backend.service;

import com.bluemoon.backend.api.*;
import com.bluemoon.backend.repository.DomainStore;
import com.bluemoon.backend.security.Actor;

import java.math.BigDecimal;
import java.time.*;
import java.util.*;

import org.springframework.stereotype.Service;

import static com.bluemoon.backend.api.Values.*;

@Service
public class ResourceViews {
    private final DomainStore db;
    private final Contract contract;

    public ResourceViews(DomainStore db, Contract contract) {
        this.db = db;
        this.contract = contract;
    }

    public Map<String, Object> get(String model, Object id, Actor actor) {
        var row = db.get(model, id);
        if (!visible(model, row, actor)) throw ApiException.missing();
        return decorate(model, row, actor);
    }

    public boolean visible(String model, Map<String, Object> row, Actor actor) {
        if (!actor.scoped()) return true;
        String household = switch (model) {
            case "Household" -> text(row, "id");
            case "HouseholdApartment", "HouseholdMember", "ResidenceChange", "Contribution", "Payment" ->
                    text(row, "householdId");
            case "Invoice" -> text(db.get("HouseholdApartment", row.get("occupancyId")), "householdId");
            case "Receipt" -> text(db.get("Payment", row.get("paymentId")), "householdId");
            default -> null;
        };
        if (household != null) return actor.households().contains(household);
        if (model.equals("Resident"))
            return db.where("HouseholdMember", "residentId", row.get("id")).stream().anyMatch(m -> active(m, today()) && actor.households().contains(text(m, "householdId")));
        if (model.equals("Apartment"))
            return db.where("HouseholdApartment", "apartmentId", row.get("id")).stream().anyMatch(o -> active(o, today()) && actor.households().contains(text(o, "householdId")));
        if (model.equals("Building"))
            return db.where("Apartment", "buildingId", row.get("id")).stream().anyMatch(a -> visible("Apartment", a, actor));
        return true;
    }

    public Map<String, Object> decorate(String model, Map<String, Object> source, Actor actor) {
        var row = new LinkedHashMap<>(source);
        row.remove("passwordHash");
        if (model.equals("Apartment") && !"INACTIVE".equals(row.get("status")))
            row.put("status", db.where("HouseholdApartment", "apartmentId", row.get("id")).stream().anyMatch(o -> active(o, today())) ? "OCCUPIED" : "VACANT");
        if (model.equals("Resident") && !actor.can("resident.identity.read") && !Objects.equals(row.get("id"), actor.user().get("residentId")))
            row.put("identityNo", null);
        if (model.equals("Invoice")) {
            var lines = db.where("InvoiceLine", "invoiceId", row.get("id"));
            BigDecimal total = BigDecimal.ZERO, paid = BigDecimal.ZERO;
            for (var line : lines) {
                total = total.add(decimal(line.get("amount")));
                paid = paid.add(paid("invoiceLineId", line.get("id")));
            }
            row.put("lines", lines);
            row.put("totalAmount", money(total));
            row.put("paidAmount", money(paid));
            row.put("outstandingAmount", money(total.subtract(paid)));
        }
        if (model.equals("Contribution")) row.put("paidAmount", money(paid("contributionId", row.get("id"))));
        if (model.equals("Payment")) row.put("allocations", db.where("PaymentAllocation", "paymentId", row.get("id")));
        if (model.equals("MaintenanceRound")) row.put("allocations", db.where("MaintenanceAllocation", "roundId", row.get("id")));
        if (model.equals("MaintenanceFund")) {
            BigDecimal collected = BigDecimal.ZERO, expense = BigDecimal.ZERO;
            for (var round : db.where("MaintenanceRound", "fundId", row.get("id")))
                for (var allocation : db.where("MaintenanceAllocation", "roundId", round.get("id")))
                    collected = collected.add(paid("invoiceLineId", allocation.get("invoiceLineId")));
            for (var entry : db.where("MaintenanceExpense", "fundId", row.get("id"))) expense = expense.add(decimal(entry.get("amount")));
            row.put("collectedAmount", money(collected));
            row.put("expenseAmount", money(expense));
            row.put("balance", money(decimal(row.get("openingBalance")).add(collected).subtract(expense)));
        }
        return row;
    }

    public BigDecimal paid(String field, Object id) {
        BigDecimal sum = BigDecimal.ZERO;
        for (var allocation : db.where("PaymentAllocation", field, id))
            if ("POSTED".equals(db.get("Payment", allocation.get("paymentId")).get("status")))
                sum = sum.add(decimal(allocation.get("amount")));
        return sum;
    }

    public Map<String, Object> list(String model, List<Map<String, Object>> source, Map<String, String> query, Actor actor) {
        var rows = new ArrayList<Map<String, Object>>();
        for (var raw : source) {
            if (!visible(model, raw, actor)) continue;
            var row = decorate(model, raw, actor);
            if (matches(model, row, query)) rows.add(row);
        }
        String[] sort = query.getOrDefault("sort", "id,asc").split(",", -1);
        var properties = object(object(contract.section("schemas").get(model)).get("properties"));
        if (sort.length != 2 || !Set.of("asc", "desc").contains(sort[1]) || !properties.containsKey(sort[0]) || Set.of("object", "array").contains(text(object(properties.get(sort[0])), "type")) || object(properties.get(sort[0])).containsKey("$ref"))
            throw ApiException.bad("Sort không được hỗ trợ.");
        var property = object(properties.get(sort[0]));
        Comparator<Map<String, Object>> comparator = (a, b) -> compare(sortValue(a.get(sort[0]), property), sortValue(b.get(sort[0]), property));
        comparator = comparator.thenComparing(a -> text(a, "id"));
        if (sort[1].equals("desc")) comparator = comparator.reversed();
        rows.sort(comparator);
        int page = Integer.parseInt(query.getOrDefault("page", "0")), size = Integer.parseInt(query.getOrDefault("size", "20"));
        long offset = (long) page * size;
        var content = offset >= rows.size() ? List.of() : rows.subList((int) offset, (int) Math.min(offset + size, rows.size()));
        return map("content", content, "page", page, "size", size, "totalElements", rows.size(), "totalPages", (rows.size() + size - 1) / size);
    }

    private Object sortValue(Object value, Map<String, Object> property) {
        if (value == null) return null;
        if (property.containsKey("pattern") && property.get("pattern").toString().contains("[0-9]{")) return decimal(value);
        if ("date-time".equals(property.get("format"))) return Instant.parse(value.toString());
        return value;
    }

    @SuppressWarnings({"rawtypes", "unchecked"})
    private int compare(Object a, Object b) {
        if (a == null) return b == null ? 0 : -1;
        if (b == null) return 1;
        if (a instanceof Number && b instanceof Number) return decimal(a).compareTo(decimal(b));
        return a instanceof Comparable c ? c.compareTo(b) : a.toString().compareTo(b.toString());
    }

    private boolean matches(String model, Map<String, Object> row, Map<String, String> query) {
        for (var q : query.entrySet()) {
            String field = q.getKey(), value = q.getValue();
            if (Set.of("page", "size", "sort").contains(field)) continue;
            if (field.equals("q")) {
                if (!text(row, "fullName").toLowerCase(Locale.ROOT).contains(value.toLowerCase(Locale.ROOT)))
                    return false;
                continue;
            }
            if (field.equals("at")) {
                String from = model.equals("FeeRate") ? "effectiveFrom" : "validFrom", to = model.equals("FeeRate") ? "effectiveTo" : "validTo";
                var at = LocalDate.parse(value);
                if (date(row, from).isAfter(at) || date(row, to) != null && !date(row, to).isAfter(at)) return false;
                continue;
            }
            if (field.equals("from") || field.equals("to")) {
                var at = Instant.parse(text(row, "paidAt"));
                var bound = OffsetDateTime.parse(value).toInstant();
                if (field.equals("from") && at.isBefore(bound) || field.equals("to") && !at.isBefore(bound))
                    return false;
                continue;
            }
            if (field.equals("householdId") && model.equals("Resident")) {
                if (db.where("HouseholdMember", "residentId", row.get("id")).stream().noneMatch(m -> active(m, today()) && value.equals(m.get("householdId"))))
                    return false;
                continue;
            }
            Object actual = row.get(field);
            if (field.equals("householdId") && model.equals("Invoice"))
                actual = db.get("HouseholdApartment", row.get("occupancyId")).get("householdId");
            if (!value.equals(Objects.toString(actual, null))) return false;
        }
        return true;
    }
}
