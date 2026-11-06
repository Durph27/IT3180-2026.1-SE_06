package com.bluemoon.backend.exception;

import com.bluemoon.backend.dto.HealthResponse;
import com.bluemoon.backend.api.ApiException;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);
    private final ApiErrors errors;

    public GlobalExceptionHandler(ApiErrors errors) {
        this.errors = errors;
    }

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<?> handleApi(ApiException e, HttpServletRequest request) {
        var builder = ResponseEntity.status(e.status());
        if (e.status() == 429) builder.header("Retry-After", "60");
        return builder.body(errors.body(request, e));
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<?> handleConflict(DataIntegrityViolationException e, HttpServletRequest request) {
        return handleApi(new ApiException(409, "DUPLICATE_RESOURCE", "Dữ liệu trùng hoặc vi phạm ràng buộc."), request);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<?> handleJson(HttpMessageNotReadableException e, HttpServletRequest request) {
        return handleApi(ApiException.bad("JSON không hợp lệ."), request);
    }

    @ExceptionHandler(DataAccessException.class)
    public ResponseEntity<?> handleDatabaseError(DataAccessException exception, HttpServletRequest request) {
        log.error("Database operation failed, requestId={}", request.getAttribute("requestId"));
        if (request.getRequestURI().equals("/api/health"))
            return ResponseEntity.status(503).body(new HealthResponse("DOWN", "DOWN"));
        return handleApi(new ApiException(503, "DEPENDENCY_UNAVAILABLE", "Dịch vụ dữ liệu chưa sẵn sàng."), request);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<?> handleUnexpected(Exception e, HttpServletRequest request) {
        log.error("Unexpected failure, requestId={}", request.getAttribute("requestId"), e);
        return handleApi(new ApiException(500, "INTERNAL_ERROR", "Lỗi nội bộ."), request);
    }
}
