package com.bluemoon.backend.service;

import com.bluemoon.backend.api.FeatureHandler;
import com.bluemoon.backend.security.Actor;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.stereotype.Component;

@Component
public class RegistrationHandler implements FeatureHandler {
    private final RegistrationService service;
    public RegistrationHandler(RegistrationService service) { this.service = service; }
    public boolean supports(String path) { return path.split("/")[1].equals("registrations"); }
    public Object execute(String method, String path, Map<String,String> ids, Map<String,Object> body,
                          HttpServletRequest request, Actor actor) {
        return service.execute(path, ids.get("id"), body, actor);
    }
}
