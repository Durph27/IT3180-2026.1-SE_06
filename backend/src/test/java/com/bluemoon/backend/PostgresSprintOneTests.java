package com.bluemoon.backend;

import java.sql.*;
import java.util.*;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/** Runs the same HTTP suite in a fresh schema; never migrates the application's public schema. */
@EnabledIfEnvironmentVariable(named="TEST_POSTGRES_URL", matches=".+")
class PostgresSprintOneTests extends SprintOneTests {
    private static final String SCHEMA="sprint1_test_"+UUID.randomUUID().toString().replace("-","");
    private static Connection connect() throws SQLException {
        var properties=new Properties();
        properties.setProperty("user",System.getenv().getOrDefault("TEST_POSTGRES_USER","postgres"));
        properties.setProperty("password",System.getenv().getOrDefault("TEST_POSTGRES_PASSWORD",""));
        return DriverManager.getConnection(System.getenv("TEST_POSTGRES_URL"),properties);
    }
    @DynamicPropertySource static void database(DynamicPropertyRegistry registry)throws SQLException {
        try(var connection=connect();var statement=connection.createStatement()){statement.execute("CREATE SCHEMA "+SCHEMA);}
        registry.add("spring.datasource.url",()->System.getenv("TEST_POSTGRES_URL"));
        registry.add("spring.datasource.username",()->System.getenv().getOrDefault("TEST_POSTGRES_USER","postgres"));
        registry.add("spring.datasource.password",()->System.getenv().getOrDefault("TEST_POSTGRES_PASSWORD",""));
        registry.add("spring.datasource.hikari.schema",()->SCHEMA);
        registry.add("spring.flyway.default-schema",()->SCHEMA);
    }
    @AfterAll void removeTestSchema()throws SQLException {
        try(var connection=connect();var statement=connection.createStatement()){statement.execute("DROP SCHEMA "+SCHEMA+" CASCADE");}
    }
}
