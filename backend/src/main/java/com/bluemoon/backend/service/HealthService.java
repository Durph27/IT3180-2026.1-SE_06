package com.bluemoon.backend.service;

import com.bluemoon.backend.dto.HealthResponse;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class HealthService {
    private final JdbcTemplate jdbcTemplate;

    public HealthService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public HealthResponse check() {
        jdbcTemplate.queryForObject("SELECT 1", Integer.class);
        return new HealthResponse("UP", "UP");
    }
}
