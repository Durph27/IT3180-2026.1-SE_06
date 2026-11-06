package com.bluemoon.backend.api;

import com.bluemoon.backend.security.Actor;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;

/** Each feature registers commands without coupling other feature services. */
public interface FeatureHandler {
    boolean supports(String path);
    Object execute(String method, String path, Map<String,String> ids, Map<String,Object> body,
                   HttpServletRequest request, Actor actor);
}
