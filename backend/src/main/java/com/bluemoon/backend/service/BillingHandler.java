package com.bluemoon.backend.service;
import com.bluemoon.backend.api.FeatureHandler;
import com.bluemoon.backend.security.Actor;
import jakarta.servlet.http.HttpServletRequest;
import java.util.*;
import org.springframework.stereotype.Component;

@Component
public class BillingHandler implements FeatureHandler {
    private final BillingService service;
    public BillingHandler(BillingService service) { this.service=service; }
    public boolean supports(String path) { return Set.of("fee-types","fee-rates","billing-periods","invoices","contribution-campaigns","contributions").contains(path.split("/")[1]); }
    public Object execute(String method,String path,Map<String,String> ids,Map<String,Object> body,HttpServletRequest request,Actor actor) {
        return service.execute(method,path,ids,body,request.getHeader("If-Match"),actor);
    }
}
