package com.bluemoon.backend.service;

import com.bluemoon.backend.api.*;
import com.bluemoon.backend.repository.DomainStore;
import com.bluemoon.backend.security.Actor;

import java.math.*;
import java.time.*;
import java.util.*;

import org.springframework.stereotype.Service;

import static com.bluemoon.backend.api.Values.*;
import static com.bluemoon.backend.api.ApiException.*;

@Service
public class BillingService {
    private final DomainStore db;
    private final ResourceViews views;

    public BillingService(DomainStore db, ResourceViews views) {
        this.db = db;
        this.views = views;
    }

    public Object execute(String method, String path, Map<String, String> ids, Map<String, Object> b, String ifMatch, Actor actor) {
        String id = ids.get("id");
        if (path.startsWith("/fee-types") || path.startsWith("/fee-rates")) {
            if (path.endsWith("/rates")) {
                var values = new LinkedHashMap<>(b);
                values.put("feeTypeId", id);
                var corrected = supersedeOpenRate(values);
                if (corrected != null) return corrected;
                validateRate(values, null);
                return db.insert("FeeRate", values);
            }
            if (path.startsWith("/fee-rates")) {
                var rate = db.get("FeeRate", id);
                state(db.where("InvoiceLine", "rateId", id).isEmpty());
                var merged = new LinkedHashMap<>(rate);
                merged.putAll(b);
                validateRate(merged, id);
                return db.update("FeeRate", id, b);
            }
            return id == null ? db.insert("FeeType", b) : db.update("FeeType", id, b);
        }
        if (path.startsWith("/billing-periods")) {
            if (path.endsWith("/generate-invoices")) return generateInvoices(id, actor);
            if (path.endsWith("/issue")) return issue(id);
            if (path.endsWith("/close")) {
                state("ISSUED".equals(db.get("BillingPeriod", id).get("status")));
                return db.update("BillingPeriod", id, map("status", "CLOSED"));
            }
            var merged = id == null ? new LinkedHashMap<String, Object>() : new LinkedHashMap<>(db.get("BillingPeriod", id));
            boolean snapshotMoved = false;
            if (id != null) {
                state("DRAFT".equals(merged.get("status")));
                // Once invoices exist only the due date and snapshot date may move: neither changes which month is billed.
                if (!db.where("Invoice", "periodId", id).isEmpty())
                    state(Set.of("dueDate", "snapshotDate").containsAll(b.keySet()));
                snapshotMoved = b.containsKey("snapshotDate") && !Objects.equals(text(merged, "snapshotDate"), String.valueOf(b.get("snapshotDate")));
            }
            merged.putAll(b);
            validatePeriod(merged);
            if (snapshotMoved) clearGeneratedLines(id);
            if (id == null) {
                merged.put("status", "DRAFT");
                return db.insert("BillingPeriod", merged);
            }
            return db.update("BillingPeriod", id, b);
        }
        if (path.startsWith("/invoices")) {
            if (id == null) {
                var period = db.get("BillingPeriod", b.get("periodId"));
                state("DRAFT".equals(period.get("status")));
                var occupancy = db.get("HouseholdApartment", b.get("occupancyId"));
                rule(active(occupancy, date(period, "snapshotDate")), "Cư trú không hiệu lực tại ngày chốt.");
                return views.decorate("Invoice", db.insert("Invoice", map("occupancyId", b.get("occupancyId"), "periodId", b.get("periodId"), "invoiceNo", "INV" + UUID.randomUUID(), "issuedAt", Instant.now().toString(), "status", "DRAFT", "version", 0L)), actor);
            }
            var invoice = views.get("Invoice", id, actor);
            if (path.endsWith("/cancel")) {
                version(invoice, ((Number) b.get("version")).longValue());
                state(Set.of("DRAFT", "ISSUED").contains(text(invoice, "status")) && decimal(invoice.get("paidAmount")).signum() == 0);
                return views.decorate("Invoice", db.update("Invoice", id, map("status", "CANCELLED", "version", next(invoice))), actor);
            }
            state("DRAFT".equals(invoice.get("status")) && "DRAFT".equals(db.get("BillingPeriod", invoice.get("periodId")).get("status")));
            if (!new java.math.BigInteger(ifMatch.substring(1, ifMatch.length() - 1)).equals(java.math.BigInteger.valueOf(((Number) invoice.get("version")).longValue())))
                throw new ApiException(409, "VERSION_CONFLICT", "Version bảng kê đã thay đổi.");
            String lineId = ids.get("lineId");
            if (lineId != null)
                rule(id.equals(db.get("InvoiceLine", lineId).get("invoiceId")), "Dòng không thuộc bảng kê.");
            Object result = null;
            if (lineId != null) state(db.where("MaintenanceAllocation", "invoiceLineId", lineId).isEmpty());
            if (method.equals("DELETE")) db.delete("InvoiceLine", lineId);
            else {
                var values = lineId == null ? new LinkedHashMap<String, Object>() : new LinkedHashMap<>(db.get("InvoiceLine", lineId));
                values.putAll(b);
                values.put("invoiceId", id);
                validateLine(invoice, values);
                values.put("amount", amount(decimal(values.get("quantity")), decimal(values.get("unitPrice"))));
                if (lineId == null) result = db.insert("InvoiceLine", values);
                else {
                    values.remove("id");
                    result = db.update("InvoiceLine", lineId, values);
                }
            }
            db.update("Invoice", id, map("version", next(invoice)));
            return result;
        }
        if (path.startsWith("/contribution-campaigns")) {
            if (path.endsWith("/contributions")) {
                db.get("ContributionCampaign", id);
                views.get("Household", b.get("householdId"), actor);
                state(db.get("Household", b.get("householdId")).get("closedAt") == null);
                var values = new LinkedHashMap<>(b);
                values.put("campaignId", id);
                values.put("createdAt", Instant.now().toString());
                return views.decorate("Contribution", db.insert("Contribution", values), actor);
            }
            var merged = id == null ? new LinkedHashMap<String, Object>() : new LinkedHashMap<>(db.get("ContributionCampaign", id));
            merged.putAll(b);
            rule(!date(merged, "endDate").isBefore(date(merged, "startDate")), "Ngày kết thúc chiến dịch không được trước ngày bắt đầu.");
            if (id != null) for (var c : db.where("Contribution", "campaignId", id))
                for (var a : db.where("PaymentAllocation", "contributionId", c.get("id"))) {
                    var p = db.get("Payment", a.get("paymentId"));
                    if (!"POSTED".equals(p.get("status"))) continue;
                    var day = OffsetDateTime.parse(text(p, "paidAt")).atZoneSameInstant(ZoneId.of("Asia/Ho_Chi_Minh")).toLocalDate();
                    rule(!day.isBefore(date(merged, "startDate")) && !day.isAfter(date(merged, "endDate")), "Khoảng chiến dịch loại trừ khoản đã thu.");
                }
            return id == null ? db.insert("ContributionCampaign", merged) : db.update("ContributionCampaign", id, b);
        }
        views.get("Contribution", id, actor);
        return views.decorate("Contribution", db.update("Contribution", id, b), actor);
    }

