package com.bluemoon.backend;

import com.bluemoon.backend.api.*;
import com.bluemoon.backend.repository.DomainStore;
import java.net.URI;
import java.net.http.*;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import static org.assertj.core.api.Assertions.*;
import static com.bluemoon.backend.api.Values.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
    "spring.datasource.url=jdbc:h2:mem:fee_calc_test;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
    "spring.datasource.username=sa", "spring.datasource.password=",
    "app.bootstrap.password=FeeCalc-test-password!",
    "logging.level.root=WARN"
})
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class FeeCalculationTests {

    @LocalServerPort int port;
    @Autowired Contract contract;
    @Autowired DomainStore db;
    private final HttpClient client = HttpClient.newHttpClient();
    private String admin;

    record Reply(int status, Map<String, Object> body, HttpResponse<byte[]> response) {}

    String unique() { return UUID.randomUUID().toString().substring(0, 8); }
    String id(Map<String, Object> value) { return text(value, "id"); }
    String start() { return today().minusMonths(1).toString(); }

    @BeforeAll void setupAdmin() throws Exception {
        admin = login("admin", "FeeCalc-test-password!");
    }

    @BeforeEach void cleanDatabase() {
        db.jdbc().execute("SET REFERENTIAL_INTEGRITY FALSE");
        for (String table : List.of("invoice_line", "invoice", "fee_rate", "fee_type",
                "household_member", "household_apartment", "household", "apartment",
                "building", "resident", "billing_period", "residence_change",
                "command_result", "audit_log")) {
            db.jdbc().execute("TRUNCATE TABLE " + table);
        }
        db.jdbc().execute("SET REFERENTIAL_INTEGRITY TRUE");
    }

    String login(String username, String password) throws Exception {
        var reply = call("POST", "/auth/login", map("username", username, "password", password), null, null);
        assertThat(reply.status()).as(reply.body().toString()).isEqualTo(200);
        return text(reply.body(), "accessToken");
    }

    Reply call(String method, String path, Object body, String token, String command) throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api" + path))
                .header("Content-Type", "application/json");
        if (token != null) request.header("Authorization", "Bearer " + token);
        if (command != null) request.header("Idempotency-Key", command);
        request.method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(contract.json.writeValueAsString(body)));
        return receive(client.send(request.build(), HttpResponse.BodyHandlers.ofByteArray()));
    }

    Reply receive(HttpResponse<byte[]> response) {
        Object parsed = response.body().length == 0 ? Map.of() : contract.json.readValue(response.body(), Object.class);
        Map<String, Object> body = parsed instanceof List<?> ? map("items", parsed) : object(parsed);
        return new Reply(response.statusCode(), body, response);
    }

    Map<String, Object> create(String path, Map<String, Object> body) throws Exception {
        var reply = call("POST", path, body, admin, null);
        assertThat(reply.status()).as(path + ": " + reply.body()).isEqualTo(201);
        return reply.body();
    }

    Map<String, Object> resident() throws Exception {
        return create("/residents", map("fullName", "Nguyễn Văn " + unique(), "birthDate", "1990-01-01", "gender", "MALE", "identityNo", unique()));
    }

    Map<String, Object> member(String householdId, String residentId, boolean head, String from, String to) throws Exception {
        var body = map("residentId", residentId, "relationship", head ? "HEAD" : "CHILD", "isHead", head, "validFrom", from);
        if (to != null) body.put("validTo", to);
        return create("/households/" + householdId + "/members", body);
    }

    @Test void testFeeCalculationPerM2AndPerPerson() throws Exception {
        var building = create("/buildings", map("code", unique(), "name", "BlueMoon Tower", "address", "Hà Nội"));
        var apartment = create("/apartments", map("buildingId", id(building), "code", unique(), "floorNo", 5, "areaM2", "85.50"));
        var household = create("/households", map("code", unique()));
        create("/occupancies", map("householdId", id(household), "apartmentId", id(apartment), "validFrom", start()));

        // Add 3 residents to the household
        for (int i = 0; i < 3; i++) {
            var r = resident();
            member(id(household), id(r), i == 0, start(), null);
        }

        // Create PER_M2 fee type and rate (12,000 VND / m2)
        var feeM2 = create("/fee-types", map("code", "M2_" + unique(), "name", "Phí dịch vụ chung cư", "basis", "PER_M2", "mandatory", true, "active", true));
        create("/fee-types/" + id(feeM2) + "/rates", map("unitPrice", "12000.00", "effectiveFrom", start()));

        // Create PER_PERSON fee type and rate (30,000 VND / person)
        var feePerson = create("/fee-types", map("code", "PS_" + unique(), "name", "Phí vệ sinh môi trường", "basis", "PER_PERSON", "mandatory", true, "active", true));
        create("/fee-types/" + id(feePerson) + "/rates", map("unitPrice", "30000.00", "effectiveFrom", start()));

        // Create BillingPeriod
        var period = create("/billing-periods", map(
                "code", unique(),
                "startDate", start(),
                "endDate", today().toString(),
                "snapshotDate", today().toString(),
                "dueDate", today().plusDays(7).toString()
        ));

        // Generate Invoices
        var reply = call("POST", "/billing-periods/" + id(period) + "/generate-invoices", null, admin, unique());
        assertThat(reply.status()).as(reply.body().toString()).isEqualTo(200);

        assertThat(reply.body().get("createdCount")).isEqualTo(1);
        assertThat(reply.body().get("existingCount")).isEqualTo(0);

        var invoices = objects(reply.body().get("invoices"));
        assertThat(invoices).hasSize(1);

        var invoice = invoices.getFirst();
        // Total expected: (85.50 * 12,000) + (3 * 30,000) = 1,026,000.00 + 90,000.00 = 1,116,000.00
        assertThat(invoice.get("totalAmount")).isEqualTo("1116000.00");
        assertThat(invoice.get("outstandingAmount")).isEqualTo("1116000.00");
        assertThat(invoice.get("paidAmount")).isEqualTo("0.00");

        var lines = objects(invoice.get("lines"));
        assertThat(lines).hasSize(2);

        var lineM2 = lines.stream().filter(l -> id(feeM2).equals(l.get("feeTypeId"))).findFirst().orElseThrow();
        assertThat(lineM2.get("quantity")).isEqualTo("85.500");
        assertThat(lineM2.get("unitPrice")).isEqualTo("12000.00");
        assertThat(lineM2.get("amount")).isEqualTo("1026000.00");
        assertThat(lineM2.get("description")).isEqualTo("Phí dịch vụ chung cư");

        var linePerson = lines.stream().filter(l -> id(feePerson).equals(l.get("feeTypeId"))).findFirst().orElseThrow();
        assertThat(linePerson.get("quantity")).isEqualTo("3.000");
        assertThat(linePerson.get("unitPrice")).isEqualTo("30000.00");
        assertThat(linePerson.get("amount")).isEqualTo("90000.00");
        assertThat(linePerson.get("description")).isEqualTo("Phí vệ sinh môi trường");
    }

    @Test void testMultipleApartmentsForSingleHouseholdAllocatesPersonFeeToEarliestOnly() throws Exception {
        var building = create("/buildings", map("code", unique(), "name", "BlueMoon Tower B", "address", "Hà Nội"));
        var aptEarly = create("/apartments", map("buildingId", id(building), "code", unique(), "floorNo", 2, "areaM2", "60.00"));
        var aptLate = create("/apartments", map("buildingId", id(building), "code", unique(), "floorNo", 3, "areaM2", "90.00"));

        var household = create("/households", map("code", unique()));
        // Earliest occupancy: 2 months ago
        var occEarly = create("/occupancies", map("householdId", id(household), "apartmentId", id(aptEarly), "validFrom", today().minusMonths(2).toString()));
        // Later occupancy: 1 month ago
        var occLate = create("/occupancies", map("householdId", id(household), "apartmentId", id(aptLate), "validFrom", today().minusMonths(1).toString()));

        // Add 2 residents to the household
        for (int i = 0; i < 2; i++) {
            var r = resident();
            member(id(household), id(r), i == 0, today().minusMonths(2).toString(), null);
        }

        var feeM2 = create("/fee-types", map("code", "M2B_" + unique(), "name", "Phí quản lý", "basis", "PER_M2", "mandatory", true, "active", true));
        create("/fee-types/" + id(feeM2) + "/rates", map("unitPrice", "10000.00", "effectiveFrom", start()));

        var feePerson = create("/fee-types", map("code", "PSB_" + unique(), "name", "Phí an ninh", "basis", "PER_PERSON", "mandatory", true, "active", true));
        create("/fee-types/" + id(feePerson) + "/rates", map("unitPrice", "20000.00", "effectiveFrom", start()));

        var period = create("/billing-periods", map(
                "code", unique(),
                "startDate", start(),
                "endDate", today().toString(),
                "snapshotDate", today().toString(),
                "dueDate", today().plusDays(7).toString()
        ));

        var reply = call("POST", "/billing-periods/" + id(period) + "/generate-invoices", null, admin, unique());
        assertThat(reply.status()).isEqualTo(200);

        var invoices = objects(reply.body().get("invoices"));
        var invEarly = invoices.stream().filter(i -> id(occEarly).equals(i.get("occupancyId"))).findFirst().orElseThrow();
        var invLate = invoices.stream().filter(i -> id(occLate).equals(i.get("occupancyId"))).findFirst().orElseThrow();

        // Earliest occupancy receives both PER_M2 (60 m2 * 10,000 = 600,000) and PER_PERSON (2 * 20,000 = 40,000)
        var earlyLines = objects(invEarly.get("lines"));
        assertThat(earlyLines.stream().anyMatch(l -> id(feeM2).equals(l.get("feeTypeId")))).isTrue();
        assertThat(earlyLines.stream().anyMatch(l -> id(feePerson).equals(l.get("feeTypeId")))).isTrue();
        assertThat(invEarly.get("totalAmount")).isEqualTo("640000.00");

        // Later occupancy receives ONLY PER_M2 (90 m2 * 10,000 = 900,000), PER_PERSON is NOT present
        var lateLines = objects(invLate.get("lines"));
        assertThat(lateLines.stream().anyMatch(l -> id(feeM2).equals(l.get("feeTypeId")))).isTrue();
        assertThat(lateLines.stream().anyMatch(l -> id(feePerson).equals(l.get("feeTypeId")))).isFalse();
        assertThat(invLate.get("totalAmount")).isEqualTo("900000.00");
    }

    @Test void testIdempotencyAndNoDuplicateLinesOnRerun() throws Exception {
        var building = create("/buildings", map("code", unique(), "name", "BlueMoon Tower C", "address", "Hà Nội"));
        var apartment = create("/apartments", map("buildingId", id(building), "code", unique(), "floorNo", 4, "areaM2", "70.00"));
        var household = create("/households", map("code", unique()));
        create("/occupancies", map("householdId", id(household), "apartmentId", id(apartment), "validFrom", start()));

        var r = resident();
        member(id(household), id(r), true, start(), null);

        var feeM2 = create("/fee-types", map("code", "M2C_" + unique(), "name", "Phí dịch vụ C", "basis", "PER_M2", "mandatory", true, "active", true));
        create("/fee-types/" + id(feeM2) + "/rates", map("unitPrice", "15000.00", "effectiveFrom", start()));

        var period = create("/billing-periods", map(
                "code", unique(),
                "startDate", start(),
                "endDate", today().toString(),
                "snapshotDate", today().toString(),
                "dueDate", today().plusDays(7).toString()
        ));

        // First run
        var reply1 = call("POST", "/billing-periods/" + id(period) + "/generate-invoices", null, admin, unique());
        assertThat(reply1.status()).isEqualTo(200);
        assertThat(reply1.body().get("createdCount")).isEqualTo(1);
        assertThat(reply1.body().get("existingCount")).isEqualTo(0);

        // Second run with a new Idempotency-Key
        var reply2 = call("POST", "/billing-periods/" + id(period) + "/generate-invoices", null, admin, unique());
        assertThat(reply2.status()).isEqualTo(200);
        assertThat(reply2.body().get("createdCount")).isEqualTo(0);
        assertThat(reply2.body().get("existingCount")).isEqualTo(1);

        var invoices = objects(reply2.body().get("invoices"));
        assertThat(invoices).hasSize(1);
        var lines = objects(invoices.getFirst().get("lines"));
        // Lines should not be duplicated
        assertThat(lines.stream().filter(l -> id(feeM2).equals(l.get("feeTypeId")))).hasSize(1);
    }

    @Test void testTemporaryAbsenceStillCountedAsMember() throws Exception {
        var building = create("/buildings", map("code", unique(), "name", "Tower D", "address", "Hà Nội"));
        var apartment = create("/apartments", map("buildingId", id(building), "code", unique(), "floorNo", 1, "areaM2", "50.00"));
        var household = create("/households", map("code", unique()));
        create("/occupancies", map("householdId", id(household), "apartmentId", id(apartment), "validFrom", start()));

        // Head resident
        var head = resident();
        member(id(household), id(head), true, start(), null);

        // Temporarily absent resident
        var absent = resident();
        member(id(household), id(absent), false, start(), null);
        // Record temporary absence
        var change = create("/residence-changes", map(
                "householdId", id(household),
                "residentId", id(absent),
                "changeType", "TEMPORARY_ABSENCE",
                "effectiveFrom", today().toString(),
                "effectiveTo", today().plusDays(10).toString(),
                "details", Map.of()
        ));
        call("POST", "/residence-changes/" + id(change) + "/approve", null, admin, null);

        var feePerson = create("/fee-types", map("code", "PSD_" + unique(), "name", "Phí rác", "basis", "PER_PERSON", "mandatory", true, "active", true));
        create("/fee-types/" + id(feePerson) + "/rates", map("unitPrice", "25000.00", "effectiveFrom", start()));

        var period = create("/billing-periods", map(
                "code", unique(),
                "startDate", start(),
                "endDate", today().toString(),
                "snapshotDate", today().toString(),
                "dueDate", today().plusDays(7).toString()
        ));

        var reply = call("POST", "/billing-periods/" + id(period) + "/generate-invoices", null, admin, unique());
        assertThat(reply.status()).isEqualTo(200);

        var invoices = objects(reply.body().get("invoices"));
        var lines = objects(invoices.getFirst().get("lines"));
        var linePerson = lines.stream().filter(l -> id(feePerson).equals(l.get("feeTypeId"))).findFirst().orElseThrow();
        // Both head and absent resident must be counted: 2 * 25,000 = 50,000
        assertThat(linePerson.get("quantity")).isEqualTo("2.000");
        assertThat(linePerson.get("amount")).isEqualTo("50000.00");
    }

    @Test void testEndedMembershipAndEndedOccupancyNotCounted() throws Exception {
        var building = create("/buildings", map("code", unique(), "name", "Tower E", "address", "Hà Nội"));
        var aptActive = create("/apartments", map("buildingId", id(building), "code", unique(), "floorNo", 1, "areaM2", "50.00"));
        var aptEnded = create("/apartments", map("buildingId", id(building), "code", unique(), "floorNo", 2, "areaM2", "50.00"));

        var hActive = create("/households", map("code", unique()));
        create("/occupancies", map("householdId", id(hActive), "apartmentId", id(aptActive), "validFrom", start()));

        // Active member
        var r1 = resident();
        member(id(hActive), id(r1), true, start(), null);

        // Member who ended before snapshotDate (ended yesterday)
        var r2 = resident();
        var m2 = member(id(hActive), id(r2), false, start(), null);
        call("POST", "/households/" + id(hActive) + "/members/" + id(m2) + "/end", map("validTo", today().minusDays(1).toString()), admin, null);

        // Ended occupancy before snapshotDate
        var hEnded = create("/households", map("code", unique()));
        var occEnded = create("/occupancies", map("householdId", id(hEnded), "apartmentId", id(aptEnded), "validFrom", today().minusMonths(2).toString()));
        call("POST", "/occupancies/" + id(occEnded) + "/end", map("validTo", today().minusDays(1).toString()), admin, null);

        var feePerson = create("/fee-types", map("code", "PSE_" + unique(), "name", "Phí rác E", "basis", "PER_PERSON", "mandatory", true, "active", true));
        create("/fee-types/" + id(feePerson) + "/rates", map("unitPrice", "10000.00", "effectiveFrom", start()));

        var period = create("/billing-periods", map(
                "code", unique(),
                "startDate", start(),
                "endDate", today().toString(),
                "snapshotDate", today().toString(),
                "dueDate", today().plusDays(7).toString()
        ));

        var reply = call("POST", "/billing-periods/" + id(period) + "/generate-invoices", null, admin, unique());
        assertThat(reply.status()).isEqualTo(200);

        var invoices = objects(reply.body().get("invoices"));
        // Only active occupancy gets an invoice
        assertThat(invoices).hasSize(1);

        var lines = objects(invoices.getFirst().get("lines"));
        var linePerson = lines.stream().filter(l -> id(feePerson).equals(l.get("feeTypeId"))).findFirst().orElseThrow();
        // Only r1 is counted, r2 is excluded
        assertThat(linePerson.get("quantity")).isEqualTo("1.000");
        assertThat(linePerson.get("amount")).isEqualTo("10000.00");
    }

    @Test void testGenerateInvoicesRequiresDraftPeriodAndCorrectPermission() throws Exception {
        var building = create("/buildings", map("code", unique(), "name", "Tower F", "address", "Hà Nội"));
        var apartment = create("/apartments", map("buildingId", id(building), "code", unique(), "floorNo", 1, "areaM2", "50.00"));
        var household = create("/households", map("code", unique()));
        create("/occupancies", map("householdId", id(household), "apartmentId", id(apartment), "validFrom", start()));

        var fee = create("/fee-types", map("code", "FEF_" + unique(), "name", "Test Fee", "basis", "PER_M2", "mandatory", true, "active", true));
        create("/fee-types/" + id(fee) + "/rates", map("unitPrice", "100.00", "effectiveFrom", start()));

        var period = create("/billing-periods", map(
                "code", unique(),
                "startDate", start(),
                "endDate", today().toString(),
                "snapshotDate", today().toString(),
                "dueDate", today().plusDays(7).toString()
        ));

        // Missing Idempotency-Key returns 400
        var replyMissingKey = call("POST", "/billing-periods/" + id(period) + "/generate-invoices", null, admin, null);
        assertThat(replyMissingKey.status()).isEqualTo(400);

        // User with RESIDENT role lacks invoice.generate permission -> 403
        var r = resident();
        member(id(household), id(r), true, start(), null);
        var residentUser = create("/users", map("username", "res_" + unique(), "displayName", "Cư dân", "password", "Resident-pass-123!", "residentId", id(r)));
        var resToken = login(text(residentUser, "username"), "Resident-pass-123!");
        var replyForbidden = call("POST", "/billing-periods/" + id(period) + "/generate-invoices", null, resToken, unique());
        assertThat(replyForbidden.status()).isEqualTo(403);

        // Generate draft invoices
        var gen = call("POST", "/billing-periods/" + id(period) + "/generate-invoices", null, admin, unique());
        assertThat(gen.status()).isEqualTo(200);

        // Issue period
        var issueReply = call("POST", "/billing-periods/" + id(period) + "/issue", null, admin, unique());
        assertThat(issueReply.status()).isEqualTo(200);

        // Calling generate-invoices on ISSUED period returns 409
        var replyIssued = call("POST", "/billing-periods/" + id(period) + "/generate-invoices", null, admin, unique());
        assertThat(replyIssued.status()).isEqualTo(409);
    }
}
