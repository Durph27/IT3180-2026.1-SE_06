package com.bluemoon.backend.service;
import com.bluemoon.backend.api.FeatureHandler;
import com.bluemoon.backend.security.Actor;
import jakarta.servlet.http.HttpServletRequest;
import java.util.*;
import org.springframework.stereotype.Component;

@Component
public class MaintenanceHandler implements FeatureHandler {
    private final MaintenanceService service;
    public MaintenanceHandler(MaintenanceService service) { this.service=service; }
    public boolean supports(String path) { return Set.of("maintenance-funds","maintenance-rounds").contains(path.split("/")[1]); }
    public Object execute(String method,String path,Map<String,String> ids,Map<String,Object> body,HttpServletRequest request,Actor actor) {
        return service.execute(path,ids.get("id"),body,actor);
    }
}
