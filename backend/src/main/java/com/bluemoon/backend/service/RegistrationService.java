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

    public RegistrationService(DomainStore db, IdentityService identities) {
        this.db = db;
        this.identities = identities;
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
}
