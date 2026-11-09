package com.bluemoon.backend.service;

import com.bluemoon.backend.api.*;
import com.bluemoon.backend.repository.DomainStore;
import com.bluemoon.backend.security.*;

import java.time.Instant;
import java.util.*;

import org.springframework.stereotype.Service;

import static com.bluemoon.backend.api.Values.*;
import static com.bluemoon.backend.api.ApiException.*;

@Service
public class AccountService {
    private final DomainStore db;
    private final IdentityService identities;

    public AccountService(DomainStore db, IdentityService identities) {
        this.db = db;
        this.identities = identities;
    }

    public Object execute(String method, String path, String id, Map<String, Object> b, Actor actor) {
        if (path.equals("/auth/me")) {
            if (method.equals("PATCH")) db.update("AppUser", actor.id(), b);
            return identities.profile(identities.actor(actor.id()));
        }
        if (path.equals("/auth/change-password")) {
            var user = db.get("AppUser", actor.id());
            if (!identities.matches(text(b, "currentPassword"), text(user, "passwordHash")))
                throw new ApiException(401, "AUTHENTICATION_FAILED", "Xác thực thất bại.");
            password(actor.id(), text(b, "newPassword"));
            return null;
        }
        if (path.startsWith("/users")) {
            if (id != null && !method.equals("GET") && !actor.roles().contains("ADMIN")) {
                boolean adminTarget = db.jdbc().queryForObject(
                        "SELECT COUNT(*) FROM user_role ur JOIN app_role r ON r.id=ur.role_id WHERE ur.user_id=? AND r.code='ADMIN'",
                        Integer.class, UUID.fromString(id)) > 0;
                if (adminTarget)
                    throw new ApiException(403, "PERMISSION_DENIED", "Chỉ Admin được thay đổi tài khoản Admin.");
            }
            if (path.endsWith("/roles")) return roles(method, id, b);
            if (path.endsWith("/reset-password")) {
                db.get("AppUser", id);
                password(id, text(b, "newPassword"));
                return null;
            }
            if (method.equals("POST")) {
                var values = new LinkedHashMap<>(b);
                values.remove("password");
                if (b.get("residentId") != null) db.get("Resident", b.get("residentId"));
                values.put("username", text(b, "username").toLowerCase(Locale.ROOT));
                values.put("passwordHash", identities.hashPassword(text(b, "password")));
                values.put("status", "ACTIVE");
                values.put("createdAt", Instant.now().toString());
                var result = db.insert("AppUser", values);
                result.remove("passwordHash");
                return result;
            }
            db.get("AppUser", id);
            var values = new LinkedHashMap<>(b);
            if (b.containsKey("username")) values.put("username", text(b, "username").toLowerCase(Locale.ROOT));
            if (b.get("residentId") != null) db.get("Resident", b.get("residentId"));
            var result = db.update("AppUser", id, values);
            ensureAdmin();
            result.remove("passwordHash");
            return result;
        }
        if (path.startsWith("/roles")) {
            if (path.endsWith("/permissions")) {
                var role = db.get("Role", id);
                if (method.equals("PUT")) {
                    if ("ADMIN".equals(role.get("code")))
                        throw new ApiException(409, "INVALID_STATE", "Giữ đầy đủ catalog quyền của ADMIN.");
                    if ("AUTHORITY".equals(role.get("code"))) {
                        var allowed = Set.of("building.read","apartment.read","household.read","occupancy.read","resident.read","resident.identity.read","residence-change.read");
                        for (Object permissionId : (List<?>) b.get("permissionIds"))
                            if (!allowed.contains(text(db.get("Permission",permissionId),"code")))
                                throw new ApiException(409,"INVALID_STATE","Cơ quan chức năng chỉ được tra cứu cư trú.");
                    }
                    replace("role_permission", "role_id", "permission_id", id, (List<?>) b.get("permissionIds"), "Permission");
                    ensureAdmin();
                }
                return db.jdbc().queryForList("SELECT permission_id FROM role_permission WHERE role_id=?", UUID.class, UUID.fromString(id)).stream().map(x -> db.get("Permission", x)).toList();
            }
            if (method.equals("POST")) throw new ApiException(409, "INVALID_STATE", "Hệ thống chỉ có 5 vai trò được cấp sẵn.");
            var old = db.get("Role", id);
            if (b.containsKey("code") && Set.of("ADMIN", "MANAGER", "ACCOUNTANT", "AUTHORITY", "RESIDENT").contains(text(old, "code")) && !old.get("code").equals(b.get("code")))
                throw new ApiException(409, "INVALID_STATE", "Không đổi mã vai trò hệ thống.");
            return db.update("Role", id, b);
        }
        throw ApiException.missing();
    }

    private void password(String id, String password) {
        db.update("AppUser", id, map("passwordHash", identities.hashPassword(password)));
        identities.revoke(id);
    }

    private Object roles(String method, String id, Map<String, Object> b) {
        db.get("AppUser", id);
        if (method.equals("PUT")) {
            var roleIds = (List<?>) b.get("roleIds");
            long staffRoles = roleIds.stream()
                    .map(roleId -> text(db.get("Role", roleId), "code"))
                    .filter(code -> !"RESIDENT".equals(code)).count();
            if (staffRoles > 1)
                throw ApiException.bad("Chỉ được chọn tối đa một vai trò trong nhóm ADMIN, MANAGER, ACCOUNTANT, AUTHORITY; RESIDENT là tùy chọn.");
            replace("user_role", "user_id", "role_id", id, (List<?>) b.get("roleIds"), "Role");
            ensureAdmin();
        }
        return db.jdbc().queryForList("SELECT role_id FROM user_role WHERE user_id=?", UUID.class, UUID.fromString(id)).stream().map(x -> db.get("Role", x)).toList();
    }

    private void replace(String table, String parent, String child, String id, List<?> ids, String model) {
        for (Object item : ids) db.get(model, item);
        db.jdbc().update("DELETE FROM " + table + " WHERE " + parent + "=?", UUID.fromString(id));
        for (Object item : ids)
            db.jdbc().update("INSERT INTO " + table + " VALUES (?,?)", UUID.fromString(id), UUID.fromString(item.toString()));
    }

    private void ensureAdmin() {
        int count = db.jdbc().queryForObject("SELECT COUNT(*) FROM app_user u JOIN user_role ur ON ur.user_id=u.id JOIN app_role r ON r.id=ur.role_id WHERE u.status='ACTIVE' AND r.code='ADMIN'", Integer.class);
        state(count > 0);
    }
}
