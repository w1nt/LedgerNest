package org.example.springboot_demo.repository;

import java.math.BigDecimal;
import java.sql.Statement;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import org.example.springboot_demo.model.Bill;
import org.example.springboot_demo.model.BillCriteria;
import org.example.springboot_demo.model.BillSummary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Repository;

/** All bill access is scoped to an authenticated user; no HTTP or calendar policy lives here. */
@Repository
public class BillRepository {
    private static final String FROM = " FROM bills JOIN bill_settlements fs ON fs.billId=bills.id";
    private static final String REMAINING = "fs.remainingAmount";
    private static final String CONFIRMED = "fs.confirmedAmount";
    private static final String STAGE = "fs.stage";
    private static final String COLUMNS = "bills.id,amount,vendorName,comment,createdAt,dueAt,updatedAt,paidAt,"
            +STAGE+" AS settlementStatus,COALESCE(fs.version,0) AS settlementVersion,"
            +CONFIRMED+" AS confirmed,COALESCE(fs.pendingAmount,0) AS processing,"+REMAINING+" AS remaining,COALESCE(fs.overpaidAmount,0) AS overpaid";
    private static final RowMapper<Bill> BILL = (rs, n) -> new Bill(rs.getLong("id"),
            rs.getBigDecimal("amount"), rs.getString("vendorName"), rs.getString("comment"),
            rs.getObject("createdAt", LocalDateTime.class), rs.getObject("dueAt", LocalDateTime.class),
            rs.getObject("updatedAt", LocalDateTime.class), rs.getObject("paidAt", LocalDateTime.class),
            rs.getString("settlementStatus"),rs.getLong("settlementVersion"),rs.getBigDecimal("confirmed"),rs.getBigDecimal("processing"),
            rs.getBigDecimal("remaining"),rs.getBigDecimal("overpaid"));
    private final JdbcTemplate jdbc;

