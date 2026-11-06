package com.bluemoon.backend.exception;

import com.bluemoon.backend.api.*;
import jakarta.servlet.http.*;

import java.io.IOException;
import java.time.Instant;
import java.util.*;

import org.springframework.stereotype.Component;

import static com.bluemoon.backend.api.Values.*;

@Component
public class ApiErrors {
    private final Contract contract;

    public ApiErrors(Contract contract) {
        this.contract = contract;
    }

    public void requestId(HttpServletRequest req, HttpServletResponse res) {
        if (req.getAttribute("requestId") == null) req.setAttribute("requestId", UUID.randomUUID().toString());
        res.setHeader("X-Request-Id", req.getAttribute("requestId").toString());
    }

    public Map<String, Object> body(HttpServletRequest req, ApiException e) {
        return map("code", e.code(), "message", e.getMessage(), "requestId", req.getAttribute("requestId"), "timestamp", Instant.now().toString(), "path", req.getRequestURI(), "details", List.of());
    }

    public void write(HttpServletRequest req, HttpServletResponse res, ApiException e) throws IOException {
        requestId(req, res);
        res.setStatus(e.status());
        res.setContentType("application/json");
        res.setCharacterEncoding("UTF-8");
        if (e.status() == 429) res.setHeader("Retry-After", "60");
        res.getWriter().write(contract.json.writeValueAsString(body(req, e)));
    }
}
