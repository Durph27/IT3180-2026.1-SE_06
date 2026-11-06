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
        for(String role:List.of("ADMIN","MANAGER","ACCOUNTANT","AUTHORITY","RESIDENT")) {
            boolean exists=!db.where("Role","code",role).isEmpty();
            var created=exists?db.where("Role","code",role).getFirst():db.insert("Role",map("id",id("role:"+role),"code",role,"name",roleName(role)));
            for(var permission:db.all("Permission")) if((!exists || added.contains(text(permission,"code")) || role.equals("ADMIN")) && seedGrant(role,text(permission,"code"))) {
                int present=db.jdbc().queryForObject("SELECT COUNT(*) FROM role_permission WHERE role_id=? AND permission_id=?",Integer.class,UUID.fromString(text(created,"id")),UUID.fromString(text(permission,"id")));
                if(present==0)db.jdbc().update("INSERT INTO role_permission VALUES (?,?)",UUID.fromString(text(created,"id")),UUID.fromString(text(permission,"id")));
            }
        }
        if(!password.isEmpty() && db.all("AppUser").isEmpty()) {
            contract.validate(username.trim(),object(object(object(contract.section("schemas").get("LoginRequest")).get("properties")).get("username")),"bootstrap.username");
            contract.validate(map("newPassword",password),object(contract.section("schemas").get("PasswordResetRequest")),"bootstrap");
            var user=db.insert("AppUser",map("residentId",null,"username",username.trim().toLowerCase(Locale.ROOT),"displayName","Administrator","status","ACTIVE","createdAt",Instant.now().toString(),"passwordHash",identities.hashPassword(password)));
            db.jdbc().update("INSERT INTO user_role VALUES (?,?)",UUID.fromString(text(user,"id")),UUID.fromString(id("role:ADMIN")));
        }
    }
    static String roleName(String role) {
        return switch(role) {
            case "ADMIN" -> "Admin";
            case "MANAGER" -> "Ban quản trị";
            case "ACCOUNTANT" -> "Kế toán";
            case "AUTHORITY" -> "Cơ quan chức năng";
            case "RESIDENT" -> "Cư dân";
            default -> throw new IllegalArgumentException("Unknown system role");
        };
    }
    static boolean seedGrant(String role,String p) {
        String group=p.split("\\.")[0];
        return switch(role) {
            case "ADMIN" -> true;
            case "MANAGER" -> !p.equals("maintenance-expense.record") && !Set.of("user","role","rbac","audit","payment","receipt","payment-intent","payment-event").contains(group);
            case "ACCOUNTANT" -> Set.of("maintenance-fund","maintenance-round","maintenance-expense","fee-type","fee-rate","billing-period","invoice","campaign","contribution","provider","subscription","utility-bill","reconciliation","report").contains(group)
                || Set.of("payment.read","payment.record","payment.void","receipt.read","payment-intent.read","payment-event.read","notice.read","notice.remind","building.read","apartment.read","household.read","occupancy.read","resident.read","resident.identity.read","vehicle.read","residence-change.read").contains(p);
            case "AUTHORITY" -> Set.of("building.read","apartment.read","household.read","occupancy.read","resident.read","resident.identity.read","residence-change.read").contains(p);
            case "RESIDENT" -> Set.of("building.read","apartment.read","household.read","occupancy.read","resident.read","vehicle.read","fee-type.read","fee-rate.read","billing-period.read","invoice.read","campaign.read","contribution.read","contribution.write","subscription.read","utility-bill.read","payment.read","receipt.read","payment-intent.read","payment-intent.create","residence-change.read","residence-change.write","notice.read","ticket.read","ticket.write","ticket.update").contains(p);
            default -> false;
        };
    }
}