    public BillRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public long insert(long userId, BigDecimal amount, String name, String comment, LocalDateTime due, LocalDateTime now) {
        var key = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            var statement = connection.prepareStatement(
                    "INSERT INTO bills(userId,amount,vendorName,comment,createdAt,updatedAt,dueAt) VALUES(?,?,?,?,?,?,?)",
                    Statement.RETURN_GENERATED_KEYS);
            statement.setLong(1, userId);
            statement.setBigDecimal(2, amount);
            statement.setString(3, name);
            statement.setString(4, comment);
            statement.setObject(5, now);
            statement.setObject(6, now);
            statement.setObject(7, due);
            return statement;
        }, key);
        return Objects.requireNonNull(key.getKey()).longValue();
    }

    public Optional<Bill> findByIdForUser(long userId, long id) {
        return jdbc.query("SELECT " + COLUMNS + FROM + " WHERE userId=? AND bills.id=?", BILL, userId, id).stream().findFirst();
    }

    public int updateForUser(long userId, long id, BigDecimal amount, String name, String comment, LocalDateTime due, LocalDateTime now) {
        return jdbc.update("UPDATE bills SET amount=?,vendorName=?,comment=?,dueAt=?,updatedAt=? WHERE userId=? AND id=?",
                amount, name, comment, due, now, userId, id);
    }

    public void updateCompletionForUser(long userId,long id,boolean completed,LocalDateTime now) {
        jdbc.update("UPDATE bills SET paidAt=CASE WHEN ? THEN COALESCE(paidAt,?) ELSE NULL END,updatedAt=? WHERE userId=? AND id=?",
                completed,now,now,userId,id);
    }

    public int deleteForUser(long userId, long id) {
        return jdbc.update("DELETE FROM bills WHERE userId=? AND id=?", userId, id);
    }

    private record Filter(String sql, List<Object> args) {}

    private Filter filter(long userId, BillCriteria criteria) {
        var sql = new StringBuilder(" WHERE userId=?");
        List<Object> args = new ArrayList<>();
        args.add(userId);
        if(!List.of("voided","any").contains(criteria.status())) sql.append(" AND fs.lifecycle='open'");
        if(List.of("unpaid","awaiting_confirmation","completed","voided").contains(criteria.status())) {
            sql.append(" AND "+STAGE+"=?");args.add(criteria.status());
        }
        if (!criteria.query().isEmpty()) {
            // Literal search preserves '%' and '_' as text; inputs never become SQL syntax.
            sql.append(" AND (LOCATE(LOWER(?),LOWER(vendorName))>0 OR LOCATE(LOWER(?),LOWER(comment))>0)");
            args.add(criteria.query()); args.add(criteria.query());
        }
        if(criteria.status().equals("outstanding")) sql.append(" AND "+REMAINING+">0");
        if (criteria.status().equals("overdue")) {
            sql.append(" AND "+REMAINING+">0 AND dueAt<?");
            args.add(criteria.overdueBefore());
        }
        if (criteria.dueFrom() != null) {
            sql.append(" AND dueAt>=? AND dueAt<?");
            args.add(criteria.dueFrom()); args.add(criteria.dueUntil());
        }
        return new Filter(sql.toString(), args);
    }

    public List<Bill> findForUser(long userId, BillCriteria criteria, int limit) {
        var filter = filter(userId, criteria);
        var args = new ArrayList<>(filter.args()); args.add(limit);
        return jdbc.query("SELECT " + COLUMNS + FROM + filter.sql() + " ORDER BY createdAt DESC,bills.id DESC LIMIT ?",
                BILL, args.toArray());
    }

    public long countForUser(long userId, BillCriteria criteria) {
        var filter = filter(userId, criteria);
        return Objects.requireNonNull(jdbc.queryForObject("SELECT COUNT(*)"+FROM+filter.sql(), Long.class, filter.args().toArray()));
    }

    public List<Bill> findPageForUser(long userId, BillCriteria criteria, int size, long offset) {
        var filter = filter(userId, criteria);
        var args = new ArrayList<>(filter.args()); args.add(size); args.add(offset);
        return jdbc.query("SELECT " + COLUMNS + FROM + filter.sql() + " ORDER BY createdAt DESC,bills.id DESC LIMIT ? OFFSET ?",
                BILL, args.toArray());
    }

    public BillSummary summarizeForUser(long userId, BillCriteria criteria) {
        var filter = filter(userId, criteria);
        String overdue = "("+REMAINING+">0 AND dueAt<?)";
        String sql = "SELECT COUNT(*) AS totalCount, COALESCE(SUM(amount),0) AS totalAmount, "
                + "COALESCE(SUM(LEAST(amount,GREATEST(0,"+CONFIRMED+"))),0) AS paidAmount, "
                + "COALESCE(SUM("+REMAINING+"),0) AS pendingAmount, "
                + "COALESCE(SUM(CASE WHEN " + overdue + " THEN "+REMAINING+" ELSE 0 END),0) AS overdueAmount, "
                + "COALESCE(SUM(CASE WHEN "+STAGE+"='completed' THEN 1 ELSE 0 END),0) AS paidCount, "
                + "COALESCE(SUM(CASE WHEN " + overdue + " THEN 1 ELSE 0 END),0) AS overdueCount,"
                + "COALESCE(SUM(fs.pendingAmount),0) AS processingAmount,COALESCE(SUM(fs.overpaidAmount),0) AS overpaidAmount,"
                + "COALESCE(SUM("+CONFIRMED+"),0) AS confirmedAmount"+FROM+filter.sql();
        List<Object> args = new ArrayList<>();
        args.add(criteria.overdueBefore()); args.add(criteria.overdueBefore()); args.addAll(filter.args());
        return jdbc.queryForObject(sql, (rs, n) -> new BillSummary(rs.getLong("totalCount"),
                rs.getBigDecimal("totalAmount"), rs.getBigDecimal("paidAmount"), rs.getBigDecimal("pendingAmount"),
                rs.getBigDecimal("overdueAmount"), rs.getLong("paidCount"), rs.getLong("overdueCount"),
                rs.getBigDecimal("processingAmount"),rs.getBigDecimal("overpaidAmount"),rs.getBigDecimal("confirmedAmount")), args.toArray());
    }

    public List<Bill> findRemindersForUser(long userId, LocalDateTime before, int limit) {
        return jdbc.query("SELECT " + COLUMNS + FROM + " WHERE userId=? AND fs.lifecycle='open' AND "+REMAINING+">0 AND dueAt<? ORDER BY dueAt,bills.id LIMIT ?",
                BILL, userId, before, limit);
    }
}
