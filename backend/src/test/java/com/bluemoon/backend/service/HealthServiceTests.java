package com.bluemoon.backend.service;

import com.bluemoon.backend.exception.GlobalExceptionHandler;
import com.bluemoon.backend.exception.ApiErrors;
import com.bluemoon.backend.dto.HealthResponse;
import org.springframework.mock.web.MockHttpServletRequest;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class HealthServiceTests {
    @Test
    void databaseOutageIsNotReportedAsHealthy() {
        var jdbcTemplate = mock(JdbcTemplate.class);
        var failure = new DataAccessResourceFailureException("Unavailable");
        when(jdbcTemplate.queryForObject("SELECT 1", Integer.class)).thenThrow(failure);
        assertThatThrownBy(() -> new HealthService(jdbcTemplate).check()).isSameAs(failure);
        var request = new MockHttpServletRequest("GET", "/api/health");
        var response = new GlobalExceptionHandler(mock(ApiErrors.class)).handleDatabaseError(failure, request);
        assertThat(response.getStatusCode().value()).isEqualTo(503);
        assertThat(((HealthResponse) response.getBody()).database()).isEqualTo("DOWN");
    }
}