    public static long next(Map<String, Object> invoice) {
        return ((Number) invoice.get("version")).longValue() + 1;
    }

    public static void version(Map<String, Object> invoice, long expected) {
        if (((Number) invoice.get("version")).longValue() != expected)
            throw new ApiException(409, "VERSION_CONFLICT", "Version bảng kê đã thay đổi.");
    }

    private void validateRate(Map<String, Object> r, String id) {
        var fee = db.get("FeeType", r.get("feeTypeId"));
        boolean vehicle = "PER_VEHICLE".equals(fee.get("basis"));
        rule(vehicle == (r.get("vehicleType") != null), "Loại xe chỉ bắt buộc với phí theo xe.");
        rule(date(r, "effectiveTo") == null || date(r, "effectiveTo").isAfter(date(r, "effectiveFrom")), "Khoảng hiệu lực biểu phí không hợp lệ.");
        for (var other : db.where("FeeRate", "feeTypeId", r.get("feeTypeId")))
            if (!Objects.equals(id, other.get("id")) && Objects.equals(r.get("vehicleType"), other.get("vehicleType")))
                rule(!overlap(date(r, "effectiveFrom"), date(r, "effectiveTo"), date(other, "effectiveFrom"), date(other, "effectiveTo")), "Biểu phí bị chồng khoảng hiệu lực.");
    }

