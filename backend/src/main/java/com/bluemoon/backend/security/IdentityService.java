package com.bluemoon.backend.security;

import com.bluemoon.backend.api.*;
import com.bluemoon.backend.repository.DomainStore;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.time.*;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import static com.bluemoon.backend.api.Values.*;

@Service
public class IdentityService {
    private final DomainStore db;
    private final BCryptPasswordEncoder bcrypt = new BCryptPasswordEncoder(12);
    private final String dummyHash;
    public IdentityService(DomainStore db) { this.db=db; dummyHash=hashPassword("invalid-login-placeholder"); }
    public static String sha256(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }
    // Prehash supports 128-character Unicode passwords without BCrypt's 72-byte truncation.
    public String hashPassword(String password) { return bcrypt.encode(sha256(password)); }
    public boolean matches(String password,String hash) { return bcrypt.matches(sha256(password),hash); }
    public Actor actor(String id) {
        var user=db.get("AppUser",id);
        if (!"ACTIVE".equals(user.get("status"))) throw new ApiException(401,"AUTHENTICATION_FAILED","Xác thực thất bại.");
        Set<String> roles=new HashSet<>(db.jdbc().queryForList("SELECT r.code FROM app_role r JOIN user_role ur ON ur.role_id=r.id WHERE ur.user_id=?",String.class,UUID.fromString(id)));
        Set<String> perms=new HashSet<>(db.jdbc().queryForList("SELECT DISTINCT p.code FROM app_permission p JOIN role_permission rp ON rp.permission_id=p.id JOIN user_role ur ON ur.role_id=rp.role_id WHERE ur.user_id=?",String.class,UUID.fromString(id)));
        Set<String> households=new HashSet<>();
        if(user.get("residentId")!=null) for(var m:db.where("HouseholdMember","residentId",user.get("residentId"))) if(active(m,today())) households.add(text(m,"householdId"));
        user.remove("passwordHash"); return new Actor(user,roles,perms,households);
    }
    public Map<String,Object> profile(Actor actor) {
        var roles=db.jdbc().queryForList("SELECT role_id FROM user_role WHERE user_id=?",UUID.class,UUID.fromString(actor.id())).stream().map(id->db.get("Role",id)).toList();
        return map("user",actor.user(),"roles",roles,"permissions",new TreeSet<>(actor.permissions()),"householdIds",new TreeSet<>(actor.households()));
    }
    public Actor authenticate(String authorization) {
        if(authorization==null || !authorization.startsWith("Bearer ")) throw new ApiException(401,"AUTHENTICATION_FAILED","Cần Bearer token.");
        var rows=db.jdbc().query("SELECT user_id,expires_at FROM access_session WHERE token_hash=?",(rs,n)->map("user_id",rs.getObject("user_id"),"expires_at",rs.getObject("expires_at",OffsetDateTime.class)),sha256(authorization.substring(7)));
        if(rows.isEmpty()) throw new ApiException(401,"AUTHENTICATION_FAILED","Token không hợp lệ.");
        var row=rows.getFirst();
        if(!((OffsetDateTime)row.get("expires_at")).toInstant().isAfter(Instant.now())) throw new ApiException(401,"TOKEN_EXPIRED","Token đã hết hạn.");
        return actor(row.get("user_id").toString());
    }
    @Transactional(noRollbackFor=ApiException.class)
    public Map<String,Object> login(Map<String,Object> body,String ip) {
        db.lockWrites();
        String username=text(body,"username").toLowerCase(Locale.ROOT), key=sha256(ip+"|"+username);
        var now=OffsetDateTime.now(ZoneOffset.UTC);
        db.jdbc().update("DELETE FROM login_attempt WHERE window_start<=?",now.minusMinutes(1));
        var attempts=db.jdbc().query("SELECT * FROM login_attempt WHERE attempt_key=?",(rs,n)->map("window_start",rs.getObject("window_start",OffsetDateTime.class),"attempts",rs.getInt("attempts")),key);
        int count=0;
        if(!attempts.isEmpty() && ((OffsetDateTime)attempts.getFirst().get("window_start")).plusMinutes(1).isAfter(now)) count=((Number)attempts.getFirst().get("attempts")).intValue();
        else {
            db.jdbc().update("DELETE FROM login_attempt WHERE attempt_key=?",key);
            db.jdbc().update("INSERT INTO login_attempt VALUES (?,?,0)",key,now);
        }
        if(count>=5) throw new ApiException(429,"RATE_LIMITED","Thử lại sau tối đa 60 giây.");
        db.jdbc().update("UPDATE login_attempt SET attempts=attempts+1 WHERE attempt_key=?",key);
        var users=db.where("AppUser","username",username);
        boolean valid=matches(text(body,"password"),users.isEmpty()?dummyHash:text(users.getFirst(),"passwordHash"));
        if(!valid || users.isEmpty() || !"ACTIVE".equals(users.getFirst().get("status"))) throw new ApiException(401,"AUTHENTICATION_FAILED","Xác thực thất bại.");
        byte[] bytes=new byte[32];new SecureRandom().nextBytes(bytes);
        String token=Base64.getUrlEncoder().withoutPadding().encodeToString(bytes), id=text(users.getFirst(),"id");
        db.jdbc().update("DELETE FROM access_session WHERE expires_at<=?",now);
        db.jdbc().update("INSERT INTO access_session VALUES (?,?,?)",sha256(token),UUID.fromString(id),now.plusSeconds(1800));
        return map("accessToken",token,"tokenType","Bearer","expiresIn",1800,"profile",profile(actor(id)));
    }
    public void revoke(String userId) { db.jdbc().update("DELETE FROM access_session WHERE user_id=?",UUID.fromString(userId)); }
}
