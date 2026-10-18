package org.example.springboot_demo.repository;

import static org.example.springboot_demo.repository.DatabaseValues.*;

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
    private static final String REMAINING = "fs.remainingAmountCents";
    private static final String CONFIRMED = "fs.confirmedAmountCents";
    private static final String STAGE = "fs.stage";
    private static final String COLUMNS = "bills.id,amountCents,vendorName,comment,createdAt,dueAt,updatedAt,paidAt,"
            +STAGE+" AS settlementStatus,COALESCE(fs.version,0) AS settlementVersion,"
            +CONFIRMED+" AS confirmed,COALESCE(fs.pendingAmountCents,0) AS processing,"+REMAINING+" AS remaining,COALESCE(fs.overpaidAmountCents,0) AS overpaid";
    private static final RowMapper<Bill> BILL = (rs, n) -> new Bill(rs.getLong("id"),
            money(rs,"amountCents"), rs.getString("vendorName"), rs.getString("comment"),
            time(rs.getString("createdAt")), time(rs.getString("dueAt")),
            time(rs.getString("updatedAt")), time(rs.getString("paidAt")),
            rs.getString("settlementStatus"),rs.getLong("settlementVersion"),money(rs,"confirmed"),money(rs,"processing"),
            money(rs,"remaining"),money(rs,"overpaid"));
    private final JdbcTemplate jdbc;

    public BillRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public long insert(long userId, BigDecimal amount, String name, String comment, LocalDateTime due, LocalDateTime now) {
        var key = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            var statement = connection.prepareStatement(
                    "INSERT INTO bills(userId,amountCents,vendorName,comment,createdAt,updatedAt,dueAt) VALUES(?,?,?,?,?,?,?)",
                    Statement.RETURN_GENERATED_KEYS);
            statement.setLong(1, userId);
            statement.setLong(2, cents(amount));
            statement.setString(3, name);
            statement.setString(4, comment);
            statement.setString(5, time(now));
            statement.setString(6, time(now));
            statement.setString(7, time(due));
            return statement;
        }, key);
        return Objects.requireNonNull(key.getKey()).longValue();
    }

    public Optional<Bill> findByIdForUser(long userId, long id) {
        return jdbc.query("SELECT " + COLUMNS + FROM + " WHERE userId=? AND bills.id=?", BILL, userId, id).stream().findFirst();
    }

    public int updateForUser(long userId, long id, BigDecimal amount, String name, String comment, LocalDateTime due, LocalDateTime now) {
        return jdbc.update("UPDATE bills SET amountCents=?,vendorName=?,comment=?,dueAt=?,updatedAt=? WHERE userId=? AND id=?",
                cents(amount), name, comment, time(due), time(now), userId, id);
    }

    public void updateCompletionForUser(long userId,long id,boolean completed,LocalDateTime now) {
        jdbc.update("UPDATE bills SET paidAt=CASE WHEN ? THEN COALESCE(paidAt,?) ELSE NULL END,updatedAt=? WHERE userId=? AND id=?",
                completed,time(now),time(now),userId,id);
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
            sql.append(" AND (instr(LOWER(vendorName),LOWER(?))>0 OR instr(LOWER(comment),LOWER(?))>0)");
            args.add(criteria.query()); args.add(criteria.query());
        }
        if(criteria.status().equals("outstanding")) sql.append(" AND "+REMAINING+">0");
        if (criteria.status().equals("overdue")) {
            sql.append(" AND "+REMAINING+">0 AND dueAt<?");
            args.add(time(criteria.overdueBefore()));
        }
        if (criteria.dueFrom() != null) {
            sql.append(" AND dueAt>=? AND dueAt<?");
            args.add(time(criteria.dueFrom())); args.add(time(criteria.dueUntil()));
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
        String sql = "SELECT COUNT(*) AS totalCount, COALESCE(SUM(amountCents),0) AS totalAmount, "
                + "COALESCE(SUM(MIN(amountCents,MAX(0,"+CONFIRMED+"))),0) AS paidAmount, "
                + "COALESCE(SUM("+REMAINING+"),0) AS pendingAmountCents, "
                + "COALESCE(SUM(CASE WHEN " + overdue + " THEN "+REMAINING+" ELSE 0 END),0) AS overdueAmount, "
                + "COALESCE(SUM(CASE WHEN "+STAGE+"='completed' THEN 1 ELSE 0 END),0) AS paidCount, "
                + "COALESCE(SUM(CASE WHEN " + overdue + " THEN 1 ELSE 0 END),0) AS overdueCount,"
                + "COALESCE(SUM(fs.pendingAmountCents),0) AS processingAmount,COALESCE(SUM(fs.overpaidAmountCents),0) AS overpaidAmountCents,"
                + "COALESCE(SUM("+CONFIRMED+"),0) AS confirmedAmountCents"+FROM+filter.sql();
        List<Object> args = new ArrayList<>();
        args.add(time(criteria.overdueBefore())); args.add(time(criteria.overdueBefore())); args.addAll(filter.args());
        return jdbc.queryForObject(sql, (rs, n) -> new BillSummary(rs.getLong("totalCount"),
                money(rs,"totalAmount"), money(rs,"paidAmount"), money(rs,"pendingAmountCents"),
                money(rs,"overdueAmount"), rs.getLong("paidCount"), rs.getLong("overdueCount"),
                money(rs,"processingAmount"),money(rs,"overpaidAmountCents"),money(rs,"confirmedAmountCents")), args.toArray());
    }

    public List<Bill> findRemindersForUser(long userId, LocalDateTime before, int limit) {
        return jdbc.query("SELECT " + COLUMNS + FROM + " WHERE userId=? AND fs.lifecycle='open' AND "+REMAINING+">0 AND dueAt<? ORDER BY dueAt,bills.id LIMIT ?",
                BILL, userId, time(before), limit);
    }
}
