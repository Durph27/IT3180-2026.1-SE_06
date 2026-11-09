package com.bluemoon.backend.api;

import com.bluemoon.backend.repository.DomainStore;
import com.bluemoon.backend.security.*;
import com.bluemoon.backend.service.*;
import jakarta.servlet.http.HttpServletRequest;
import java.net.URI;
import java.time.Instant;
import java.util.*;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import static com.bluemoon.backend.api.Values.*;

/** Shared contract checks, permission enforcement and transaction/idempotency boundary. */
@Service
public class SprintApi {
    private static final Map<String,String> MODELS=Map.ofEntries(
        Map.entry("buildings","Building"),Map.entry("apartments","Apartment"),Map.entry("households","Household"),Map.entry("occupancies","HouseholdApartment"),Map.entry("residents","Resident"),Map.entry("residence-changes","ResidenceChange"),
        Map.entry("users","AppUser"),Map.entry("registrations","AccountRegistration"),Map.entry("roles","Role"),Map.entry("permissions","Permission"),Map.entry("fee-types","FeeType"),Map.entry("fee-rates","FeeRate"),Map.entry("billing-periods","BillingPeriod"),Map.entry("invoices","Invoice"),Map.entry("contribution-campaigns","ContributionCampaign"),Map.entry("contributions","Contribution"),Map.entry("payments","Payment"),Map.entry("receipts","Receipt"),Map.entry("maintenance-funds","MaintenanceFund"),Map.entry("maintenance-rounds","MaintenanceRound"));
    private final Contract contract;
    private final DomainStore db;
    private final IdentityService identities;
    private final RegistrationService registrations;
    private final ResourceViews views;
    private final List<FeatureHandler> handlers;
    private final TransactionTemplate tx;
    public SprintApi(Contract contract, DomainStore db, IdentityService identities, RegistrationService registrations, ResourceViews views,
                     List<FeatureHandler> handlers, PlatformTransactionManager manager) {
        this.contract=contract; this.db=db; this.identities=identities; this.registrations=registrations; this.views=views;
        this.handlers=handlers; this.tx=new TransactionTemplate(manager);
    }
    public ResponseEntity<?> execute(String key,Map<String,String> rawIds,Map<String,String> rawQuery,Map<String,Object> raw,HttpServletRequest req) {
        var ids=new LinkedHashMap<>(rawIds);
        var query=new LinkedHashMap<>(rawQuery);
        var route=contract.route(key);String method=key.substring(0,key.indexOf(' ')),path=key.substring(key.indexOf(' ')+1);
        var body=raw==null?new LinkedHashMap<String,Object>():object(contract.normalize(raw));
        if(path.equals("/residence-changes") && method.equals("POST"))contract.residenceDetails(body);
        if(route.get("body")!=null) {
            if(raw==null)throw ApiException.bad("Thiếu request body.");
            contract.validate(body,object(route.get("body")),"body");
        } else if(!body.isEmpty())throw ApiException.bad("Endpoint không nhận body.");
        validateParameters(route,ids,query,req);
        if(key.equals("POST /auth/login"))return ResponseEntity.ok(identities.login(body,req.getRemoteAddr()));
        if(key.equals("POST /auth/register"))return ResponseEntity.status(201).body(registrations.register(body,req.getRemoteAddr()));
        return tx.execute(status->{
            boolean mutation=!method.equals("GET");if(mutation)db.lockWrites();
            // Reload after the mutation lock: concurrent role/status changes take effect now.
            var actor=identities.actor(((Actor)req.getAttribute("actor")).id());
            String permission=text(route,"permission");
            if(!permission.equals("AUTHENTICATED") && !actor.can(permission))throw new ApiException(403,"PERMISSION_DENIED","Bạn không có quyền thao tác.");
            String command=req.getHeader("Idempotency-Key");
            boolean idempotent=objects(route.get("parameters")).stream().anyMatch(p->"Idempotency-Key".equals(p.get("name")));
            String canonicalPath=path;
            for(var variable:ids.entrySet())canonicalPath=canonicalPath.replace("{"+variable.getKey()+"}",variable.getValue());
            String fingerprint=IdentityService.sha256(actor.id()+"|"+method+"|/api"+canonicalPath+"|"+contract.canonical(body));
            if(idempotent) {
                var previous=db.jdbc().queryForList("SELECT * FROM command_result WHERE command_key=?",command);
                if(!previous.isEmpty()) {
                    var row=previous.getFirst();
                    if(!fingerprint.equals(row.get("fingerprint")))throw new ApiException(409,"IDEMPOTENCY_CONFLICT","Idempotency-Key đã dùng cho yêu cầu khác.");
                    var builder=ResponseEntity.status(((Number)row.get("status")).intValue());
                    if(row.get("location")!=null)builder.header("Location",row.get("location").toString());
                    return builder.body(contract.json.readValue(row.get("response_body").toString(),Object.class));
                }
            }
            Object result=dispatch(method,path,ids,query,body,req,actor);
            int http=((Number)route.get("status")).intValue();String location=null;
            if(http==201 && result instanceof Map<?,?> resultMap && resultMap.get("id")!=null) {
                String root=path.split("/")[1];
                if(path.endsWith("/rates"))location="/api/fee-types/"+ids.get("id");
                else if(path.endsWith("/members"))location="/api/households/"+ids.get("id");
                else if(path.endsWith("/lines"))location="/api/invoices/"+ids.get("id");
                else if(path.endsWith("/contributions"))location="/api/contributions/"+resultMap.get("id");
                else if(path.endsWith("/expenses"))location="/api/maintenance-funds/"+ids.get("id")+"/expenses";
                else location="/api/"+root+"/"+resultMap.get("id");
            }
            if(mutation)audit(actor,key,ids,body,result,req);
            if(idempotent)db.jdbc().update("INSERT INTO command_result VALUES (?,?,?,?,?)",command,fingerprint,http,location,contract.json.writeValueAsString(result));
            var builder=ResponseEntity.status(http);if(location!=null)builder.location(URI.create(location));
            if(result instanceof byte[])return builder.contentType(MediaType.APPLICATION_PDF).header("Content-Disposition","attachment; filename=receipt-"+ids.get("id")+".pdf").body(result);
            if(path.startsWith("/receipts/") || path.endsWith("/receipt")) {
                var receipt=object(result);builder.header("X-Payment-Status",text(db.get("Payment",receipt.get("paymentId")),"status"));
            }
            return builder.body(result);
        });
    }
    private Object dispatch(String method,String path,Map<String,String> ids,Map<String,String> query,Map<String,Object> b,HttpServletRequest req,Actor actor) {
        String root=path.split("/")[1],id=ids.get("id"),model=MODELS.get(root);
        if(root.equals("auth"))return handle(method,path,ids,b,req,actor);
        if(method.equals("GET")) {
            if(path.endsWith("/expenses")){views.get("MaintenanceFund",id,actor);return views.list("MaintenanceExpense",db.where("MaintenanceExpense","fundId",id),query,actor);}
            if(id!=null && (path.endsWith("/roles") || path.endsWith("/permissions")))return handle(method,path,ids,b,req,actor);
            if(path.endsWith("/receipt")) {
                views.get("Payment",id,actor);var receipts=db.where("Receipt","paymentId",id);if(receipts.isEmpty())throw ApiException.missing();return views.get("Receipt",receipts.getFirst().get("id"),actor);
            }
            if(path.endsWith("/pdf")) return handle(method,path,ids,b,req,actor);
            if(path.endsWith("/members")){views.get("Household",id,actor);return views.list("HouseholdMember",db.where("HouseholdMember","householdId",id),query,actor);}
            if(path.endsWith("/rates")){views.get("FeeType",id,actor);return views.list("FeeRate",db.where("FeeRate","feeTypeId",id),query,actor);}
            if(path.endsWith("/contributions")){views.get("ContributionCampaign",id,actor);return views.list("Contribution",db.where("Contribution","campaignId",id),query,actor);}
            return id==null?views.list(model,db.all(model),query,actor):views.get(model,id,actor);
        }
        return handle(method,path,ids,b,req,actor);
    }
    private Object handle(String method,String path,Map<String,String> ids,Map<String,Object> body,HttpServletRequest req,Actor actor) {
        return handlers.stream().filter(h -> h.supports(path)).findFirst()
            .orElseThrow(ApiException::missing).execute(method,path,ids,body,req,actor);
    }
    private void validateParameters(Map<String,Object>route,Map<String,String>ids,Map<String,String>query,HttpServletRequest req) {
        Set<String> allowedQuery=new HashSet<>();
        for(var values:req.getParameterMap().values())if(values.length!=1)throw ApiException.bad("Query parameter không được lặp.");
        for(var p:objects(route.get("parameters"))) {
            String name=text(p,"name"),in=text(p,"in"),value=in.equals("path")?ids.get(name):in.equals("query")?query.get(name):req.getHeader(name);
            if(in.equals("query"))allowedQuery.add(name);
            if(value==null) {
                if(Boolean.TRUE.equals(p.get("required")))throw new ApiException(400,name.equals("Idempotency-Key")?"MISSING_IDEMPOTENCY_KEY":"INVALID_REQUEST","Thiếu "+name);
                continue;
            }
            var schema=object(p.get("schema"));Object typed=value;
            try {
                if("integer".equals(schema.get("type")))typed=Integer.valueOf(value);
                if("boolean".equals(schema.get("type"))) {
                    if(!Set.of("true","false").contains(value))throw ApiException.bad(name+" phải là boolean.");
                    typed=Boolean.valueOf(value);
                }
            }catch(NumberFormatException e){throw ApiException.bad(name+" phải là số nguyên hợp lệ.");}
            contract.validate(typed,schema,name);
            if("uuid".equals(schema.get("format"))) {
                String canonical=UUID.fromString(value).toString();
                if(in.equals("path"))ids.put(name,canonical);
                if(in.equals("query"))query.put(name,canonical);
            }
        }
        if(!allowedQuery.containsAll(query.keySet()))throw ApiException.bad("Query parameter không được hỗ trợ.");
        if(query.containsKey("from") && query.containsKey("to"))ApiException.rule(!java.time.OffsetDateTime.parse(query.get("from")).isAfter(java.time.OffsetDateTime.parse(query.get("to"))),"Khoảng thời gian không hợp lệ.");
    }
    private void audit(Actor actor,String action,Map<String,String>ids,Map<String,Object>body,Object result,HttpServletRequest req) {
        String entityId=ids.get("id");if(result instanceof Map<?,?>m && m.get("id")!=null)entityId=m.get("id").toString();if(entityId==null)entityId=actor.id();
        db.insert("AuditLog",map("actorId",actor.id(),"action",req.getMethod(),"entityType",action.substring(action.indexOf(' ')+1).split("/")[1],"entityId",entityId,"beforeData",null,"afterData",redact(map("request",body,"result",result)),"occurredAt",Instant.now().toString(),"requestId",req.getAttribute("requestId")));
    }
    private Object redact(Object value) {
        if(value instanceof Map<?,?>) {
            var safe=new LinkedHashMap<String,Object>();object(value).forEach((k,v)->{String lower=k.toLowerCase(Locale.ROOT);safe.put(k,lower.contains("password") || lower.contains("token") || lower.contains("secret") || lower.equals("identityno")?"[REDACTED]":redact(v));});return safe;
        }
        if(value instanceof Collection<?>c)return c.stream().map(this::redact).toList();return value;
    }
}
