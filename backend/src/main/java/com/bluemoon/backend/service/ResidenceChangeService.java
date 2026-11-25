package com.bluemoon.backend.service;
import com.bluemoon.backend.api.*;
import com.bluemoon.backend.repository.DomainStore;
import com.bluemoon.backend.security.Actor;
import jakarta.servlet.http.HttpServletRequest;
import java.time.LocalDate;
import java.util.*;
import org.springframework.stereotype.Service;
import static com.bluemoon.backend.api.Values.*;
import static com.bluemoon.backend.api.ApiException.*;

@Service
public class ResidenceChangeService implements FeatureHandler {
    private static final Set<String> TEMP_TYPES = Set.of("TEMPORARY_RESIDENCE", "TEMPORARY_ABSENCE");
    private final DomainStore db;
    private final ResourceViews views;
    private final ResidenceService residence;
    public ResidenceChangeService(DomainStore db,ResourceViews views,ResidenceService residence) {
        this.db=db; this.views=views; this.residence=residence;
    }
    public boolean supports(String path) { return path.startsWith("/residence-changes"); }
    public Object execute(String method,String path,Map<String,String> ids,Map<String,Object> b,HttpServletRequest request,Actor actor) {
        String id=ids.get("id");
        if (path.startsWith("/residence-changes")) {
            if (id == null) {
                views.get("Household", b.get("householdId"), actor);
                validateChange(b, null);
                var values = new LinkedHashMap<>(b);
                values.put("requestedBy", actor.id());
                values.put("approvedBy", null);
                values.put("status", "PENDING");
                return db.insert("ResidenceChange", values);
            }
            var change = views.get("ResidenceChange", id, actor);
            if (path.endsWith("/end")) {
                return endChange(id, change, b, actor);
            }
            state("PENDING".equals(change.get("status")));
            if (path.endsWith("/cancel")) {
                rule(actor.id().equals(change.get("requestedBy")) || !actor.scoped(), "Chỉ người tạo hoặc quản lý được hủy.");
                return db.update("ResidenceChange", id, map("status", "CANCELLED"));
            }
            String changeType = text(change, "changeType");
            if (!TEMP_TYPES.contains(changeType)) {
                rule(!actor.id().equals(change.get("requestedBy")), "Người tạo không được tự duyệt hoặc từ chối.");
            }
            if (path.endsWith("/reject")) {
                var details = new LinkedHashMap<>(object(change.get("details")));
                details.put("decisionReason", b.get("reason"));
                return db.update("ResidenceChange", id, map("status", "REJECTED", "approvedBy", actor.id(), "details", details));
            }
            validateChange(change, id);
            applyChange(change);
            return db.update("ResidenceChange", id, map("status", "APPROVED", "approvedBy", actor.id()));
        }
        throw ApiException.missing();
    }

    private Object endChange(String id, Map<String, Object> change, Map<String, Object> body, Actor actor) {
        state("APPROVED".equals(change.get("status")));
        String type = text(change, "changeType");
        rule(TEMP_TYPES.contains(type), "Chỉ áp dụng kết thúc sớm cho tạm trú hoặc tạm vắng.");
        LocalDate from = date(change, "effectiveFrom");
        LocalDate currentTo = date(change, "effectiveTo");
        LocalDate endDate = date(body, "effectiveTo");
        residence.range(from, endDate);
        rule(currentTo == null || !endDate.isAfter(currentTo), "Ngày kết thúc thực tế không được sau ngày kết thúc đã duyệt.");

        if ("TEMPORARY_RESIDENCE".equals(type)) {
            Object resId = change.get("residentId");
            String hhId = text(change, "householdId");
            var matchedMember = db.where("HouseholdMember", "residentId", resId).stream()
                    .filter(m -> hhId.equals(m.get("householdId"))
                            && Objects.equals(text(m, "validFrom"), text(change, "effectiveFrom"))
                            && m.get("validTo") != null
                            && Objects.equals(text(m, "validTo"), text(change, "effectiveTo")))
                    .findFirst()
                    .or(() -> db.where("HouseholdMember", "residentId", resId).stream()
                            .filter(m -> hhId.equals(m.get("householdId")) && active(m, endDate.minusDays(1)))
                            .findFirst())
                    .orElse(null);
            if (matchedMember != null && !Objects.equals(text(matchedMember, "validTo"), endDate.toString())) {
                residence.end("HouseholdMember", matchedMember, endDate);
            }
        }

        var details = new LinkedHashMap<>(object(change.get("details")));
        if (!details.containsKey("originalEffectiveTo") && change.get("effectiveTo") != null) {
            details.put("originalEffectiveTo", text(change, "effectiveTo"));
        }
        String reason = text(body, "reason");
        if (reason != null && !reason.isBlank()) {
            details.put("earlyEndReason", reason.trim());
        }
        details.put("endedBy", actor.id());
        return db.update("ResidenceChange", id, map("effectiveTo", endDate.toString(), "details", details));
    }

