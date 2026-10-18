package org.example.springboot_demo;

import java.math.BigDecimal;
import java.sql.Connection;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import static org.example.springboot_demo.repository.DatabaseValues.*;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
class SqliteStorageTests extends SqliteTestDatabase {
    @Autowired DataSource source;
    @Autowired JdbcTemplate jdbc;

    @Test void everyPooledConnectionEnforcesForeignKeysAndWal() throws Exception {
        List<Connection> connections = new ArrayList<>();
        try {
            for (int index = 0; index < 4; index++) {
                var connection = source.getConnection();
                connections.add(connection);
                try (var statement = connection.createStatement(); var result = statement.executeQuery("PRAGMA foreign_keys")) {
                    assertTrue(result.next()); assertEquals(1, result.getInt(1));
                }
                try (var statement = connection.createStatement(); var result = statement.executeQuery("PRAGMA journal_mode")) {
                    assertTrue(result.next()); assertEquals("wal", result.getString(1));
                }
            }
        } finally { for (var connection : connections) connection.close(); }
    }

    @Test @Transactional void integerMoneyIsExactAndFractionalStorageIsRejected() {
        String email = UUID.randomUUID() + "@storage.test";
        String time = "2026-10-17T00:00:00.000000000";
        jdbc.update("INSERT INTO users(username,email,password,createdAt,updatedAt) VALUES('storage',?,'test',?,?)", email,time,time);
        long id = jdbc.queryForObject("SELECT id FROM users WHERE email=?",Long.class,email);
        for (long amount : new long[]{10,20,99999999999L})
            jdbc.update("INSERT INTO bills(userId,amountCents,vendorName,createdAt,updatedAt,dueAt) VALUES(?,?,'storage',?,?,?)",id,amount,time,time,time);
        assertEquals(0L,jdbc.queryForObject("SELECT COUNT(*) FROM bills WHERE userId=? AND typeof(amountCents)!='integer'",Long.class,id));
        assertEquals(new BigDecimal("1000000000.29"), jdbc.queryForObject("SELECT SUM(amountCents) AS total FROM bills WHERE userId=?",(rs,n)->money(rs,"total"),id));
        assertThrows(DataIntegrityViolationException.class, () -> jdbc.update("INSERT INTO bills(userId,amountCents,vendorName,createdAt,updatedAt,dueAt) VALUES(?,0.5,'bad',?,?,?)",id,time,time,time));
    }
}
