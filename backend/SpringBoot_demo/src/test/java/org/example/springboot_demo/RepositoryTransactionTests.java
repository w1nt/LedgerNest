package org.example.springboot_demo;

import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.example.springboot_demo.repository.BillCreationRequestRepository;
import org.example.springboot_demo.repository.UserPreferencesRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import tools.jackson.databind.ObjectMapper;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** Force failures AFTER another repository wrote: the outer service transaction must roll back all rows. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class RepositoryTransactionTests {
    @Value("${local.server.port}") int port;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper json;
    @MockitoSpyBean UserPreferencesRepository preferences;
    @MockitoSpyBean BillCreationRequestRepository creationRequests;
    private final List<String> emails = new ArrayList<>();
    private final HttpClient client = HttpClient.newBuilder().cookieHandler(new CookieManager(null, CookiePolicy.ACCEPT_ALL)).build();

    private String email() {
        String email = "repository-test-" + UUID.randomUUID() + "@example.test";
        emails.add(email);
        return email;
    }

    private Map<String, String> registration(String email) {
        return Map.of("username", "repository-test", "email", email, "password", "Repository-test-2026!",
                "confirm", "Repository-test-2026!", "address", "");
    }

    private HttpResponse<String> post(String path, Object body, String key) throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
                .header("Content-Type", "application/json").header("X-Requested-With", "XMLHttpRequest");
        if (key != null) request.header("Idempotency-Key", key);
        return client.send(request.POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body))).build(),
                HttpResponse.BodyHandlers.ofString());
    }

    @AfterEach void cleanup() {
        for (String email : emails) {
            var ids = jdbc.query("SELECT id FROM users WHERE email=?", (rs, n) -> rs.getLong(1), email);
            for (long id : ids) {
                jdbc.update("DELETE FROM bill_creation_requests WHERE userId=?", id);
                jdbc.update("DELETE FROM bills WHERE userId=?", id);
                jdbc.update("DELETE FROM user_preferences WHERE userId=?", id);
                jdbc.update("DELETE FROM users WHERE id=?", id);
            }
        }
    }

    @Test void preferenceFailureRollsBackTheNewUser() throws Exception {
        String email = email();
        doThrow(new DataIntegrityViolationException("forced preference failure")).when(preferences).insertDefault(anyLong(), any());
        try {
            assertEquals(503, post("/register", registration(email), null).statusCode());
            assertEquals(0L, jdbc.queryForObject("SELECT COUNT(*) FROM users WHERE email=?", Long.class, email));
        } finally {
            doCallRealMethod().when(preferences).insertDefault(anyLong(), any());
        }
        assertEquals(201, post("/register", registration(email), null).statusCode());
        assertEquals(1L, jdbc.queryForObject("SELECT COUNT(*) FROM user_preferences p JOIN users u ON p.userId=u.id WHERE u.email=?", Long.class, email));
    }

    @Test void failedAssociationRollsBackTheBillAndTheIdempotencyRecord() throws Exception {
        String email = email();
        assertEquals(201, post("/register", registration(email), null).statusCode());
        assertEquals(200, post("/login", Map.of("email", email, "password", "Repository-test-2026!"), null).statusCode());
        long userId = jdbc.queryForObject("SELECT id FROM users WHERE email=?", Long.class, email);
        String key = UUID.randomUUID().toString();
        var bill = Map.of("amount", "0.10", "vendorName", "repository rollback", "comment", "", "dueAt", "2026-10-20T00:00:00Z");
        doThrow(new DataIntegrityViolationException("forced association failure")).when(creationRequests).attachBill(anyLong(), anyString(), anyLong());
        try {
            assertEquals(503, post("/bills", bill, key).statusCode());
            assertEquals(0L, jdbc.queryForObject("SELECT COUNT(*) FROM bills WHERE userId=?", Long.class, userId));
            assertEquals(0L, jdbc.queryForObject("SELECT COUNT(*) FROM bill_creation_requests WHERE userId=?", Long.class, userId));
        } finally {
            doCallRealMethod().when(creationRequests).attachBill(anyLong(), anyString(), anyLong());
        }
        long billId = json.readTree(post("/bills", bill, key).body()).get("id").asLong();
        var retry = post("/bills", bill, key);
        assertEquals(201, retry.statusCode());
        assertEquals(billId, json.readTree(retry.body()).get("id").asLong());
        assertEquals(1L, jdbc.queryForObject("SELECT COUNT(*) FROM bills WHERE userId=?", Long.class, userId));
    }
}