    private void validateChange(Map<String, Object> c, String currentChangeId) {
        residence.openHousehold(c.get("householdId"));
        db.get("Resident", c.get("residentId"));
        LocalDate from = date(c, "effectiveFrom"), to = date(c, "effectiveTo");
        residence.range(from, to);
        String type = text(c, "changeType");

        if ("TEMPORARY_RESIDENCE".equals(type)) {
            Object residentId = c.get("residentId");
            for (var row : db.where("HouseholdMember", "residentId", residentId)) {
                rule(!overlap(from, to, date(row, "validFrom"), date(row, "validTo")), "Nhân khẩu đã thuộc một hộ trong khoảng này.");
            }
            checkPendingTempResidenceOverlap(residentId, from, to, currentChangeId);
            return;
        }

        if (Set.of("MOVE_OUT", "TRANSFER", "TEMPORARY_ABSENCE").contains(type)) {
            var member = sourceMember(c);
            if ("TEMPORARY_ABSENCE".equals(type)) {
                rule(member.get("validTo") == null && !"TẠM TRÚ".equals(member.get("relationship")),
                        "Nhân khẩu tạm trú cần thực hiện kết thúc tạm trú thay vì khai báo tạm vắng.");
                checkAbsenceOverlap(c.get("householdId"), c.get("residentId"), from, to, currentChangeId);
            }
        }
        if ("TRANSFER".equals(type)) {
            rule(!c.get("householdId").equals(c.get("targetHouseholdId")), "Hộ đích phải khác hộ nguồn.");
            residence.openHousehold(c.get("targetHouseholdId"));
        }
    }

    private void checkPendingTempResidenceOverlap(Object residentId, LocalDate from, LocalDate to, String excludeId) {
        for (var other : db.where("ResidenceChange", "residentId", residentId)) {
            if (Objects.equals(text(other, "id"), excludeId)) continue;
            if (!"PENDING".equals(other.get("status"))) continue;
            if (!Set.of("TEMPORARY_RESIDENCE", "MOVE_IN").contains(text(other, "changeType"))) continue;
            if (overlap(from, to, date(other, "effectiveFrom"), date(other, "effectiveTo"))) {
                throw new ApiException(409, "DUPLICATE_RESOURCE", "Đã tồn tại một yêu cầu tạm trú chờ duyệt bị trùng khoảng thời gian cho nhân khẩu này.");
            }
        }
    }

    private void checkAbsenceOverlap(Object householdId, Object residentId, LocalDate from, LocalDate to, String excludeId) {
        boolean isApprove = excludeId != null;
        for (var other : db.where("ResidenceChange", "residentId", residentId)) {
            if (Objects.equals(text(other, "id"), excludeId)) continue;
            if (!Objects.equals(householdId, other.get("householdId"))) continue;
            if (!"TEMPORARY_ABSENCE".equals(other.get("changeType"))) continue;
            String st = text(other, "status");
            boolean conflictStatus = isApprove ? Set.of("PENDING", "APPROVED").contains(st) : "PENDING".equals(st);
            if (conflictStatus && overlap(from, to, date(other, "effectiveFrom"), date(other, "effectiveTo"))) {
                throw new ApiException(409, "DUPLICATE_RESOURCE", "Nhân khẩu đã có khai báo tạm vắng trùng khoảng thời gian này.");
            }
        }
    }

    private Map<String, Object> sourceMember(Map<String, Object> c) {
        return db.where("HouseholdMember", "residentId", c.get("residentId")).stream().filter(m -> m.get("householdId").equals(c.get("householdId")) && active(m, date(c, "effectiveFrom"))).findFirst().orElseThrow(() -> new ApiException(422, "BUSINESS_RULE_VIOLATION", "Không có thành viên hiệu lực tại hộ nguồn."));
    }

    private void applyChange(Map<String, Object> c) {
        var details = object(c.get("details"));
        String type = text(c, "changeType"), from = text(c, "effectiveFrom"), household = text(c, "householdId");
        if ("MOVE_OUT".equals(type) || "TRANSFER".equals(type))
            residence.end("HouseholdMember", sourceMember(c), date(c, "effectiveFrom"));
        if ("MOVE_OUT".equals(type)) for (Object id : (List<?>) details.get("endOccupancyIds")) {
            var o = db.get("HouseholdApartment", id);
            rule(household.equals(o.get("householdId")), "Cư trú không thuộc hộ nguồn.");
            residence.end("HouseholdApartment", o, date(c, "effectiveFrom"));
        }
        if (Set.of("MOVE_IN", "TRANSFER", "TEMPORARY_RESIDENCE").contains(type)) {
            String target = "TRANSFER".equals(type) ? text(c, "targetHouseholdId") : household;
            residence.member(target, map("residentId", c.get("residentId"), "relationship", details.get("relationship"), "isHead", details.get("isHead"), "validFrom", from, "validTo", "TEMPORARY_RESIDENCE".equals(type) ? c.get("effectiveTo") : null));
            if ("MOVE_IN".equals(type) && details.get("apartmentId") != null) {
                boolean existing = db.where("HouseholdApartment", "apartmentId", details.get("apartmentId")).stream().anyMatch(o -> household.equals(o.get("householdId")) && active(o, date(c, "effectiveFrom")));
                if (!existing)
                    residence.occupancy(map("householdId", household, "apartmentId", details.get("apartmentId"), "validFrom", from, "validTo", null));
            }
        }
    }
}
