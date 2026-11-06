package com.bluemoon.backend.service;
import com.bluemoon.backend.api.*;
import com.bluemoon.backend.repository.DomainStore;
import com.bluemoon.backend.security.Actor;
import jakarta.servlet.http.HttpServletRequest;
import java.util.*;
import org.springframework.stereotype.Service;
import static com.bluemoon.backend.api.Values.*;
import static com.bluemoon.backend.api.ApiException.*;

@Service
public class ResidenceChangeService implements FeatureHandler {
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
                validateChange(b);
                var values = new LinkedHashMap<>(b);
                values.put("requestedBy", actor.id());
                values.put("approvedBy", null);
                values.put("status", "PENDING");
                return db.insert("ResidenceChange", values);
            }
            var change = views.get("ResidenceChange", id, actor);
            state("PENDING".equals(change.get("status")));
            if (path.endsWith("/cancel")) {
                rule(actor.id().equals(change.get("requestedBy")) || !actor.scoped(), "Chỉ người tạo hoặc quản lý được hủy.");
                return db.update("ResidenceChange", id, map("status", "CANCELLED"));
            }
            rule(!actor.id().equals(change.get("requestedBy")), "Người tạo không được tự duyệt hoặc từ chối.");
            if (path.endsWith("/reject")) {
                var details = new LinkedHashMap<>(object(change.get("details")));
                details.put("decisionReason", b.get("reason"));
                return db.update("ResidenceChange", id, map("status", "REJECTED", "approvedBy", actor.id(), "details", details));
            }
            validateChange(change);
            applyChange(change, actor);
            return db.update("ResidenceChange", id, map("status", "APPROVED", "approvedBy", actor.id()));
        }
        throw ApiException.missing();
    }
    private void validateChange(Map<String, Object> c) {
        residence.openHousehold(c.get("householdId"));
        db.get("Resident", c.get("residentId"));
        residence.range(date(c, "effectiveFrom"), date(c, "effectiveTo"));
        String type = text(c, "changeType");
        if (Set.of("MOVE_OUT", "TRANSFER", "TEMPORARY_ABSENCE").contains(type)) sourceMember(c);
        if (type.equals("TRANSFER")) {
            rule(!c.get("householdId").equals(c.get("targetHouseholdId")), "Hộ đích phải khác hộ nguồn.");
            residence.openHousehold(c.get("targetHouseholdId"));
        }
    }

    private Map<String, Object> sourceMember(Map<String, Object> c) {
        return db.where("HouseholdMember", "residentId", c.get("residentId")).stream().filter(m -> m.get("householdId").equals(c.get("householdId")) && active(m, date(c, "effectiveFrom"))).findFirst().orElseThrow(() -> new ApiException(422, "BUSINESS_RULE_VIOLATION", "Không có thành viên hiệu lực tại hộ nguồn."));
    }

    private void applyChange(Map<String, Object> c, Actor actor) {
        var details = object(c.get("details"));
        String type = text(c, "changeType"), from = text(c, "effectiveFrom"), household = text(c, "householdId");
        if (type.equals("MOVE_OUT") || type.equals("TRANSFER"))
            residence.end("HouseholdMember", sourceMember(c), date(c, "effectiveFrom"));
        if (type.equals("MOVE_OUT")) for (Object id : (List<?>) details.get("endOccupancyIds")) {
            var o = db.get("HouseholdApartment", id);
            rule(household.equals(o.get("householdId")), "Cư trú không thuộc hộ nguồn.");
            residence.end("HouseholdApartment", o, date(c, "effectiveFrom"));
        }
        if (Set.of("MOVE_IN", "TRANSFER", "TEMPORARY_RESIDENCE").contains(type)) {
            String target = type.equals("TRANSFER") ? text(c, "targetHouseholdId") : household;
            residence.member(target, map("residentId", c.get("residentId"), "relationship", details.get("relationship"), "isHead", details.get("isHead"), "validFrom", from, "validTo", type.equals("TEMPORARY_RESIDENCE") ? c.get("effectiveTo") : null));
            if (type.equals("MOVE_IN") && details.get("apartmentId") != null) {
                boolean existing = db.where("HouseholdApartment", "apartmentId", details.get("apartmentId")).stream().anyMatch(o -> household.equals(o.get("householdId")) && active(o, date(c, "effectiveFrom")));
                if (!existing)
                    residence.occupancy(map("householdId", household, "apartmentId", details.get("apartmentId"), "validFrom", from, "validTo", null));
            }
        }
    }
}
