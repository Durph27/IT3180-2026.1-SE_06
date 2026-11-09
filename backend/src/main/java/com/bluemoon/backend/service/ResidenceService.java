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
public class ResidenceService {
    private final DomainStore db;
    private final ResourceViews views;

    public ResidenceService(DomainStore db, ResourceViews views) {
        this.db = db;
        this.views = views;
    }

    public Object execute(String method, String path, Map<String, String> ids, Map<String, Object> b, Actor actor) {
        String id = ids.get("id");
        if (path.startsWith("/households")) {
            if (path.endsWith("/family-members")) return familyMember(id, b, actor);
            if (path.endsWith("/members")) return member(id, b);
            if (path.endsWith("/end")) {
                var row = db.get("HouseholdMember", ids.get("memberId"));
                rule(id.equals(row.get("householdId")), "Thành viên không thuộc hộ.");
                return end("HouseholdMember", row, date(b, "validTo"));
            }
            if (path.endsWith("/head")) return head(id, text(b, "memberId"));
            if (path.endsWith("/close")) return close(id, b, actor);
            return db.insert("Household", map("code", b.get("code"), "createdAt", Instant.now().toString(), "closedAt", null));
        }
        if (path.startsWith("/occupancies")) {
            if (id == null) return occupancy(b);
            return end("HouseholdApartment", db.get("HouseholdApartment", id), date(b, "validTo"));
        }
        String model = path.startsWith("/buildings") ? "Building" : path.startsWith("/apartments") ? "Apartment" : "Resident";
        var values = new LinkedHashMap<>(b);
        if (model.equals("Apartment")) {
            if (b.containsKey("buildingId")) db.get("Building", b.get("buildingId"));
            if (id == null) values.put("status", "VACANT");
        }
        if (model.equals("Resident") && b.get("birthDate") != null)
            rule(!date(b, "birthDate").isAfter(today()), "Ngày sinh không được trong tương lai.");
        return id == null ? db.insert(model, values) : db.update(model, id, values);
    }

    void openHousehold(Object id) {
        state(db.get("Household", id).get("closedAt") == null);
    }

    void range(LocalDate from, LocalDate to) {
        rule(to == null || to.isAfter(from), "Ngày kết thúc phải sau ngày bắt đầu.");
    }

    public Map<String, Object> occupancy(Map<String, Object> b) {
        openHousehold(b.get("householdId"));
        var apartment = db.get("Apartment", b.get("apartmentId"));
        state(!"INACTIVE".equals(apartment.get("status")));
        LocalDate from = date(b, "validFrom"), to = date(b, "validTo");
        range(from, to);
        for (var row : db.where("HouseholdApartment", "apartmentId", b.get("apartmentId")))
            rule(!overlap(from, to, date(row, "validFrom"), date(row, "validTo")), "Căn hộ đã có hộ cư trú trong khoảng này.");
        return db.insert("HouseholdApartment", b);
    }

    public Map<String, Object> member(String household, Map<String, Object> b) {
        openHousehold(household);
        db.get("Resident", b.get("residentId"));
        LocalDate from = date(b, "validFrom"), to = date(b, "validTo");
        range(from, to);
        for (var row : db.where("HouseholdMember", "residentId", b.get("residentId")))
            rule(!overlap(from, to, date(row, "validFrom"), date(row, "validTo")), "Nhân khẩu đã thuộc một hộ trong khoảng này.");
        if (Boolean.TRUE.equals(b.get("isHead"))) for (var row : db.where("HouseholdMember", "householdId", household))
            if (Boolean.TRUE.equals(row.get("isHead")))
                rule(!overlap(from, to, date(row, "validFrom"), date(row, "validTo")), "Hộ đã có chủ hộ trong khoảng này.");
        var values = new LinkedHashMap<>(b);
        values.put("householdId", household);
        return db.insert("HouseholdMember", values);
    }

