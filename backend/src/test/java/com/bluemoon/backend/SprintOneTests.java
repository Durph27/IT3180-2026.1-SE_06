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
}
