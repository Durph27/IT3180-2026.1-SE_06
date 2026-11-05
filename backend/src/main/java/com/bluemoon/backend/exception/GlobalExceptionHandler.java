package com.bluemoon.backend.exception;

import com.bluemoon.backend.dto.HealthResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(DataAccessException.class)
    public ResponseEntity<HealthResponse> handleDatabaseError(DataAccessException exception) {
        log.error("Database operation failed", exception);
        return ResponseEntity.status(503).body(new HealthResponse("DOWN", "DOWN"));
    }
}
