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
public class MaintenanceService {
    private final DomainStore db;
    private final ResourceViews views;

    public MaintenanceService(DomainStore db, ResourceViews views) {
        this.db = db;
        this.views = views;
    }

    public Object execute(String path, String id, Map<String, Object> b, Actor actor) {
        if (path.equals("/maintenance-funds")) {
            whole(b.get("openingBalance"));
            rule(!date(b, "openingDate").isAfter(today()), "Ngày số dư đầu kỳ không được trong tương lai.");
            var values = new LinkedHashMap<>(b);
            values.put("createdAt", Instant.now().toString());
            values.put("createdBy", actor.id());
            return views.decorate("MaintenanceFund", db.insert("MaintenanceFund", values), actor);
        }
        if (path.endsWith("/expenses")) {
            var fund = views.get("MaintenanceFund", id, actor);
            whole(b.get("amount"));
            var spent = OffsetDateTime.parse(text(b, "spentAt"));
            rule(!spent.toInstant().isAfter(Instant.now()), "Ngày chi không được trong tương lai.");
            rule(!spent.atZoneSameInstant(ZoneId.of("Asia/Ho_Chi_Minh")).toLocalDate().isBefore(date(fund, "openingDate")), "Ngày chi trước ngày mở quỹ.");
            rule(decimal(b.get("amount")).compareTo(decimal(fund.get("balance"))) <= 0, "Số tiền chi vượt số dư quỹ.");
            var values = new LinkedHashMap<>(b);
            values.put("fundId", id);
            values.put("recordedBy", actor.id());
            return db.insert("MaintenanceExpense", values);
        }
        var fund = db.get("MaintenanceFund", b.get("fundId"));
        var period = db.get("BillingPeriod", b.get("periodId"));
        state("DRAFT".equals(period.get("status")));
        var fee = db.get("FeeType", b.get("feeTypeId"));
        rule(Boolean.TRUE.equals(fee.get("mandatory")) && Boolean.TRUE.equals(fee.get("active")) && "PER_APARTMENT".equals(fee.get("basis")), "Đợt phân bổ cần loại phí bắt buộc PER_APARTMENT đang hoạt động.");
        rule(!date(period, "snapshotDate").isBefore(date(fund, "openingDate")), "Ngày chốt trước ngày mở quỹ.");
        whole(b.get("totalCost"));
        var occupancies = ((List<?>) b.get("occupancyIds")).stream().map(x -> db.get("HouseholdApartment", x)).sorted(Comparator.comparing(o -> text(o, "id"))).toList();
        List<BigInteger> weights = new ArrayList<>();
        for (var occupancy : occupancies) {
            rule(active(occupancy, date(period, "snapshotDate")), "Cư trú không hiệu lực tại ngày chốt.");
            BigDecimal weight = "EQUAL".equals(b.get("allocationBasis")) ? BigDecimal.ONE : decimal(db.get("Apartment", occupancy.get("apartmentId")).get("areaM2"));
            weights.add(weight.movePointRight(3).toBigIntegerExact());
        }
        var amounts = allocate(decimal(b.get("totalCost")).toBigIntegerExact(), weights);
        var roundValues = new LinkedHashMap<>(b);
        roundValues.remove("occupancyIds");
        roundValues.put("snapshotDate", period.get("snapshotDate"));
        roundValues.put("createdAt", Instant.now().toString());
        roundValues.put("createdBy", actor.id());
        var round = db.insert("MaintenanceRound", roundValues);
        for (int index = 0; index < occupancies.size(); index++) {
            var occupancy = occupancies.get(index);
            var existing = db.where("Invoice", "occupancyId", occupancy.get("id")).stream().filter(i -> b.get("periodId").equals(i.get("periodId"))).findFirst();
            var invoice = existing.orElseGet(() -> db.insert("Invoice", map("occupancyId", occupancy.get("id"), "periodId", b.get("periodId"), "invoiceNo", "INV" + UUID.randomUUID(), "issuedAt", Instant.now().toString(), "status", "DRAFT", "version", 0L)));
            state("DRAFT".equals(invoice.get("status")));
            String amount = money(new BigDecimal(amounts.get(index)));
            var line = db.insert("InvoiceLine", map("invoiceId", invoice.get("id"), "feeTypeId", b.get("feeTypeId"), "rateId", null, "vehicleId", null, "utilityBillId", null, "description", b.get("description"), "quantity", "1.000", "unitPrice", amount, "amount", amount));
            db.update("Invoice", invoice.get("id"), map("version", BillingService.next(invoice)));
            db.insert("MaintenanceAllocation", map("roundId", round.get("id"), "occupancyId", occupancy.get("id"), "invoiceLineId", line.get("id"), "weight", new BigDecimal(weights.get(index), 3).toPlainString(), "amount", amount));
        }
        return views.decorate("MaintenanceRound", round, actor);
    }

    /**
     * Largest remainders in whole dong; input is sorted by occupancy UUID for stable ties.
     */
    static List<BigInteger> allocate(BigInteger total, List<BigInteger> weights) {
        BigInteger denominator = weights.stream().reduce(BigInteger.ZERO, BigInteger::add);
        List<BigInteger> amounts = new ArrayList<>(), remainders = new ArrayList<>();
        BigInteger assigned = BigInteger.ZERO;
        for (BigInteger weight : weights) {
            BigInteger[] division = total.multiply(weight).divideAndRemainder(denominator);
            amounts.add(division[0]);
            remainders.add(division[1]);
            assigned = assigned.add(division[0]);
        }
        List<Integer> indexes = new ArrayList<>();
        for (int i = 0; i < weights.size(); i++) indexes.add(i);
        indexes.sort(Comparator.<Integer, BigInteger>comparing(remainders::get).reversed().thenComparingInt(i -> i));
        int remaining = total.subtract(assigned).intValueExact();
        for (int i = 0; i < remaining; i++) {
            int index = indexes.get(i);
            amounts.set(index, amounts.get(index).add(BigInteger.ONE));
        }
        return amounts;
    }

    private void whole(Object value) {
        rule(decimal(value).stripTrailingZeros().scale() <= 0, "Quỹ bảo trì sử dụng số đồng nguyên.");
    }
}