    /**
     * A new price ends the open-ended one for the same fee and vehicle type, so changing a price is one call.
     * Re-entering a price on the day the open one starts corrects it in place while no invoice has used it.
     * Returns the corrected rate, or null when the caller should insert the new one.
     */
    private Map<String, Object> supersedeOpenRate(Map<String, Object> values) {
        if (values.get("effectiveFrom") == null) return null;
        LocalDate from = date(values, "effectiveFrom");
        var open = db.where("FeeRate", "feeTypeId", values.get("feeTypeId")).stream()
                .filter(r -> Objects.equals(values.get("vehicleType"), r.get("vehicleType")) && r.get("effectiveTo") == null)
                .findFirst().orElse(null);
        if (open == null || from.isBefore(date(open, "effectiveFrom"))) return null;
        String openId = text(open, "id");
        var usedBy = db.where("InvoiceLine", "rateId", openId);
        if (from.equals(date(open, "effectiveFrom"))) {
            rule(usedBy.isEmpty(), "Giá áp dụng từ ngày này đã được dùng để lập phiếu thu; hãy chọn ngày áp dụng muộn hơn.");
            var merged = new LinkedHashMap<>(open);
            merged.putAll(values);
            validateRate(merged, openId);
            var changes = new LinkedHashMap<String, Object>();
            changes.put("unitPrice", values.get("unitPrice"));
            if (values.containsKey("effectiveTo")) changes.put("effectiveTo", values.get("effectiveTo"));
            return db.update("FeeRate", openId, changes);
        }
        for (var line : usedBy) {
            var period = db.get("BillingPeriod", db.get("Invoice", line.get("invoiceId")).get("periodId"));
            rule(date(period, "snapshotDate").isBefore(from), "Giá cũ đã được dùng cho đợt thu chốt ngày " + text(period, "snapshotDate") + "; ngày áp dụng giá mới phải sau ngày đó.");
        }
        db.update("FeeRate", openId, map("effectiveTo", from.toString()));
        return null;
    }

    /** Drops the lines priced from fee rates so the next generation recomputes them at the new snapshot date. */
    private void clearGeneratedLines(String periodId) {
        for (var invoice : db.where("Invoice", "periodId", periodId)) {
            if (!"DRAFT".equals(invoice.get("status"))) continue;
            boolean removed = false;
            for (var line : db.where("InvoiceLine", "invoiceId", invoice.get("id"))) {
                if (line.get("rateId") == null || !db.where("MaintenanceAllocation", "invoiceLineId", line.get("id")).isEmpty()) continue;
                db.delete("InvoiceLine", line.get("id"));
                removed = true;
            }
            if (db.where("InvoiceLine", "invoiceId", invoice.get("id")).isEmpty()) db.delete("Invoice", invoice.get("id"));
            else if (removed) db.update("Invoice", invoice.get("id"), map("version", next(invoice)));
        }
    }

    private void validatePeriod(Map<String, Object> p) {
        rule(!date(p, "endDate").isBefore(date(p, "startDate")), "Khoảng kỳ thu không hợp lệ.");
        rule(!date(p, "snapshotDate").isBefore(date(p, "startDate")) && !date(p, "snapshotDate").isAfter(date(p, "endDate")), "Ngày chốt phải thuộc kỳ.");
        rule(!date(p, "dueDate").isBefore(date(p, "endDate")), "Hạn nộp phải từ ngày kết thúc kỳ.");
    }

