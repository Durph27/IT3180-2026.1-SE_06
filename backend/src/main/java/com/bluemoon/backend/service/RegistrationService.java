package com.bluemoon.backend.service;

import com.bluemoon.backend.api.*;
import com.bluemoon.backend.repository.DomainStore;
import com.bluemoon.backend.security.*;

import java.time.Instant;
import java.util.*;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import static com.bluemoon.backend.api.ApiException.*;
import static com.bluemoon.backend.api.Values.*;

/** Resident self-registration: nothing becomes an account or resident until a reviewer approves it. */
@Service
public class RegistrationService {
    private static final int REGISTER_LIMIT_PER_MINUTE = 5;
    private static final String MODEL = "AccountRegistration";

    private final DomainStore db;
    private final IdentityService identities;
    private final ResidenceService residence;

    public RegistrationService(DomainStore db, IdentityService identities, ResidenceService residence) {
        this.db = db;
        this.identities = identities;
        this.residence = residence;
    }

    // Business rejections must keep the throttle counter, otherwise usernames can be probed for free.
    @Transactional(noRollbackFor = ApiException.class)
    public Map<String, Object> register(Map<String, Object> b, String ip) {
        db.lockWrites();
        identities.throttle(IdentityService.sha256("register|" + ip), REGISTER_LIMIT_PER_MINUTE);
        rule(!date(b, "birthDate").isAfter(today()), "Ngày sinh không được trong tương lai.");
        String username = text(b, "username").toLowerCase(Locale.ROOT);
        boolean taken = !db.where("AppUser", "username", username).isEmpty()
                || db.where(MODEL, "username", username).stream().anyMatch(r -> "PENDING".equals(r.get("status")));
        if (taken) throw new ApiException(409, "DUPLICATE_RESOURCE", "Tên đăng nhập đã được sử dụng.");
        var values = new LinkedHashMap<>(b);
        values.remove("password");
        values.put("username", username);
        values.put("passwordHash", identities.hashPassword(text(b, "password")));
        values.put("status", "PENDING");
        values.put("createdAt", Instant.now().toString());
        var row = db.insert(MODEL, values);
        return map("id", row.get("id"), "username", username, "status", "PENDING", "createdAt", row.get("createdAt"));
    }

    public Object execute(String path, String id, Map<String, Object> b, Actor actor) {
        var registration = db.get(MODEL, id);
        state("PENDING".equals(registration.get("status")));
        return path.endsWith("/approve") ? approve(registration, text(b, "householdId"), actor) : reject(id, text(b, "reason"), actor);
    }

    private Map<String, Object> approve(Map<String, Object> registration, String household, Actor actor) {
        String residentId = linkResident(registration, household);
        String now = Instant.now().toString();
        var user = db.insert("AppUser", map(
                "residentId", residentId,
                "username", registration.get("username"),
                "displayName", registration.get("fullName"),
                "status", "ACTIVE",
                "createdAt", now,
                "passwordHash", registration.get("passwordHash")));
        var role = db.where("Role", "code", "RESIDENT").getFirst();
        db.jdbc().update("INSERT INTO user_role VALUES (?,?)", UUID.fromString(text(user, "id")), UUID.fromString(text(role, "id")));
        return close(registration.get("id"), "APPROVED", actor, now, map("userId", user.get("id")));
    }

    private Map<String, Object> reject(String id, String reason, Actor actor) {
        return close(id, "REJECTED", actor, Instant.now().toString(), map("rejectReason", reason));
    }

    // Staff may have entered this person already; reuse the record so the CCCD stays unique.
    private String linkResident(Map<String, Object> registration, String household) {
        var existing = db.where("Resident", "identityNo", registration.get("identityNo"));
        String residentId;
        if (existing.isEmpty()) {
            residentId = text(db.insert("Resident", map(
                    "fullName", registration.get("fullName"),
                    "identityNo", registration.get("identityNo"),
                    "birthDate", registration.get("birthDate"),
                    "gender", registration.get("gender"),
                    "phone", registration.get("phone"))), "id");
        } else {
            residentId = text(existing.getFirst(), "id");
            rule(db.where("AppUser", "residentId", residentId).isEmpty(), "Nhân khẩu này đã có tài khoản.");
        }
        boolean alreadyHead = db.where("HouseholdMember", "residentId", residentId).stream()
                .anyMatch(m -> household.equals(m.get("householdId")) && active(m, today()) && Boolean.TRUE.equals(m.get("isHead")));
        if (!alreadyHead) residence.member(household, map(
                "residentId", residentId, "relationship", "HEAD", "isHead", true, "validFrom", today().toString()));
        return residentId;
    }

    private Map<String, Object> close(Object id, String status, Actor actor, String at, Map<String, Object> extra) {
        var values = new LinkedHashMap<>(extra);
        values.put("status", status);
        values.put("reviewedBy", actor.id());
        values.put("reviewedAt", at);
        values.put("passwordHash", null);
        var result = db.update(MODEL, id, values);
        result.remove("passwordHash");
        return result;
    }
}
