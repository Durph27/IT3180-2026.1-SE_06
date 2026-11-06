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

}
