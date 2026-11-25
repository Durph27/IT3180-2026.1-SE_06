package com.bluemoon.backend;

import com.bluemoon.backend.api.Contract;
import com.bluemoon.backend.repository.DomainStore;
import com.bluemoon.backend.security.Bootstrap;
import java.net.URI;
import java.net.http.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import static org.assertj.core.api.Assertions.*;
import static com.bluemoon.backend.api.Values.*;

/** Runs against the grants the application seeds itself, without any test-only widening. */
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={
    "spring.datasource.url=jdbc:h2:mem:role_separation;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
    "spring.datasource.username=sa","spring.datasource.password=",
    "app.bootstrap.password=Role-separation-password!",
    "logging.level.root=WARN"
})
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class RoleSeparationTests {
    @LocalServerPort int port;
    @Autowired Contract contract;
    @Autowired DomainStore db;
    @Autowired Bootstrap bootstrap;
    private final HttpClient client=HttpClient.newHttpClient();
    private final Map<String,String> roleIds=new HashMap<>();
    private String admin,manager,accountant,authority,household,resident;
    record Reply(int status,Map<String,Object> body){}

    @BeforeAll void setUp() throws Exception {
        admin=login("admin","Role-separation-password!");
        for(var role:objects(call("GET","/roles?size=100",null,admin).body().get("content")))roleIds.put(text(role,"code"),text(role,"id"));
        manager=token("MANAGER");accountant=token("ACCOUNTANT");authority=token("AUTHORITY");
        var building=created(call("POST","/buildings",map("code",unique(),"name","BlueMoon","address","Hà Nội"),manager));
        var apartment=created(call("POST","/apartments",map("buildingId",building,"code",unique(),"floorNo",3,"areaM2","70.00"),manager));
        household=created(call("POST","/households",map("code",unique()),manager));
        created(call("POST","/occupancies",map("householdId",household,"apartmentId",apartment,"validFrom",today().minusMonths(1).toString()),manager));
        resident=created(call("POST","/residents",map("fullName","Trần Thị "+unique(),"birthDate","1985-05-05","gender","FEMALE","identityNo",unique()),manager));
        created(call("POST","/households/"+household+"/members",map("residentId",resident,"relationship","HEAD","isHead",true,"validFrom",today().minusMonths(1).toString()),manager));
    }

    @Test void systemAdministratorManagesAccountsButSeesNoResidenceOrFees() throws Exception {
        assertThat(call("GET","/users",null,admin).status()).isEqualTo(200);
        assertThat(call("GET","/roles",null,admin).status()).isEqualTo(200);
        for(String path:List.of("/households","/residents","/residents/"+resident,"/residence-changes","/apartments",
                "/fee-types","/billing-periods","/invoices","/payments","/maintenance-funds"))
            assertThat(call("GET",path,null,admin).status()).as(path).isEqualTo(403);
        assertThat(call("POST","/fee-types",map("code",unique(),"name","Phí","basis","PER_M2","mandatory",true,"active",true),admin).status()).isEqualTo(403);
    }

    @Test void accountantSeesHouseholdFeesButNoDemographics() throws Exception {
        assertThat(call("GET","/households/"+household,null,accountant).status()).isEqualTo(200);
        assertThat(call("GET","/occupancies",null,accountant).status()).isEqualTo(200);
        assertThat(call("GET","/invoices",null,accountant).status()).isEqualTo(200);
        assertThat(call("GET","/payments",null,accountant).status()).isEqualTo(200);
        assertThat(call("POST","/fee-types",map("code",unique(),"name","Phí dịch vụ","basis","PER_M2","mandatory",true,"active",true),accountant).status()).isEqualTo(201);
        for(String path:List.of("/residents","/residents/"+resident,"/households/"+household+"/members","/residence-changes"))
            assertThat(call("GET",path,null,accountant).status()).as(path).isEqualTo(403);
        assertThat(call("GET","/users",null,accountant).status()).isEqualTo(403);
    }

    @Test void managerRunsResidenceAndAccountsAndOnlyViewsFeeCollection() throws Exception {
        assertThat(call("GET","/households/"+household+"/members",null,manager).status()).isEqualTo(200);
        assertThat(call("GET","/residents/"+resident,null,manager).body().get("identityNo")).isNotNull();
        assertThat(call("GET","/users",null,manager).status()).isEqualTo(200);
        for(String path:List.of("/fee-types","/billing-periods","/invoices","/payments","/maintenance-funds"))
            assertThat(call("GET",path,null,manager).status()).as(path).isEqualTo(200);
        var period=map("code",unique(),"startDate",today().minusMonths(1).toString(),"endDate",today().toString(),
            "snapshotDate",today().toString(),"dueDate",today().plusDays(7).toString());
        assertThat(call("POST","/billing-periods",period,manager).status()).isEqualTo(403);
        assertThat(call("POST","/billing-periods",period,accountant).status()).isEqualTo(201);
        assertThat(call("POST","/fee-types",map("code",unique(),"name","Phí","basis","PER_M2","mandatory",true,"active",true),manager).status()).isEqualTo(403);
        assertThat(call("GET","/roles",null,manager).status()).isEqualTo(403);
    }

    @Test void authorityOnlyReadsResidence() throws Exception {
        assertThat(call("GET","/residents/"+resident,null,authority).status()).isEqualTo(200);
        assertThat(call("GET","/households/"+household+"/members",null,authority).status()).isEqualTo(200);
        for(String path:List.of("/invoices","/fee-types","/users"))
            assertThat(call("GET",path,null,authority).status()).as(path).isEqualTo(403);
        assertThat(call("POST","/households",map("code",unique()),authority).status()).isEqualTo(403);
    }

    @Test void rolePermissionsCanOnlyNarrowWithinTheRoleCeiling() throws Exception {
        String accountantRole=roleIds.get("ACCOUNTANT");
        var original=objects(call("GET","/roles/"+accountantRole+"/permissions",null,admin).body().get("items")).stream().map(p->text(p,"id")).toList();
        try {
            assertThat(call("PUT","/roles/"+accountantRole+"/permissions",map("permissionIds",List.of(permission("resident.read"))),admin).status()).isEqualTo(409);
            assertThat(call("PUT","/roles/"+accountantRole+"/permissions",map("permissionIds",List.of(permission("fee-type.read"))),admin).status()).isEqualTo(200);
            assertThat(call("PUT","/roles/"+roleIds.get("MANAGER")+"/permissions",map("permissionIds",List.of(permission("payment.record"))),admin).status()).isEqualTo(409);
            assertThat(call("PUT","/roles/"+roleIds.get("ADMIN")+"/permissions",map("permissionIds",List.of(permission("user.read"))),admin).status()).isEqualTo(409);
        } finally {
            assertThat(call("PUT","/roles/"+accountantRole+"/permissions",map("permissionIds",original),admin).status()).isEqualTo(200);
        }
    }

    @Test void startupWithdrawsGrantsLeftByTheOlderBroaderPolicy() throws Exception {
        db.jdbc().update("INSERT INTO role_permission VALUES (?,?)",UUID.fromString(roleIds.get("ACCOUNTANT")),UUID.fromString(permission("resident.read")));
        db.jdbc().update("INSERT INTO role_permission VALUES (?,?)",UUID.fromString(roleIds.get("ADMIN")),UUID.fromString(permission("invoice.read")));
        bootstrap.run(null);
        assertThat(granted("ACCOUNTANT")).doesNotContain("resident.read").contains("invoice.read","household.read");
        assertThat(granted("ADMIN")).doesNotContain("invoice.read").contains("user.read","rbac.manage");
    }

    private List<String> granted(String role) {
        return db.jdbc().queryForList("SELECT p.code FROM role_permission rp JOIN app_permission p ON p.id=rp.permission_id JOIN app_role r ON r.id=rp.role_id WHERE r.code=?",String.class,role);
    }
    private String permission(String code) { return text(db.where("Permission","code",code).getFirst(),"id"); }
    private String unique() { return UUID.randomUUID().toString().substring(0,8); }
    private String created(Reply reply) {
        assertThat(reply.status()).as(reply.body().toString()).isEqualTo(201);
        return text(reply.body(),"id");
    }
    private String token(String role) throws Exception {
        String username="u"+unique();
        String id=created(call("POST","/users",map("username",username,"displayName","Test "+role,"password","User-test-password!"),admin));
        assertThat(call("PUT","/users/"+id+"/roles",map("roleIds",List.of(roleIds.get(role))),admin).status()).isEqualTo(200);
        return login(username,"User-test-password!");
    }
    private String login(String username,String password) throws Exception {
        var reply=call("POST","/auth/login",map("username",username,"password",password),null);
        assertThat(reply.status()).as(reply.body().toString()).isEqualTo(200);
        return text(reply.body(),"accessToken");
    }
    private Reply call(String method,String path,Object body,String token) throws Exception {
        var request=HttpRequest.newBuilder(URI.create("http://localhost:"+port+"/api"+path)).header("Content-Type","application/json");
        if(token!=null)request.header("Authorization","Bearer "+token);
        request.method(method,body==null?HttpRequest.BodyPublishers.noBody():HttpRequest.BodyPublishers.ofString(contract.json.writeValueAsString(body)));
        var response=client.send(request.build(),HttpResponse.BodyHandlers.ofByteArray());
        Object parsed=response.body().length==0?Map.of():contract.json.readValue(response.body(),Object.class);
        return new Reply(response.statusCode(),parsed instanceof List<?>?map("items",parsed):object(parsed));
    }
}