    // Family members are census records only: this path never creates an AppUser.
    private Map<String, Object> familyMember(String household, Map<String, Object> b, Actor actor) {
        Object own = actor.user().get("residentId");
        boolean head = own != null && db.where("HouseholdMember", "householdId", household).stream()
                .anyMatch(m -> own.equals(m.get("residentId")) && active(m, today()) && Boolean.TRUE.equals(m.get("isHead")));
        if (!head) throw new ApiException(403, "PERMISSION_DENIED", "Chỉ chủ hộ được thêm nhân khẩu vào hộ của mình.");
        rule(!date(b, "birthDate").isAfter(today()), "Ngày sinh không được trong tương lai.");
        var person = new LinkedHashMap<>(b);
        person.remove("relationship");
        var resident = db.insert("Resident", person);
        return member(household, map("residentId", resident.get("id"), "relationship", b.get("relationship"), "isHead", false, "validFrom", today().toString()));
    }

    public Map<String, Object> end(String model, Map<String, Object> row, LocalDate to) {
        range(date(row, "validFrom"), to);
        rule(date(row, "validTo") == null || !to.isAfter(date(row, "validTo")), "Không kéo dài khoảng cư trú qua lệnh kết thúc.");
        if (model.equals("HouseholdApartment"))
            for (var sub : db.where("ServiceSubscription", "occupancyId", row.get("id")))
                rule(sub.get("validTo") != null && !date(sub, "validTo").isAfter(to), "Cần đóng đăng ký dịch vụ trước khi kết thúc cư trú.");
        return db.update(model, row.get("id"), map("validTo", to.toString()));
    }

    private Map<String, Object> head(String household, String memberId) {
        openHousehold(household);
        var target = db.get("HouseholdMember", memberId);
        rule(household.equals(target.get("householdId")) && active(target, today()), "Chủ hộ phải là thành viên đang hiệu lực.");
        if (Boolean.TRUE.equals(target.get("isHead"))) return target;
        // Split temporal rows so historical head assignments remain available.
        for (var row : db.where("HouseholdMember", "householdId", household))
            if (active(row, today()) && Boolean.TRUE.equals(row.get("isHead"))) splitHead(row, false);
        return splitHead(target, true);
    }

    private Map<String, Object> splitHead(Map<String, Object> row, boolean head) {
        if (date(row, "validFrom").equals(today()))
            return db.update("HouseholdMember", row.get("id"), map("isHead", head));
        var next = new LinkedHashMap<>(row);
        next.remove("id");
        next.put("validFrom", today().toString());
        next.put("isHead", head);
        db.update("HouseholdMember", row.get("id"), map("validTo", today().toString()));
        // Future head intervals must also remain disjoint.
        if (head) for (var other : db.where("HouseholdMember", "householdId", row.get("householdId")))
            if (Boolean.TRUE.equals(other.get("isHead")))
                rule(!overlap(today(), date(next, "validTo"), date(other, "validFrom"), date(other, "validTo")), "Trùng lịch chủ hộ tương lai.");
        return db.insert("HouseholdMember", next);
    }

    private Object close(String id, Map<String, Object> b, Actor actor) {
        openHousehold(id);
        var at = OffsetDateTime.parse(text(b, "closedAt"));
        rule(!at.toInstant().isAfter(Instant.now()), "Không đóng hộ trong tương lai.");
        LocalDate day = at.atZoneSameInstant(ZoneId.of("Asia/Ho_Chi_Minh")).toLocalDate();
        for (String model : List.of("HouseholdMember", "HouseholdApartment"))
            for (var row : db.where(model, "householdId", id))
                rule(date(row, "validTo") != null && !date(row, "validTo").isAfter(day), "Hộ còn thành viên hoặc cư trú hiệu lực.");
        for (var occupancy : db.where("HouseholdApartment", "householdId", id))
            for (var invoice : db.where("Invoice", "occupancyId", occupancy.get("id")))
                if (!Set.of("DRAFT", "CANCELLED").contains(text(invoice, "status")))
                    rule(decimal(views.decorate("Invoice", invoice, actor).get("outstandingAmount")).signum() == 0, "Hộ còn công nợ.");
        rule(db.where("PaymentIntent", "householdId", id).stream().noneMatch(i -> "PENDING".equals(i.get("status"))), "Hộ còn yêu cầu thanh toán chờ xử lý.");
        return db.update("Household", id, b);
    }

}
