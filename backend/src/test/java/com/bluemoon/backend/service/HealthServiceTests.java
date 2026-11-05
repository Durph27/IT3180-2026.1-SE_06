package com.bluemoon.backend.service;

import com.bluemoon.backend.exception.GlobalExceptionHandler;
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
        var response = new GlobalExceptionHandler().handleDatabaseError(failure);
        assertThat(response.getStatusCode().value()).isEqualTo(503);
        assertThat(response.getBody().database()).isEqualTo("DOWN");
    }
}
