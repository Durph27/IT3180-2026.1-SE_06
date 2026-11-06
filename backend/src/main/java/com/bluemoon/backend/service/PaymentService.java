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
public class PaymentService {
    private final DomainStore db;
    private final ResourceViews views;

    public PaymentService(DomainStore db, ResourceViews views) {
        this.db = db;
        this.views = views;
    }

    public Object record(Map<String, Object> b, String key, Actor actor) {
        var household = db.get("Household", b.get("householdId"));
        var paidAt = OffsetDateTime.parse(text(b, "paidAt"));
        rule(!paidAt.toInstant().isAfter(Instant.now()), "Ngày thu không được trong tương lai.");
        rule(household.get("closedAt") == null || !paidAt.toInstant().isAfter(Instant.parse(text(household, "closedAt"))), "Ngày thu sau khi hộ đóng.");
        wholeDong(decimal(b.get("amount")));
        var allocations = objects(b.get("allocations"));
        BigDecimal sum = BigDecimal.ZERO;
        Set<String> targets = new HashSet<>(), invoices = new TreeSet<>();
        List<Map<String, Object>> snapshotAllocations = new ArrayList<>();
        Set<String> apartmentCodes = new TreeSet<>();
        for (var allocation : allocations) {
            String field = allocation.get("invoiceLineId") != null ? "invoiceLineId" : "contributionId", target = text(allocation, field);
            rule(targets.add(field + ":" + target), "Một đích phân bổ xuất hiện nhiều lần.");
            BigDecimal amount = decimal(allocation.get("amount"));
            wholeDong(amount);
            sum = sum.add(amount);
            reserved(field, target);
            String description;
            if (field.equals("invoiceLineId")) {
                var line = db.get("InvoiceLine", target);
                for (var maintenance : db.where("MaintenanceAllocation", "invoiceLineId", target)) {
                    var round = db.get("MaintenanceRound", maintenance.get("roundId"));
                    var fund = db.get("MaintenanceFund", round.get("fundId"));
                    rule(!paidAt.atZoneSameInstant(ZoneId.of("Asia/Ho_Chi_Minh")).toLocalDate().isBefore(date(fund, "openingDate")), "Ngày thu trước ngày mở quỹ.");
                }
                var invoice = db.get("Invoice", line.get("invoiceId"));
                var occupancy = db.get("HouseholdApartment", invoice.get("occupancyId"));
                rule(b.get("householdId").equals(occupancy.get("householdId")), "Dòng bảng kê không thuộc hộ thanh toán.");
                state(Set.of("ISSUED", "PARTIALLY_PAID", "PAID").contains(text(invoice, "status")));
                state(Set.of("ISSUED", "CLOSED").contains(text(db.get("BillingPeriod", invoice.get("periodId")), "status")));
                if (amount.compareTo(decimal(line.get("amount")).subtract(views.paid(field, target))) > 0)
                    throw new ApiException(409, "INSUFFICIENT_OUTSTANDING_BALANCE", "Số tiền phân bổ vượt công nợ còn lại.");
                invoices.add(text(invoice, "id"));
                description = text(line, "description");
                apartmentCodes.add(text(db.get("Apartment", occupancy.get("apartmentId")), "code"));
            } else {
                var contribution = db.get("Contribution", target);
                rule(b.get("householdId").equals(contribution.get("householdId")), "Đóng góp không thuộc hộ thanh toán.");
                var campaign = db.get("ContributionCampaign", contribution.get("campaignId"));
                var day = paidAt.atZoneSameInstant(ZoneId.of("Asia/Ho_Chi_Minh")).toLocalDate();
                rule(!day.isBefore(date(campaign, "startDate")) && !day.isAfter(date(campaign, "endDate")), "Ngày thu ngoài chiến dịch đóng góp.");
                description = text(campaign, "name");
            }
            snapshotAllocations.add(map("invoiceLineId", allocation.get("invoiceLineId"), "contributionId", allocation.get("contributionId"), "description", description, "amount", allocation.get("amount")));
        }
        rule(sum.compareTo(decimal(b.get("amount"))) == 0, "Tổng phân bổ phải bằng số tiền thu.");
        var payment = db.insert("Payment", map("householdId", b.get("householdId"), "intentId", null, "recordedBy", actor.id(), "paymentNo", "PAY" + UUID.randomUUID(), "channel", b.get("channel"), "amount", b.get("amount"), "paidAt", paidAt.toInstant().toString(), "status", "POSTED", "externalRef", b.get("externalRef"), "idempotencyKey", key));
        for (var allocation : allocations)
            db.insert("PaymentAllocation", map("paymentId", payment.get("id"), "invoiceLineId", allocation.get("invoiceLineId"), "contributionId", allocation.get("contributionId"), "amount", allocation.get("amount")));
        for (String invoice : invoices) refreshInvoice(invoice, actor);
        String receiptNo = "REC" + UUID.randomUUID(), issuedAt = Instant.now().toString(), payer = text(household, "code");
        var day = paidAt.atZoneSameInstant(ZoneId.of("Asia/Ho_Chi_Minh")).toLocalDate();
        for (var member : db.where("HouseholdMember", "householdId", household.get("id")))
            if (active(member, day) && Boolean.TRUE.equals(member.get("isHead")))
                payer = text(db.get("Resident", member.get("residentId")), "fullName");
        if (apartmentCodes.isEmpty())
            for (var occupancy : db.where("HouseholdApartment", "householdId", household.get("id")))
                if (active(occupancy, day))
                    apartmentCodes.add(text(db.get("Apartment", occupancy.get("apartmentId")), "code"));
        var snapshot = map("schemaVersion", 1, "paymentNo", payment.get("paymentNo"), "receiptNo", receiptNo, "householdCode", household.get("code"), "apartmentCodes", apartmentCodes.stream().toList(), "payerDisplayName", payer, "channel", payment.get("channel"), "amount", payment.get("amount"), "currency", "VND", "paidAt", payment.get("paidAt"), "issuedAt", issuedAt, "recordedByDisplayName", actor.user().get("displayName"), "allocations", snapshotAllocations);
        db.insert("Receipt", map("paymentId", payment.get("id"), "receiptNo", receiptNo, "issuedAt", issuedAt, "snapshot", snapshot));
        return views.decorate("Payment", payment, actor);
    }

