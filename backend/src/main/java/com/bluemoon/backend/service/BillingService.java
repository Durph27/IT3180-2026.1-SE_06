package com.bluemoon.backend.service;

import com.bluemoon.backend.api.*;
import com.bluemoon.backend.repository.DomainStore;
import com.bluemoon.backend.security.Actor;

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
            if (path.endsWith("/issue")) return issue(id);
            if (path.endsWith("/close")) {
                state("ISSUED".equals(db.get("BillingPeriod", id).get("status")));
                return db.update("BillingPeriod", id, map("status", "CLOSED"));
            }
            var merged = id == null ? new LinkedHashMap<String, Object>() : new LinkedHashMap<>(db.get("BillingPeriod", id));
            if (id != null) {
                state("DRAFT".equals(merged.get("status")));
                state(db.where("Invoice", "periodId", id).isEmpty());
            }
            merged.putAll(b);
            validatePeriod(merged);
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
}
