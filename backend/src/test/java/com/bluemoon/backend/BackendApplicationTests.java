package com.bluemoon.backend;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.test.context.SpringBootTest;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.datasource.url=jdbc:h2:mem:bluemoon_test;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "app.cors.allowed-origins=http://localhost:5173"
})
class BackendApplicationTests {

    @LocalServerPort
    private int port;

    @Test
    void healthChecksDatabaseThroughHttp() throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/health"))
                .header("Origin", "http://localhost:5173").GET().build();
        var response = HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body()).contains("\"status\":\"UP\"", "\"database\":\"UP\"");
        assertThat(response.headers().firstValue("Access-Control-Allow-Origin"))
                .contains("http://localhost:5173");
    }

    @Test
    void helloEndpointRemainsAvailable() throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/hello")).GET().build();
        var response = HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body()).isEqualTo("Hello from BlueMoon!");
    }

}
