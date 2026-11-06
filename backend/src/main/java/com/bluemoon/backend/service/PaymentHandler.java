package com.bluemoon.backend.service;
import com.bluemoon.backend.api.FeatureHandler;
import com.bluemoon.backend.security.Actor;
import jakarta.servlet.http.HttpServletRequest;
import java.util.*;
import org.springframework.stereotype.Component;

@Component
public class PaymentHandler implements FeatureHandler {
    private final PaymentService service;
    private final ReceiptPdf pdf;
    private final ResourceViews views;
    private final com.bluemoon.backend.repository.DomainStore db;
    public PaymentHandler(PaymentService service, ReceiptPdf pdf, ResourceViews views, com.bluemoon.backend.repository.DomainStore db) { this.service=service; this.pdf=pdf; this.views=views; this.db=db; }
    public boolean supports(String path) { return Set.of("payments","receipts").contains(path.split("/")[1]); }
    public Object execute(String method,String path,Map<String,String> ids,Map<String,Object> body,HttpServletRequest request,Actor actor) {
        String id=ids.get("id");
        if(path.endsWith("/pdf")) {
            var receipt=views.get("Receipt",id,actor);
            return pdf.render(receipt,"VOIDED".equals(db.get("Payment",receipt.get("paymentId")).get("status")));
        }
        return id==null?service.record(body,request.getHeader("Idempotency-Key"),actor):service.voidPayment(id,actor);
    }
}