    private void validateLine(Map<String, Object> invoice, Map<String, Object> line) {
        var fee = db.get("FeeType", line.get("feeTypeId"));
        state(Boolean.TRUE.equals(fee.get("active")));
        var period = db.get("BillingPeriod", invoice.get("periodId"));
        var at = date(period, "snapshotDate");
        String household = text(db.get("HouseholdApartment", invoice.get("occupancyId")), "householdId");
        if (line.get("rateId") != null) {
            var rate = db.get("FeeRate", line.get("rateId"));
            rule(rate.get("feeTypeId").equals(line.get("feeTypeId")), "Biểu phí không khớp loại phí.");
            rule(!date(rate, "effectiveFrom").isAfter(at) && (date(rate, "effectiveTo") == null || date(rate, "effectiveTo").isAfter(at)), "Biểu phí không hiệu lực ngày chốt.");
            rule(decimal(rate.get("unitPrice")).compareTo(decimal(line.get("unitPrice"))) == 0, "Đơn giá không khớp biểu phí.");
        }
        if (line.get("vehicleId") != null) {
            var vehicle = db.get("Vehicle", line.get("vehicleId"));
            rule(household.equals(vehicle.get("householdId")) && !date(vehicle, "registeredFrom").isAfter(at) && (date(vehicle, "registeredTo") == null || date(vehicle, "registeredTo").isAfter(at)), "Xe không thuộc hộ hoặc hết hiệu lực.");
            if (line.get("rateId") != null)
                rule(Objects.equals(vehicle.get("vehicleType"), db.get("FeeRate", line.get("rateId")).get("vehicleType")), "Biểu phí không đúng loại xe.");
        }
        if ("PER_VEHICLE".equals(fee.get("basis"))) rule(line.get("vehicleId") != null, "Phí xe cần thông tin xe.");
        if ("ACTUAL".equals(fee.get("basis")))
            rule(line.get("utilityBillId") != null, "Thu hộ thực tế cần hóa đơn nguồn.");
        if (line.get("utilityBillId") != null) {
            var bill = db.get("UtilityBill", line.get("utilityBillId"));
            var sub = db.get("ServiceSubscription", bill.get("subscriptionId"));
            rule(invoice.get("occupancyId").equals(sub.get("occupancyId")) && invoice.get("periodId").equals(bill.get("periodId")), "Hóa đơn thu hộ không đúng hộ/kỳ.");
            rule(decimal(line.get("quantity")).compareTo(java.math.BigDecimal.ONE) == 0 && decimal(line.get("unitPrice")).compareTo(decimal(bill.get("amount"))) == 0, "Số tiền không khớp hóa đơn nguồn.");
        }
    }

    private Object issue(String id) {
        state("DRAFT".equals(db.get("BillingPeriod", id).get("status")));
        var invoices = db.where("Invoice", "periodId", id);
        rule(!invoices.isEmpty(), "Kỳ thu chưa có bảng kê.");
        for (var invoice : invoices)
            if (!"CANCELLED".equals(invoice.get("status"))) {
                state("DRAFT".equals(invoice.get("status")));
                rule(!db.where("InvoiceLine", "invoiceId", invoice.get("id")).isEmpty(), "Bảng kê chưa có dòng phí.");
                db.update("Invoice", invoice.get("id"), map("status", "ISSUED", "issuedAt", Instant.now().toString(), "version", next(invoice)));
            }
        rule(invoices.stream().anyMatch(i -> !"CANCELLED".equals(i.get("status"))), "Không có bảng kê để phát hành.");
        return db.update("BillingPeriod", id, map("status", "ISSUED"));
    }

