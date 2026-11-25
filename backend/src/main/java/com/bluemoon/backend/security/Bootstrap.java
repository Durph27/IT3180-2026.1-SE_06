package com.bluemoon.backend.security;

import com.bluemoon.backend.api.*;
import com.bluemoon.backend.repository.DomainStore;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import static com.bluemoon.backend.api.Values.*;

@Component
public class Bootstrap implements ApplicationRunner {
    private final DomainStore db;
    private final Contract contract;
    private final IdentityService identities;
    private final String username,password;
    public Bootstrap(DomainStore db,Contract contract,IdentityService identities,
        @Value("${app.bootstrap.username:admin}") String username,@Value("${app.bootstrap.password:}") String password) {
        this.db=db;this.contract=contract;this.identities=identities;this.username=username;this.password=password;
    }
    private String id(String text) {return UUID.nameUUIDFromBytes(text.getBytes(StandardCharsets.UTF_8)).toString();}
    @Override @Transactional
    public void run(ApplicationArguments args) {
        db.lockWrites();
        Set<String> added=new HashSet<>();
        for(String code:contract.permissions()) if(db.where("Permission","code",code).isEmpty()){db.insert("Permission",map("id",id("permission:"+code),"code",code,"description",code));added.add(code);}
        for(String role:RolePolicy.SYSTEM_ROLES) {
            boolean exists=!db.where("Role","code",role).isEmpty();
            var created=exists?db.where("Role","code",role).getFirst():db.insert("Role",map("id",id("role:"+role),"code",role,"name",RolePolicy.label(role)));
            UUID roleId=UUID.fromString(text(created,"id"));
            // Grants seeded by an older, broader policy are withdrawn on every start.
            for(String code:db.jdbc().queryForList("SELECT p.code FROM role_permission rp JOIN app_permission p ON p.id=rp.permission_id WHERE rp.role_id=?",String.class,roleId))
                if(!RolePolicy.allows(role,code))db.jdbc().update("DELETE FROM role_permission WHERE role_id=? AND permission_id=(SELECT id FROM app_permission WHERE code=?)",roleId,code);
            for(var permission:db.all("Permission")) if((!exists || added.contains(text(permission,"code")) || role.equals("ADMIN")) && RolePolicy.allows(role,text(permission,"code"))) {
                int present=db.jdbc().queryForObject("SELECT COUNT(*) FROM role_permission WHERE role_id=? AND permission_id=?",Integer.class,roleId,UUID.fromString(text(permission,"id")));
                if(present==0)db.jdbc().update("INSERT INTO role_permission VALUES (?,?)",roleId,UUID.fromString(text(permission,"id")));
            }
        }
        if(!password.isEmpty() && db.all("AppUser").isEmpty()) {
            contract.validate(username.trim(),object(object(object(contract.section("schemas").get("LoginRequest")).get("properties")).get("username")),"bootstrap.username");
            contract.validate(map("newPassword",password),object(contract.section("schemas").get("PasswordResetRequest")),"bootstrap");
            var user=db.insert("AppUser",map("residentId",null,"username",username.trim().toLowerCase(Locale.ROOT),"displayName","Administrator","status","ACTIVE","createdAt",Instant.now().toString(),"passwordHash",identities.hashPassword(password)));
            db.jdbc().update("INSERT INTO user_role VALUES (?,?)",UUID.fromString(text(user,"id")),UUID.fromString(id("role:ADMIN")));
        }
    }
}
