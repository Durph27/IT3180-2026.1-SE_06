package com.bluemoon.backend;

import com.bluemoon.backend.api.*;
import com.bluemoon.backend.repository.DomainStore;
import java.net.URI;
import java.net.http.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import static org.assertj.core.api.Assertions.*;
import static com.bluemoon.backend.api.Values.*;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={
    "spring.datasource.url=jdbc:h2:mem:sprint1;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
    "spring.datasource.username=sa","spring.datasource.password=",
    "app.bootstrap.password=Sprint1-test-password!",
    "logging.level.root=WARN"
})
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class SprintOneTests {
    @LocalServerPort int port;
    @Autowired Contract contract;
    @Autowired DomainStore db;
    private final HttpClient client=HttpClient.newHttpClient();
    private String admin;
    private final Map<String,String> roleIds=new HashMap<>();
    record Reply(int status,Map<String,Object> body,HttpResponse<byte[]> response){}
    record Home(String household,String apartment,String occupancy){}
    record Bill(Home home,String period,String invoice,String line){}
    String unique(){return UUID.randomUUID().toString().substring(0,8);}
    String id(Map<String,Object> value){return text(value,"id");}
    String start(){return today().minusMonths(1).toString();}
    @BeforeAll void loginAdmin() throws Exception {
        admin=login("admin","Sprint1-test-password!");
        var reply=call("GET","/roles?size=100",null,admin,null);assertThat(reply.status()).as(reply.body().toString()).isEqualTo(200);
        for(var role:objects(reply.body().get("content")))roleIds.put(text(role,"code"),id(role));
    }
    String login(String username,String password)throws Exception {
        var reply=call("POST","/auth/login",map("username",username,"password",password),null,null);
        assertThat(reply.status()).as(reply.body().toString()).isEqualTo(200);
        return text(reply.body(),"accessToken");
    }
    Reply call(String method,String path,Object body,String token,String command)throws Exception {
        var request=HttpRequest.newBuilder(URI.create("http://localhost:"+port+"/api"+path)).header("Content-Type","application/json");
        if(token!=null)request.header("Authorization","Bearer "+token);
        if(command!=null)request.header("Idempotency-Key",command);
        request.method(method,body==null?HttpRequest.BodyPublishers.noBody():HttpRequest.BodyPublishers.ofString(contract.json.writeValueAsString(body)));
        return receive(client.send(request.build(),HttpResponse.BodyHandlers.ofByteArray()));
    }
    Reply receive(HttpResponse<byte[]> response) {
        Object parsed=response.body().length==0?Map.of():contract.json.readValue(response.body(),Object.class);
        Map<String,Object> body=parsed instanceof List<?>?map("items",parsed):object(parsed);
        return new Reply(response.statusCode(),body,response);
    }
    Map<String,Object> create(String path,Map<String,Object> body)throws Exception {
        var reply=call("POST",path,body,admin,null);assertThat(reply.status()).as(path+": "+reply.body()).isEqualTo(201);
        assertThat(reply.response().headers().firstValue("Location")).isPresent();return reply.body();
    }
    Home home()throws Exception {
        var building=create("/buildings",map("code",unique(),"name","BlueMoon","address","Hà Nội"));
        var apartment=create("/apartments",map("buildingId",id(building),"code",unique(),"floorNo",2,"areaM2","80.00"));
        var household=create("/households",map("code",unique()));
        var occupancy=create("/occupancies",map("householdId",id(household),"apartmentId",id(apartment),"validFrom",start()));
        return new Home(id(household),id(apartment),id(occupancy));
    }
    Map<String,Object> resident()throws Exception {return create("/residents",map("fullName","Nguyễn Văn "+unique(),"birthDate","1990-01-01","gender","MALE","identityNo",unique()));}
    Map<String,Object> member(Home home,Map<String,Object> resident,boolean head)throws Exception {
        return create("/households/"+home.household()+"/members",map("residentId",id(resident),"relationship",head?"HEAD":"CHILD","isHead",head,"validFrom",start()));
    }
    Map<String,Object> user(String role,String residentId)throws Exception {
        var user=create("/users",map("username","u"+unique(),"displayName","Test "+role,"password","User-test-password!","residentId",residentId));
        assertThat(call("PUT","/users/"+id(user)+"/roles",map("roleIds",List.of(roleIds.get(role))),admin,null).status()).isEqualTo(200);return user;
    }
    String token(Map<String,Object> user)throws Exception {return login(text(user,"username"),"User-test-password!");}
    @Test void managerCanManageAccountsButCannotModifyAdminOrAssignRoles() throws Exception {
        String manager = token(user("MANAGER", null));
        assertThat(call("GET", "/users", null, manager, null).status()).isEqualTo(200);
        var created = call("POST", "/users", map("username", "u"+unique(), "displayName", "Managed user",
                "password", "User-test-password!"), manager, null);
        assertThat(created.status()).isEqualTo(201);
        String target = id(created.body());
        assertThat(call("PATCH", "/users/"+target, map("displayName", "Updated user"), manager, null).status()).isEqualTo(200);
        assertThat(call("PUT", "/users/"+target+"/status", map("status", "LOCKED"), manager, null).status()).isEqualTo(200);
        assertThat(call("POST", "/users/"+target+"/reset-password", map("newPassword", "Updated-password!"), manager, null).status()).isEqualTo(204);
        assertThat(call("PUT", "/users/"+target+"/roles", map("roleIds", List.of(roleIds.get("ADMIN"))), manager, null).status()).isEqualTo(403);
        String adminId = id(db.where("AppUser", "username", "admin").getFirst());
        assertThat(call("PATCH", "/users/"+adminId, map("displayName", "Changed"), manager, null).status()).isEqualTo(403);
        assertThat(call("PUT", "/users/"+adminId+"/status", map("status", "LOCKED"), manager, null).status()).isEqualTo(403);
        assertThat(call("POST", "/users/"+adminId+"/reset-password", map("newPassword", "Updated-password!"), manager, null).status()).isEqualTo(403);
    }
    Map<String,Object> fee(boolean mandatory)throws Exception {return create("/fee-types",map("code",unique(),"name","Phí bảo trì","basis","PER_M2","mandatory",mandatory,"active",true));}
    Bill draft()throws Exception {
        Home home=home();var period=create("/billing-periods",map("code",unique(),"startDate",start(),"endDate",today().toString(),"snapshotDate",today().toString(),"dueDate",today().plusDays(7).toString()));
        var invoice=create("/invoices",map("occupancyId",home.occupancy(),"periodId",id(period)));var fee=fee(true);
        var line=line(id(invoice),0,map("feeTypeId",id(fee),"description","Bảo trì thang máy","quantity","80.000","unitPrice","10.00"),201).body();
        return new Bill(home,id(period),id(invoice),id(line));
    }
    Reply line(String invoice,long version,Map<String,Object>body,int expected)throws Exception {
        var request=HttpRequest.newBuilder(URI.create("http://localhost:"+port+"/api/invoices/"+invoice+"/lines"))
            .header("Content-Type","application/json").header("Authorization","Bearer "+admin).header("If-Match","\""+version+"\"")
            .POST(HttpRequest.BodyPublishers.ofString(contract.json.writeValueAsString(body))).build();
        var reply=receive(client.send(request,HttpResponse.BodyHandlers.ofByteArray()));assertThat(reply.status()).as(reply.body().toString()).isEqualTo(expected);return reply;
    }
    void issue(Bill bill)throws Exception {assertThat(call("POST","/billing-periods/"+bill.period()+"/issue",null,admin,unique()).status()).isEqualTo(200);}
    Map<String,Object> payment(Bill bill,String amount) {return map("householdId",bill.home().household(),"channel","CASH","amount",amount,"paidAt",Instant.now().minusSeconds(1).toString(),"allocations",List.of(map("invoiceLineId",bill.line(),"amount",amount)));}

    @Test void exactlyFiveRolesAndAuthorityCannotReadFinanceOrWriteResidence() throws Exception {
        assertThat(roleIds.keySet()).containsExactlyInAnyOrder("ADMIN","MANAGER","AUTHORITY","ACCOUNTANT","RESIDENT");
        assertThat(call("POST","/roles",map("code","STAFF","name","Staff"),admin,null).status()).isEqualTo(400);
        assertThat(call("POST","/roles",map("code","ADMIN","name","Duplicate"),admin,null).status()).isEqualTo(409);
        var person=resident(); String authority=token(user("AUTHORITY",null));
        assertThat(call("GET","/residents/"+id(person),null,authority,null).body().get("identityNo")).isEqualTo(person.get("identityNo"));
        assertThat(call("GET","/households",null,authority,null).status()).isEqualTo(200);
        assertThat(call("GET","/payments",null,authority,null).status()).isEqualTo(403);
        assertThat(call("GET","/roles",null,authority,null).status()).isEqualTo(403);
        assertThat(call("POST","/residents",map("fullName","Forbidden","birthDate","1990-01-01","gender","MALE","identityNo",null),authority,null).status()).isEqualTo(403);
        var paymentPermission=db.where("Permission","code","payment.record").getFirst();
        assertThat(call("PUT","/roles/"+roleIds.get("AUTHORITY")+"/permissions",map("permissionIds",List.of(id(paymentPermission))),admin,null).status()).isEqualTo(409);
    }
    @Test void everyApiStorageFieldExistsInMigratedDatabase() {
        for (String model : contract.section("entities").keySet()) {
            var entity=contract.entity(model);
            var fields=object(entity.get("fields"));
            String columns=String.join(",",fields.values().stream().map(v->text(object(v),"column")).toList());
            assertThatCode(()->db.jdbc().queryForList("SELECT "+columns+" FROM "+text(entity,"table")+" WHERE 1=0"))
                .as("API storage mapping for %s",model).doesNotThrowAnyException();
        }
    }

    @Test void schemasRejectUnknownFieldsInvalidTypesAndDuplicateApartments()throws Exception {
        var home=home();var apartment=call("GET","/apartments/"+home.apartment(),null,admin,null).body();
        assertThat(apartment.get("status")).isEqualTo("OCCUPIED");
        var body=map("buildingId",apartment.get("buildingId"),"code",apartment.get("code"),"floorNo",2,"areaM2","80.00");
        assertThat(call("POST","/apartments",body,admin,null).status()).isEqualTo(409);
        body.put("code",unique());body.put("areaM2","0.00");assertThat(call("POST","/apartments",body,admin,null).status()).isEqualTo(400);
        body.put("areaM2",80);assertThat(call("POST","/apartments",body,admin,null).status()).isEqualTo(400);
        body.put("areaM2","80.00");body.put("floorNo",Long.MAX_VALUE);assertThat(call("POST","/apartments",body,admin,null).status()).isEqualTo(400);
        body.put("floorNo",2);body.put("status","VACANT");assertThat(call("POST","/apartments",body,admin,null).status()).isEqualTo(400);
        assertThat(call("GET","/apartments?unknown=x",null,admin,null).status()).isEqualTo(400);
        assertThat(call("GET","/apartments?size=0",null,admin,null).status()).isEqualTo(400);
        assertThat(call("GET","/apartments?sort=passwordHash,asc",null,admin,null).status()).isEqualTo(400);
        assertThat(call("PATCH","/apartments/"+home.apartment(),Map.of(),admin,null).status()).isEqualTo(400);
        assertThat(call("POST","/occupancies",map("householdId",home.household(),"apartmentId",home.apartment(),"validFrom",today().toString()),admin,null).status()).isEqualTo(422);
        contract.validate(apartment,object(contract.section("schemas").get("Apartment")),"response");
    }
    @Test void permissionsApplyImmediatelyAndLastAdminCannotBeRemoved()throws Exception {
        var user=user("ACCOUNTANT",null);String token=token(user);
        assertThat(call("POST","/buildings",map("code",unique(),"name","x","address","x"),token,null).status()).isEqualTo(403);
        assertThat(call("PUT","/users/"+id(user)+"/roles",map("roleIds",List.of(roleIds.get("MANAGER"))),admin,null).status()).isEqualTo(200);
        assertThat(call("POST","/buildings",map("code",unique(),"name","x","address","x"),token,null).status()).isEqualTo(201);
        assertThat(call("PUT","/users/"+id(user)+"/status",map("status","LOCKED"),admin,null).status()).isEqualTo(200);
        assertThat(call("GET","/auth/me",null,token,null).status()).isEqualTo(401);
        String adminId=text(object(call("GET","/auth/me",null,admin,null).body().get("user")),"id");
        assertThat(call("PUT","/users/"+adminId+"/roles",map("roleIds",List.of()),admin,null).status()).isEqualTo(409);
        assertThat(call("GET","/roles",null,admin,null).status()).isEqualTo(200);
    }
    @Test void usernamesRejectDiacriticsButLoginStaysCompatible()throws Exception {
        String name="nguyễn"+unique();
        var body=map("username",name,"displayName","Test","password","User-test-password!");
        assertThat(call("POST","/users",body,admin,null).status()).isEqualTo(400);
        assertThat(db.where("AppUser","username",name)).isEmpty();
        assertThat(call("POST","/auth/login",map("username",name,"password","wrong"),null,null).status()).isEqualTo(401);
        body.put("username","nguyen.van-a_"+unique());
        assertThat(call("POST","/users",body,admin,null).status()).isEqualTo(201);
    }
    @Test void roleAssignmentsAllowResidentAndOnlyOneStaffRole() throws Exception {
        var target = user("MANAGER", null);
        String path = "/users/" + id(target) + "/roles";
        var staff = List.of("ADMIN", "MANAGER", "ACCOUNTANT", "AUTHORITY");
        assertThat(call("PUT", path, map("roleIds", List.of(roleIds.get("RESIDENT"))), admin, null).status()).isEqualTo(200);
        for (String role : staff) {
            assertThat(call("PUT", path, map("roleIds", List.of(roleIds.get("RESIDENT"), roleIds.get(role))), admin, null).status()).isEqualTo(200);
            assertThat(call("PUT", path, map("roleIds", List.of(roleIds.get(role))), admin, null).status()).isEqualTo(200);
        }
        for (int i = 0; i < staff.size(); i++) {
            for (int j = i + 1; j < staff.size(); j++) {
                var pair = List.of(roleIds.get(staff.get(i)), roleIds.get(staff.get(j)));
                assertThat(call("PUT", path, map("roleIds", pair), admin, null).status()).isEqualTo(400);
                assertThat(call("PUT", path, map("roleIds", List.of(roleIds.get("RESIDENT"), pair.get(0), pair.get(1))), admin, null).status()).isEqualTo(400);
            }
        }
        var retained = objects(call("GET", path, null, admin, null).body().get("items"));
        assertThat(retained).extracting(role -> text(role, "code")).containsExactly("AUTHORITY");
    }
    @Test void passwordChangeRevokesOldTokenAndDoesNotExposeSecrets()throws Exception {
        var user=user("MANAGER",null);String old=token(user);
        var reply=call("POST","/auth/change-password",map("currentPassword","User-test-password!","newPassword","Changed-password-123!"),old,null);
        assertThat(reply.status()).isEqualTo(204);assertThat(call("GET","/auth/me",null,old,null).status()).isEqualTo(401);
        String fresh=login(text(user,"username"),"Changed-password-123!");
        assertThat(call("GET","/auth/me",null,fresh,null).body().toString()).doesNotContain("passwordHash","Changed-password");
        assertThat(db.all("AuditLog").toString()).doesNotContain("Changed-password-123!","User-test-password!");
    }
    @Test void residentScopeFiltersBeforeCountingAndMasksOtherIdentity()throws Exception {
        Home mine=home(),other=home();var r=resident();member(mine,r,true);var relative=resident();member(mine,relative,false);
        String token=token(user("RESIDENT",id(r)));
        assertThat(call("GET","/households/"+other.household(),null,token,null).status()).isEqualTo(404);
        var list=call("GET","/apartments?size=100",null,token,null).body();assertThat(((Number)list.get("totalElements")).intValue()).isEqualTo(1);
        assertThat(call("GET","/residents/"+id(relative),null,token,null).body().get("identityNo")).isNull();
        assertThat(call("GET","/residents/"+id(r),null,token,null).body().get("identityNo")).isEqualTo(r.get("identityNo"));
        assertThat(call("POST","/payments",Map.of(),token,unique()).status()).isEqualTo(400);
        assertThat(call("GET","/payments?householdId="+other.household(),null,token,null).body().get("totalElements")).isEqualTo(0);
        assertThat(call("POST","/households",map("code",unique()),token,null).status()).isEqualTo(403);
    }
    @Test void changingHeadPreservesHistoryAndDisallowsDuplicateMembership()throws Exception {
        Home home=home();var r1=resident();var r2=resident();member(home,r1,true);var next=member(home,r2,false);
        var reply=call("PUT","/households/"+home.household()+"/head",map("memberId",id(next)),admin,null);assertThat(reply.status()).as(reply.body().toString()).isEqualTo(200);
        var rows=objects(call("GET","/households/"+home.household()+"/members?size=100",null,admin,null).body().get("content"));
        assertThat(rows).hasSize(4);assertThat(rows.stream().filter(m->active(m,today()) && Boolean.TRUE.equals(m.get("isHead"))).count()).isEqualTo(1);
        assertThat(call("POST","/households/"+home.household()+"/members",map("residentId",id(r1),"relationship","X","isHead",false,"validFrom",today().toString()),admin,null).status()).isEqualTo(422);
    }
    @Test void residenceTransferRequiresAnotherApproverAndRollsBackOnConflict()throws Exception {
        Home source=home(),target=home();var r=resident();member(source,r,true);var oldHead=resident();member(target,oldHead,true);
        var manager=user("MANAGER",null);String approver=token(manager);
        var change=create("/residence-changes",map("householdId",source.household(),"residentId",id(r),"targetHouseholdId",target.household(),"changeType","TRANSFER","effectiveFrom",today().toString(),"details",map("relationship","HEAD","isHead",true)));
        assertThat(call("POST","/residence-changes/"+id(change)+"/approve",null,admin,null).status()).isEqualTo(422);
        assertThat(call("POST","/residence-changes/"+id(change)+"/approve",null,approver,null).status()).isEqualTo(422);
        assertThat(db.where("HouseholdMember","residentId",id(r)).stream().filter(m->active(m,today())).findFirst().orElseThrow().get("householdId")).isEqualTo(source.household());
        var valid=create("/residence-changes",map("householdId",source.household(),"residentId",id(r),"targetHouseholdId",target.household(),"changeType","TRANSFER","effectiveFrom",today().toString(),"details",map("relationship","OTHER","isHead",false)));
        assertThat(call("POST","/residence-changes/"+id(valid)+"/approve",null,approver,null).status()).isEqualTo(200);
        assertThat(call("POST","/residence-changes/"+id(valid)+"/approve",null,approver,null).status()).isEqualTo(409);
        assertThat(db.where("HouseholdMember","residentId",id(r)).stream().filter(m->active(m,today())).findFirst().orElseThrow().get("householdId")).isEqualTo(target.household());
    }
    @Test void temporaryAbsenceDoesNotEndMembershipAndCanBeRejected()throws Exception {
        Home home=home();var resident=resident();member(home,resident,true);
        var request=map("householdId",home.household(),"residentId",id(resident),"changeType","TEMPORARY_ABSENCE","effectiveFrom",today().toString(),"effectiveTo",today().plusDays(5).toString(),"details",Map.of());
        var change=create("/residence-changes",request);String approver=token(user("MANAGER",null));
        assertThat(call("POST","/residence-changes/"+id(change)+"/approve",null,approver,null).status()).isEqualTo(200);
        assertThat(db.where("HouseholdMember","residentId",id(resident)).getFirst().get("validTo")).isNull();
        var rejected=create("/residence-changes",request);
        var reply=call("POST","/residence-changes/"+id(rejected)+"/reject",map("reason","Không đủ hồ sơ"),approver,null);
        assertThat(reply.body().get("status")).isEqualTo("REJECTED");assertThat(object(reply.body().get("details")).get("decisionReason")).isEqualTo("Không đủ hồ sơ");
    }
    @Test void rateIntervalsAndInvoiceVersionsAreEnforced()throws Exception {
        var fee=fee(true);String ratePath="/fee-types/"+id(fee)+"/rates";
        create(ratePath,map("unitPrice","0.00","effectiveFrom",start(),"effectiveTo",today().toString()));
        create(ratePath,map("unitPrice","10.00","effectiveFrom",today().toString()));
        assertThat(call("POST",ratePath,map("unitPrice","20.00","effectiveFrom",today().toString()),admin,null).status()).isEqualTo(422);
        var bill=draft();var line=map("feeTypeId",id(fee),"description","Test","quantity","1.000","unitPrice","10.00");
        line(bill.invoice(),0,line,409);line(bill.invoice(),1,line,201);
        var hugeVersion=HttpRequest.newBuilder(URI.create("http://localhost:"+port+"/api/invoices/"+bill.invoice()+"/lines"))
            .header("Authorization","Bearer "+admin).header("Content-Type","application/json").header("If-Match","\"99999999999999999999999999\"")
            .POST(HttpRequest.BodyPublishers.ofString(contract.json.writeValueAsString(line))).build();
        assertThat(client.send(hugeVersion,HttpResponse.BodyHandlers.ofString()).statusCode()).isEqualTo(409);
        issue(bill);line(bill.invoice(),3,line,409);
        var invoice=call("GET","/invoices/"+bill.invoice(),null,admin,null).body();contract.validate(invoice,object(contract.section("schemas").get("Invoice")),"invoice");
    }
    @Test void paymentsAreAtomicIdempotentAndVoidRestoresBalance()throws Exception {
        var bill=draft();issue(bill);String key=unique();var body=payment(bill,"300.00");
        var first=call("POST","/payments",body,admin,key);assertThat(first.status()).as(first.body().toString()).isEqualTo(201);
        var retry=call("POST","/payments",body,admin,key);assertThat(retry.body()).isEqualTo(first.body());
        assertThat(call("POST","/payments",payment(bill,"301.00"),admin,key).status()).isEqualTo(409);
        var invoice=call("GET","/invoices/"+bill.invoice(),null,admin,null).body();assertThat(invoice.get("status")).isEqualTo("PARTIALLY_PAID");assertThat(invoice.get("outstandingAmount")).isEqualTo("500.00");
        var invalid=payment(bill,"500.00");object(objects(invalid.get("allocations")).getFirst()).put("amount","400.00");
        assertThat(call("POST","/payments",invalid,admin,unique()).status()).isEqualTo(422);
        assertThat(call("POST","/payments",payment(bill,"501.00"),admin,unique()).status()).isEqualTo(409);
        var finalPayment=call("POST","/payments",payment(bill,"500.00"),admin,unique());assertThat(finalPayment.status()).isEqualTo(201);
        assertThat(call("GET","/invoices/"+bill.invoice(),null,admin,null).body().get("status")).isEqualTo("PAID");
        assertThat(call("POST","/payments/"+id(finalPayment.body())+"/void",map("reason","Nhập sai"),admin,unique()).status()).isEqualTo(200);
        assertThat(call("GET","/invoices/"+bill.invoice(),null,admin,null).body().get("outstandingAmount")).isEqualTo("500.00");
        contract.validate(first.body(),object(contract.section("schemas").get("Payment")),"payment");
    }
    @Test void concurrentPaymentsCannotOverCollectAndSameKeyCreatesOnce()throws Exception {
        var bill=draft();issue(bill);var body=payment(bill,"800.00");
        try(var pool=Executors.newFixedThreadPool(2)) {
            var gate=new CountDownLatch(1);var tasks=new ArrayList<Future<Reply>>();
            for(int i=0;i<2;i++)tasks.add(pool.submit(()->{gate.await();return call("POST","/payments",body,admin,unique());}));
            gate.countDown();var statuses=new ArrayList<Integer>();for(var task:tasks)statuses.add(task.get(20,TimeUnit.SECONDS).status());assertThat(statuses).containsExactlyInAnyOrder(201,409);
            var other=draft();issue(other);String key=unique();var sameBody=payment(other,"800.00");
            var one=pool.submit(()->call("POST","/payments",sameBody,admin,key));var two=pool.submit(()->call("POST","/payments",sameBody,admin,key));
            var r1=one.get(20,TimeUnit.SECONDS);var r2=two.get(20,TimeUnit.SECONDS);assertThat(r1.status()).isEqualTo(201);assertThat(r2.status()).isEqualTo(201);assertThat(id(r1.body())).isEqualTo(id(r2.body()));
        }
    }
    @Test void voluntaryContributionCanExceedPledgeAndDoesNotCreateDebt()throws Exception {
        Home home=home();var campaign=create("/contribution-campaigns",map("name","Quỹ vì người nghèo","startDate",start(),"endDate",today().plusDays(5).toString(),"purpose","Đóng góp tự nguyện"));
        var c=create("/contribution-campaigns/"+id(campaign)+"/contributions",map("householdId",home.household(),"pledgedAmount","100.00"));
        var body=map("householdId",home.household(),"channel","CASH","amount","200.00","paidAt",Instant.now().minusSeconds(1).toString(),"allocations",List.of(map("contributionId",id(c),"amount","200.00")));
        assertThat(call("POST","/payments",body,admin,unique()).status()).isEqualTo(201);
        assertThat(call("GET","/contributions/"+id(c),null,admin,null).body().get("paidAmount")).isEqualTo("200.00");
        assertThat(call("GET","/invoices?householdId="+home.household(),null,admin,null).body().get("totalElements")).isEqualTo(0);
    }
    @Test void receiptSnapshotIsImmutableAndPdfShowsVietnameseAndVoidMark()throws Exception {
        var bill=draft();var r=resident();member(bill.home(),r,true);issue(bill);
        var payment=call("POST","/payments",payment(bill,"800.00"),admin,unique()).body();
        var before=call("GET","/payments/"+id(payment)+"/receipt",null,admin,null).body();
        assertThat(call("PATCH","/residents/"+id(r),map("fullName","Tên đã thay đổi"),admin,null).status()).isEqualTo(200);
        assertThat(call("GET","/receipts/"+id(before),null,admin,null).body()).isEqualTo(before);
        assertThat(call("POST","/payments/"+id(payment)+"/void",map("reason","Sửa chứng từ"),admin,unique()).status()).isEqualTo(200);
        var request=HttpRequest.newBuilder(URI.create("http://localhost:"+port+"/api/receipts/"+id(before)+"/pdf")).header("Authorization","Bearer "+admin).GET().build();
        var response=client.send(request,HttpResponse.BodyHandlers.ofByteArray());assertThat(response.statusCode()).isEqualTo(200);
        try(var document=Loader.loadPDF(response.body())) {String text=new PDFTextStripper().getText(document);assertThat(text).contains("HỦY","Bảo trì thang máy",text(r,"fullName")).doesNotContain("Tên đã thay đổi");}
        contract.validate(before,object(contract.section("schemas").get("Receipt")),"receipt");
    }
    @Test void pendingIntentReservesLineAndFailedCommandCanBeRetriedAfterCorrection()throws Exception {
        var bill=draft();issue(bill);
        String actor=text(object(call("GET","/auth/me",null,admin,null).body().get("user")),"id");
        var intent=db.insert("PaymentIntent",map("householdId",bill.home().household(),"createdBy",actor,"providerCode","TEST","merchantOrderId",unique(),"idempotencyKey",unique(),"expectedAmount","800.00","currency","VND","status","PENDING","expiresAt",Instant.now().plusSeconds(300).toString(),"version",0L));
        db.insert("PaymentIntentItem",map("intentId",id(intent),"invoiceLineId",bill.line(),"contributionId",null,"amount","800.00"));
        String key=unique();var body=payment(bill,"800.00");
        var blocked=call("POST","/payments",body,admin,key);assertThat(blocked.status()).isEqualTo(409);assertThat(blocked.body().get("code")).isEqualTo("TARGET_RESERVED");
        db.update("PaymentIntent",id(intent),map("status","EXPIRED"));
        body.put("householdId",home().household());assertThat(call("POST","/payments",body,admin,key).status()).isEqualTo(422);
        body.put("householdId",bill.home().household());assertThat(call("POST","/payments",body,admin,key).status()).isEqualTo(201);
    }
    @Test void householdCloseRequiresEndedResidenceAndMembership()throws Exception {
        Home home=home();var resident=resident();var member=member(home,resident,true);
        assertThat(call("POST","/households/"+home.household()+"/close",map("closedAt",Instant.now().minusSeconds(1).toString()),admin,null).status()).isEqualTo(422);
        assertThat(call("POST","/households/"+home.household()+"/members/"+id(member)+"/end",map("validTo",today().toString()),admin,null).status()).isEqualTo(200);
        assertThat(call("POST","/occupancies/"+home.occupancy()+"/end",map("validTo",today().toString()),admin,null).status()).isEqualTo(200);
        assertThat(call("POST","/households/"+home.household()+"/close",map("closedAt",Instant.now().minusSeconds(1).toString()),admin,null).status()).isEqualTo(200);
        assertThat(call("POST","/households/"+home.household()+"/members",map("residentId",id(resident),"relationship","HEAD","isHead",true,"validFrom",today().toString()),admin,null).status()).isEqualTo(409);
        assertThat(call("GET","/apartments/"+home.apartment(),null,admin,null).body().get("status")).isEqualTo("VACANT");
    }
    @Test void decimalSortingAndResidenceDetailsFollowContract()throws Exception {
        var home=home();var fee=fee(true);
        create("/fee-types/"+id(fee)+"/rates",map("unitPrice","200.00","effectiveFrom",start(),"effectiveTo",today().toString()));
        create("/fee-types/"+id(fee)+"/rates",map("unitPrice","1000.00","effectiveFrom",today().toString()));
        var rows=objects(call("GET","/fee-types/"+id(fee)+"/rates?sort=unitPrice,asc",null,admin,null).body().get("content"));
        assertThat(rows.stream().map(r->r.get("unitPrice"))).containsExactly("200.00","1000.00");
        var resident=resident();member(home,resident,true);
        var second=resident();
        assertThat(call("POST","/households/"+home.household().toUpperCase(Locale.ROOT)+"/members",map("residentId",id(second).toUpperCase(Locale.ROOT),"relationship","OTHER","isHead",false,"validFrom",start()),admin,null).status()).isEqualTo(201);
        var request=map("householdId",home.household(),"residentId",id(resident),"changeType","TEMPORARY_ABSENCE","effectiveFrom",today().toString(),"effectiveTo",today().plusDays(1).toString(),"details",map("unknown",true));
        assertThat(call("POST","/residence-changes",request,admin,null).status()).isEqualTo(422);
    }
    @Test void maintenanceAllocationConservesDongAndFundTracksReceiptsAndExpenses()throws Exception {
        var homes=List.of(home(),home(),home());
        var fund=create("/maintenance-funds",map("code",unique(),"name","Quỹ bảo trì","openingBalance","0.00","openingDate",start()));
        var fee=create("/fee-types",map("code",unique(),"name","Sửa thang máy","basis","PER_APARTMENT","mandatory",true,"active",true));
        var period=create("/billing-periods",map("code",unique(),"startDate",start(),"endDate",today().toString(),"snapshotDate",today().toString(),"dueDate",today().plusDays(7).toString()));
        var request=map("fundId",id(fund),"periodId",id(period),"feeTypeId",id(fee),"description","Sửa thang máy","allocationBasis","EQUAL","totalCost","100.00","occupancyIds",homes.stream().map(Home::occupancy).toList());
        String key=unique();var reply=call("POST","/maintenance-rounds",request,admin,key);assertThat(reply.status()).as(reply.body().toString()).isEqualTo(201);
        var allocations=objects(reply.body().get("allocations"));assertThat(allocations.stream().map(a->decimal(a.get("amount"))).reduce(java.math.BigDecimal.ZERO,java.math.BigDecimal::add)).isEqualByComparingTo("100.00");
        assertThat(allocations.stream().map(a->a.get("amount"))).containsExactlyInAnyOrder("34.00","33.00","33.00");
        assertThat(call("POST","/maintenance-rounds",request,admin,key).body()).isEqualTo(reply.body());
        contract.validate(reply.body(),object(contract.section("schemas").get("MaintenanceRound")),"round");
        assertThat(call("POST","/billing-periods/"+id(period)+"/issue",null,admin,unique()).status()).isEqualTo(200);
        List<Map<String,Object>> payments=new ArrayList<>();
        for(var allocation:allocations) {
            var occupancy=db.get("HouseholdApartment",allocation.get("occupancyId"));
            var body=map("householdId",occupancy.get("householdId"),"channel","CASH","amount",allocation.get("amount"),"paidAt",Instant.now().minusSeconds(1).toString(),"allocations",List.of(map("invoiceLineId",allocation.get("invoiceLineId"),"amount",allocation.get("amount"))));
            var paid=call("POST","/payments",body,admin,unique());assertThat(paid.status()).isEqualTo(201);payments.add(paid.body());
        }
        var expense=map("amount","90.00","spentAt",Instant.now().minusSeconds(1).toString(),"description","Chi sửa chữa");String expenseKey=unique();
        assertThat(call("POST","/maintenance-funds/"+id(fund)+"/expenses",expense,admin,expenseKey).status()).isEqualTo(201);
        assertThat(call("POST","/maintenance-funds/"+id(fund)+"/expenses",expense,admin,expenseKey).status()).isEqualTo(201);
        var balance=call("GET","/maintenance-funds/"+id(fund),null,admin,null).body();assertThat(balance.get("balance")).isEqualTo("10.00");assertThat(balance.get("collectedAmount")).isEqualTo("100.00");
        contract.validate(balance,object(contract.section("schemas").get("MaintenanceFund")),"fund");
        expense.put("amount","11.00");assertThat(call("POST","/maintenance-funds/"+id(fund)+"/expenses",expense,admin,unique()).status()).isEqualTo(422);
        assertThat(call("POST","/payments/"+id(payments.getFirst())+"/void",map("reason","Sửa ghi nhận"),admin,unique()).status()).isEqualTo(422);
        assertThat(call("GET","/maintenance-funds/"+id(fund)+"/expenses",null,admin,null).body().get("totalElements")).isEqualTo(1);
    }
    @Test void maintenanceAreaWeightsAndInvalidOccupancyRollbackWholeRound()throws Exception {
        Home a=home(),b=home();assertThat(call("PATCH","/apartments/"+a.apartment(),map("areaM2","40.00"),admin,null).status()).isEqualTo(200);
        var fund=create("/maintenance-funds",map("code",unique(),"name","Quỹ sửa chữa","openingBalance","1000.00","openingDate",start()));
        var fee=create("/fee-types",map("code",unique(),"name","Sửa máy bơm","basis","PER_APARTMENT","mandatory",true,"active",true));
        var period=create("/billing-periods",map("code",unique(),"startDate",start(),"endDate",today().toString(),"snapshotDate",today().toString(),"dueDate",today().plusDays(7).toString()));
        var body=map("fundId",id(fund),"periodId",id(period),"feeTypeId",id(fee),"description","Sửa máy bơm","allocationBasis","PER_M2","totalCost","120.00","occupancyIds",List.of(a.occupancy(),b.occupancy()));
        var round=call("POST","/maintenance-rounds",body,admin,unique());assertThat(round.status()).as(round.body().toString()).isEqualTo(201);
        for(var allocation:objects(round.body().get("allocations")))assertThat(allocation.get("amount")).isEqualTo(a.occupancy().equals(allocation.get("occupancyId"))?"40.00":"80.00");
        body.put("occupancyIds",List.of(a.occupancy(),UUID.randomUUID().toString()));
        assertThat(call("POST","/maintenance-rounds",body,admin,unique()).status()).isEqualTo(404);
        assertThat(call("GET","/maintenance-rounds?fundId="+id(fund),null,admin,null).body().get("totalElements")).isEqualTo(1);
        String residentToken=token(user("RESIDENT",null));assertThat(call("GET","/maintenance-funds",null,residentToken,null).status()).isEqualTo(403);
    }
    static final String REGISTER_PASSWORD="Register-test-password!";
    Map<String,Object> registration(String username){return map("username",username,"password",REGISTER_PASSWORD,"fullName","Cư Dân "+unique(),"identityNo",unique(),"birthDate","1985-05-05","gender","FEMALE","phone","0900000000","apartmentCode","A-101");}
    Reply register(Map<String,Object> body)throws Exception {db.jdbc().update("DELETE FROM login_attempt");return call("POST","/auth/register",body,null,null);}
    String submit(Map<String,Object> body)throws Exception {var reply=register(body);assertThat(reply.status()).as(reply.body().toString()).isEqualTo(201);return id(reply.body());}
    @Test void registrationStaysInactiveUntilApprovedThenBecomesHeadWithResidentRole()throws Exception {
        String name="r"+unique();var body=registration(name);String request=submit(body);
        assertThat(call("POST","/auth/login",map("username",name,"password",REGISTER_PASSWORD),null,null).status()).isEqualTo(401);
        assertThat(db.where("AppUser","username",name)).isEmpty();
        assertThat(db.where("Resident","identityNo",body.get("identityNo"))).isEmpty();
        var pending=call("GET","/registrations?status=PENDING&size=100",null,admin,null);assertThat(pending.status()).isEqualTo(200);
        assertThat(pending.body().toString()).contains(name).doesNotContain("passwordHash");
        var home=home();String manager=token(user("MANAGER",null));
        var approved=call("POST","/registrations/"+request+"/approve",map("householdId",home.household()),manager,null);
        assertThat(approved.status()).as(approved.body().toString()).isEqualTo(200);assertThat(approved.body().get("status")).isEqualTo("APPROVED");
        contract.validate(approved.body(),object(contract.section("schemas").get("AccountRegistration")),"registration");
        var login=call("POST","/auth/login",map("username",name,"password",REGISTER_PASSWORD),null,null);assertThat(login.status()).isEqualTo(200);
        var profile=object(login.body().get("profile"));
        assertThat(objects(profile.get("roles")).stream().map(r->text(r,"code")).toList()).containsExactly("RESIDENT");
        assertThat(profile.get("householdIds")).isEqualTo(List.of(home.household()));
        assertThat(db.where("AccountRegistration","id",request).getFirst().get("passwordHash")).isNull();
        assertThat(call("POST","/registrations/"+request+"/approve",map("householdId",home.household()),admin,null).status()).isEqualTo(409);
    }
    @Test void registrationRejectsDuplicatesSecondHeadAndUnauthorizedReviewers()throws Exception {
        String name="r"+unique();String request=submit(registration(name));
        assertThat(register(registration(name)).status()).isEqualTo(409);
        assertThat(register(registration("admin")).status()).isEqualTo(409);
        var unknownField=registration("r"+unique());unknownField.put("status","ACTIVE");assertThat(register(unknownField).status()).isEqualTo(400);
        var home=home();member(home,resident(),true);
        var secondHead=call("POST","/registrations/"+request+"/approve",map("householdId",home.household()),admin,null);
        assertThat(secondHead.status()).as(secondHead.body().toString()).isEqualTo(422);
        assertThat(db.where("AppUser","username",name)).as("failed approval rolls back").isEmpty();
        var approval=map("householdId",home.household());
        for(String role:List.of("ACCOUNTANT","AUTHORITY","RESIDENT"))assertThat(call("POST","/registrations/"+request+"/approve",approval,token(user(role,null)),null).status()).isEqualTo(403);
        assertThat(call("GET","/registrations",null,token(user("RESIDENT",null)),null).status()).isEqualTo(403);
        var rejected=call("POST","/registrations/"+request+"/reject",map("reason","Sai thông tin căn hộ"),admin,null);
        assertThat(rejected.status()).isEqualTo(200);assertThat(rejected.body().get("rejectReason")).isEqualTo("Sai thông tin căn hộ");
        assertThat(call("POST","/auth/login",map("username",name,"password",REGISTER_PASSWORD),null,null).status()).isEqualTo(401);
        submit(registration(name));
    }
    @Test void registrationThrottlesEachClient()throws Exception {
        db.jdbc().update("DELETE FROM login_attempt");
        for(int i=0;i<5;i++)assertThat(call("POST","/auth/register",registration("r"+unique()),null,null).status()).isEqualTo(201);
        assertThat(call("POST","/auth/register",registration("r"+unique()),null,null).status()).isEqualTo(429);
        db.jdbc().update("DELETE FROM login_attempt");
    }
    @Test void onlyActiveHeadAddsFamilyMembersAndTheyGetNoAccount()throws Exception {
        var home=home();var headResident=resident();member(home,headResident,true);var memberResident=resident();member(home,memberResident,false);
        String head=token(user("RESIDENT",id(headResident))),nonHead=token(user("RESIDENT",id(memberResident)));
        var person=map("fullName","Bé "+unique(),"birthDate","2015-02-02","gender","MALE","relationship","CHILD");
        int accounts=db.all("AppUser").size();
        var added=call("POST","/households/"+home.household()+"/family-members",person,head,null);
        assertThat(added.status()).as(added.body().toString()).isEqualTo(201);assertThat(added.body().get("isHead")).isEqualTo(false);
        assertThat(added.response().headers().firstValue("Location").orElse("")).isEqualTo("/api/households/"+home.household());
        assertThat(db.all("AppUser")).hasSize(accounts);
        assertThat(db.get("HouseholdMember",id(added.body())).get("validFrom")).isEqualTo(today().toString());
        assertThat(call("POST","/households/"+home.household()+"/family-members",person,nonHead,null).status()).isEqualTo(403);
        var other=home();assertThat(call("POST","/households/"+other.household()+"/family-members",person,head,null).status()).isEqualTo(403);
        assertThat(call("POST","/households/"+home.household()+"/family-members",person,admin,null).status()).isEqualTo(403);
        var promoted=new LinkedHashMap<>(person);promoted.put("relationship","HEAD");assertThat(call("POST","/households/"+home.household()+"/family-members",promoted,head,null).status()).isEqualTo(400);
        assertThat(call("POST","/residents",map("fullName","X","birthDate","2000-01-01","gender","MALE"),head,null).status()).isEqualTo(403);
    }
    @Test void loginThrottlePersistsFailedAttemptsAndCorsAllowsCommandHeaders()throws Exception {
        String name="unknown-"+unique();
        for(int i=0;i<5;i++)assertThat(call("POST","/auth/login",map("username",name,"password","wrong"),null,null).status()).isEqualTo(401);
        assertThat(call("POST","/auth/login",map("username",name,"password","wrong"),null,null).status()).isEqualTo(429);
        var req=HttpRequest.newBuilder(URI.create("http://localhost:"+port+"/api/payments")).header("Origin","http://localhost:5173").header("Access-Control-Request-Method","POST").header("Access-Control-Request-Headers","authorization,content-type,idempotency-key,if-match").method("OPTIONS",HttpRequest.BodyPublishers.noBody()).build();
        var res=client.send(req,HttpResponse.BodyHandlers.ofString());assertThat(res.statusCode()).isEqualTo(200);assertThat(res.headers().firstValue("Access-Control-Allow-Headers").orElse("")).containsIgnoringCase("idempotency-key");
    }
}