    private Object generateInvoices(String periodId, Actor actor) {
        var period = db.get("BillingPeriod", periodId);
        state("DRAFT".equals(period.get("status")));
        LocalDate at = date(period, "snapshotDate");

        var activeOccupancies = db.all("HouseholdApartment").stream()
                .filter(o -> active(o, at))
                .filter(o -> {
                    var h = db.get("Household", o.get("householdId"));
                    return h != null && h.get("closedAt") == null;
                })
                .sorted(Comparator.comparing(o -> text(o, "id")))
                .toList();

        Map<String, String> primaryOccupancyByHousehold = new HashMap<>();
        Map<String, List<Map<String, Object>>> householdOccupancies = new HashMap<>();
        for (var occ : activeOccupancies) {
            String hId = text(occ, "householdId");
            householdOccupancies.computeIfAbsent(hId, k -> new ArrayList<>()).add(occ);
        }
        for (var entry : householdOccupancies.entrySet()) {
            var list = entry.getValue();
            list.sort(Comparator.<Map<String, Object>, LocalDate>comparing(o -> date(o, "validFrom"))
                    .thenComparing(o -> text(o, "id")));
            primaryOccupancyByHousehold.put(entry.getKey(), text(list.getFirst(), "id"));
        }

        var feeTypes = db.where("FeeType", "active", true).stream()
                .filter(f -> Set.of("PER_M2", "PER_PERSON", "PER_APARTMENT", "PER_VEHICLE").contains(f.get("basis")))
                .sorted(Comparator.comparing(f -> text(f, "id")))
                .toList();

        int createdCount = 0;
        int existingCount = 0;
        List<Map<String, Object>> resultInvoices = new ArrayList<>();

        for (var occ : activeOccupancies) {
            String occId = text(occ, "id");
            String hId = text(occ, "householdId");
            boolean isPrimaryOccupancy = occId.equals(primaryOccupancyByHousehold.get(hId));
            var existing = db.where("Invoice", "occupancyId", occId).stream()
                    .filter(i -> periodId.equals(i.get("periodId")))
                    .findFirst();

            if (existing.isPresent() && "CANCELLED".equals(existing.get().get("status"))) {
                existingCount++;
                resultInvoices.add(views.decorate("Invoice", existing.get(), actor));
                continue;
            }

            boolean isNew = existing.isEmpty();
            var existingLines = existing.isPresent()
                    ? db.where("InvoiceLine", "invoiceId", existing.get().get("id"))
                    : List.<Map<String, Object>>of();
            Set<String> existingFeeTypeIds = new HashSet<>();
            Set<String> existingVehicleFeeKeys = new HashSet<>();
            for (var l : existingLines) {
                if (l.get("vehicleId") != null) {
                    existingVehicleFeeKeys.add(text(l, "feeTypeId") + "|" + text(l, "vehicleId"));
                } else if (db.where("MaintenanceAllocation", "invoiceLineId", l.get("id")).isEmpty()) {
                    // Maintenance allocations share a PER_APARTMENT feeTypeId without a rateId;
                    // do not let them suppress the scheduled monthly fee rate.
                    existingFeeTypeIds.add(text(l, "feeTypeId"));
                }
            }

            List<Map<String, Object>> linesToInsert = new ArrayList<>();

            for (var fee : feeTypes) {
                String feeId = text(fee, "id");
                String basis = text(fee, "basis");

                if ("PER_VEHICLE".equals(basis)) {
                    if (!isPrimaryOccupancy) continue;
                    var vehicles = db.where("Vehicle", "householdId", hId).stream()
                            .filter(v -> !date(v, "registeredFrom").isAfter(at) &&
                                         (date(v, "registeredTo") == null || date(v, "registeredTo").isAfter(at)))
                            .sorted(Comparator.comparing((Map<String, Object> v) -> text(v, "plateNo"))
                                    .thenComparing(v -> text(v, "id")))
                            .toList();
                    for (var vehicle : vehicles) {
                        String vehicleId = text(vehicle, "id");
                        String key = feeId + "|" + vehicleId;
                        if (existingVehicleFeeKeys.contains(key)) continue;
                        var rate = activeRate(feeId, text(vehicle, "vehicleType"), at);
                        if (rate == null) continue;
                        linesToInsert.add(buildGeneratedLine(
                                feeId, rate, vehicleId,
                                text(fee, "name") + " (" + text(vehicle, "plateNo") + ")",
                                BigDecimal.ONE
                        ));
                        existingVehicleFeeKeys.add(key);
                    }
                    continue;
                }

                if (existingFeeTypeIds.contains(feeId)) continue;

                var rate = activeRate(feeId, null, at);
                if (rate == null) continue;

                BigDecimal quantity = null;
                if ("PER_APARTMENT".equals(basis)) {
                    quantity = BigDecimal.ONE;
                } else if ("PER_M2".equals(basis)) {
                    var apt = db.get("Apartment", occ.get("apartmentId"));
                    quantity = decimal(apt.get("areaM2"));
                } else if ("PER_PERSON".equals(basis)) {
                    if (!isPrimaryOccupancy) continue;
                    long memberCount = db.where("HouseholdMember", "householdId", hId).stream()
                            .filter(m -> !date(m, "validFrom").isAfter(at) &&
                                         (date(m, "validTo") == null || date(m, "validTo").isAfter(at)))
                            .count();
                    if (memberCount <= 0) continue;
                    quantity = BigDecimal.valueOf(memberCount);
                }

                if (quantity != null) {
                    linesToInsert.add(buildGeneratedLine(feeId, rate, null, text(fee, "name"), quantity));
                    existingFeeTypeIds.add(feeId);
                }
            }

            // Avoid creating empty DRAFT invoices that would block issuing the billing period.
            if (isNew && linesToInsert.isEmpty()) continue;

            Map<String, Object> invoice = existing.orElseGet(() -> db.insert("Invoice", map(
                    "occupancyId", occId,
                    "periodId", periodId,
                    "invoiceNo", "INV" + UUID.randomUUID(),
                    "issuedAt", Instant.now().toString(),
                    "status", "DRAFT",
                    "version", 0L
            )));

            if (isNew) createdCount++;
            else existingCount++;

            for (var lineValues : linesToInsert) {
                var row = new LinkedHashMap<>(lineValues);
                row.put("invoiceId", invoice.get("id"));
                db.insert("InvoiceLine", row);
            }

            if (!linesToInsert.isEmpty() && !isNew) {
                db.update("Invoice", invoice.get("id"), map("version", next(invoice)));
            }

            resultInvoices.add(views.decorate("Invoice", db.get("Invoice", invoice.get("id")), actor));
        }

        return map(
                "invoices", resultInvoices,
                "createdCount", createdCount,
                "existingCount", existingCount
        );
    }

    private Map<String, Object> activeRate(String feeId, String vehicleType, LocalDate at) {
        return db.where("FeeRate", "feeTypeId", feeId).stream()
                .filter(r -> Objects.equals(vehicleType, r.get("vehicleType")))
                .filter(r -> !date(r, "effectiveFrom").isAfter(at) &&
                             (date(r, "effectiveTo") == null || date(r, "effectiveTo").isAfter(at)))
                .findFirst()
                .orElse(null);
    }

    private Map<String, Object> buildGeneratedLine(String feeId, Map<String, Object> rate, String vehicleId, String description, BigDecimal quantity) {
        BigDecimal unitPrice = decimal(rate.get("unitPrice"));
        return map(
                "feeTypeId", feeId,
                "rateId", rate.get("id"),
                "vehicleId", vehicleId,
                "utilityBillId", null,
                "description", description,
                "quantity", quantity.setScale(3, RoundingMode.HALF_UP).toPlainString(),
                "unitPrice", money(unitPrice),
                "amount", amount(quantity, unitPrice)
        );
    }
}
