package com.bluemoon.backend.service;

import com.bluemoon.backend.api.*;
import com.bluemoon.backend.repository.DomainStore;
import com.bluemoon.backend.security.*;

import java.time.Instant;
import java.util.*;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import static com.bluemoon.backend.api.ApiException.rule;
import static com.bluemoon.backend.api.Values.*;

/**
 * Resident self-registration. Staff enter every resident beforehand, so registering only claims that
 * record: the CCCD on file becomes the username and the account is active immediately. The phone number
 * on file must also match, so knowing someone's CCCD alone is not enough to take their account.
 */
@Service
public class RegistrationService {
    private static final int REGISTER_LIMIT_PER_MINUTE = 5;

    private final DomainStore db;
    private final IdentityService identities;

    public RegistrationService(DomainStore db, IdentityService identities) {
        this.db = db;
        this.identities = identities;
    }

    // Business rejections must keep the throttle counter, otherwise CCCDs can be probed for free.
    @Transactional(noRollbackFor = ApiException.class)
    public Map<String, Object> register(Map<String, Object> b, String ip) {
        db.lockWrites();
        identities.throttle(IdentityService.sha256("register|" + ip), REGISTER_LIMIT_PER_MINUTE);
        String identityNo = text(b, "identityNo");
        var residents = db.where("Resident", "identityNo", identityNo);
        if (residents.isEmpty())
            throw new ApiException(404, "RESOURCE_NOT_FOUND", "CCCD chưa được đăng ký tài khoản. Vui lòng liên hệ Ban quản trị.");
        var resident = residents.getFirst();
        String onFile = phoneDigits(resident.get("phone"));
        rule(!onFile.isEmpty() && onFile.equals(phoneDigits(b.get("phone"))),
                "Số điện thoại không khớp với hồ sơ cư dân. Vui lòng liên hệ Ban quản trị.");
        String residentId = text(resident, "id");
        boolean taken = !db.where("AppUser", "residentId", residentId).isEmpty()
                || !db.where("AppUser", "username", identityNo).isEmpty();
        if (taken) throw new ApiException(409, "DUPLICATE_RESOURCE", "CCCD này đã có tài khoản. Vui lòng đăng nhập.");
        String now = Instant.now().toString();
        var user = db.insert("AppUser", map(
                "residentId", residentId,
                "username", identityNo,
                "displayName", resident.get("fullName"),
                "status", "ACTIVE",
                "createdAt", now,
                "passwordHash", identities.hashPassword(text(b, "password"))));
        var role = db.where("Role", "code", "RESIDENT").getFirst();
        db.jdbc().update("INSERT INTO user_role VALUES (?,?)", UUID.fromString(text(user, "id")), UUID.fromString(text(role, "id")));
        return map("id", user.get("id"), "username", identityNo, "status", "ACTIVE", "createdAt", now);
    }

    // Staff-entered phones are free text, so compare digits only and treat +84 as the leading 0.
    static String phoneDigits(Object phone) {
        String digits = phone == null ? "" : phone.toString().replaceAll("\\D", "");
        return digits.startsWith("84") && digits.length() == 11 ? "0" + digits.substring(2) : digits;
    }
}