    public Object voidPayment(String id, Actor actor) {
        var payment = db.get("Payment", id);
        state("POSTED".equals(payment.get("status")) && payment.get("intentId") == null && Set.of("CASH", "BANK_TRANSFER").contains(text(payment, "channel")));
        var invoices = new TreeSet<String>();
        for (var allocation : db.where("PaymentAllocation", "paymentId", id))
            if (allocation.get("invoiceLineId") != null) {
                var line = db.get("InvoiceLine", allocation.get("invoiceLineId"));
                invoices.add(text(line, "invoiceId"));
                if (line.get("utilityBillId") != null)
                    for (var item : db.where("ReconciliationItem", "utilityBillId", line.get("utilityBillId")))
                        state(!"CONFIRMED".equals(db.get("Reconciliation", item.get("reconciliationId")).get("status")));
            }
        Map<String, BigDecimal> reversedFunds = new HashMap<>();
        for (var allocation : db.where("PaymentAllocation", "paymentId", id))
            if (allocation.get("invoiceLineId") != null)
                for (var maintenance : db.where("MaintenanceAllocation", "invoiceLineId", allocation.get("invoiceLineId"))) {
                    String fund = text(db.get("MaintenanceRound", maintenance.get("roundId")), "fundId");
                    reversedFunds.merge(fund, decimal(allocation.get("amount")), BigDecimal::add);
                }
        for (var entry : reversedFunds.entrySet()) {
            var fund = views.decorate("MaintenanceFund", db.get("MaintenanceFund", entry.getKey()), actor);
            rule(decimal(fund.get("balance")).compareTo(entry.getValue()) >= 0, "Khoản thu đã dùng chi quỹ; không thể hủy làm âm quỹ.");
        }
        payment = db.update("Payment", id, map("status", "VOIDED"));
        for (String invoice : invoices) refreshInvoice(invoice, actor);
        return views.decorate("Payment", payment, actor);
    }

    private void refreshInvoice(String id, Actor actor) {
        var invoice = views.decorate("Invoice", db.get("Invoice", id), actor);
        BigDecimal paid = decimal(invoice.get("paidAmount")), total = decimal(invoice.get("totalAmount"));
        String status = paid.signum() == 0 ? "ISSUED" : paid.compareTo(total) == 0 ? "PAID" : "PARTIALLY_PAID";
        db.update("Invoice", id, map("status", status, "version", BillingService.next(invoice)));
    }

    private void wholeDong(BigDecimal value) {
        rule(value.stripTrailingZeros().scale() <= 0, "Số tiền thực thu phải là đồng nguyên.");
    }

    private void reserved(String field, String id) {
        for (var item : db.where("PaymentIntentItem", field, id)) {
            var intent = db.get("PaymentIntent", item.get("intentId"));
            if ("PENDING".equals(intent.get("status")) && Instant.parse(text(intent, "expiresAt")).isAfter(Instant.now()))
                throw new ApiException(409, "TARGET_RESERVED", "Đích phân bổ đang được giữ chỗ thanh toán.");
        }
    }
}
