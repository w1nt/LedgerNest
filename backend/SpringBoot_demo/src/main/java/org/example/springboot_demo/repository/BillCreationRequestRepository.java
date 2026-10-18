package org.example.springboot_demo.repository;

import java.time.LocalDateTime;
import java.util.Optional;
import org.example.springboot_demo.model.BillCreationRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** No independent transactions: these writes and the bill insert must commit or roll back together. */
@Repository
public class BillCreationRequestRepository {
    private final JdbcTemplate jdbc;

    public BillCreationRequestRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public void insert(long userId, String keyHash, String requestHash, LocalDateTime now) {
        jdbc.update("INSERT INTO bill_creation_requests(userId,keyHash,requestHash,createdAt) VALUES(?,?,?,?)",
                userId, keyHash, requestHash, now);
    }

    /** Must be invoked inside the existing BillCreation transaction to hold the row lock. */
    public Optional<BillCreationRequest> findForUpdate(long userId, String keyHash) {
        return jdbc.query("SELECT requestHash,billId FROM bill_creation_requests WHERE userId=? AND keyHash=? FOR UPDATE",
                (rs, n) -> new BillCreationRequest(rs.getString("requestHash"), rs.getObject("billId", Long.class)),
                userId, keyHash).stream().findFirst();
    }

    public int attachBill(long userId, String keyHash, long billId) {
        return jdbc.update("UPDATE bill_creation_requests SET billId=? WHERE userId=? AND keyHash=?", billId, userId, keyHash);
    }
}
