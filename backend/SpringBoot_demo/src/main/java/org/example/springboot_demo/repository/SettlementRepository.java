package org.example.springboot_demo.repository;

import static org.example.springboot_demo.repository.DatabaseValues.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.example.springboot_demo.model.Settlement.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** All mutations participate in the caller's transaction. IMMEDIATE transactions serialize writers before version checks. */
@Repository
public class SettlementRepository {
    private final JdbcTemplate jdbc;
    public SettlementRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    public void lockOwner(long userId) { jdbc.queryForList("SELECT id FROM users WHERE id=?", userId); }
    public void lockBill(long userId, long billId) { jdbc.queryForList("SELECT id FROM bills WHERE userId=? AND id=?", userId, billId); }
    public record State(long version, String lifecycle) {}
    public Optional<State> state(long billId) {
        return jdbc.query("SELECT version,lifecycle FROM bill_settlements WHERE billId=?",
                (rs,n)->new State(rs.getLong(1),rs.getString(2)),billId).stream().findFirst();
    }
    public void initialize(long billId,BigDecimal amount) { jdbc.update("INSERT INTO bill_settlements(billId,remainingAmountCents) VALUES(?,?)",billId,cents(amount)); }
    public void updateUnpaidAmount(long billId,BigDecimal amount) { jdbc.update("UPDATE bill_settlements SET remainingAmountCents=?,version=version+1 WHERE billId=?",cents(amount),billId); }
    public record Operation(String hash, String json) {}
    public Optional<Operation> operation(long userId,String keyHash) {
        return jdbc.query("SELECT requestHash,responseJson FROM bill_financial_operations WHERE userId=? AND keyHash=?",
                (rs,n)->new Operation(rs.getString(1),rs.getString(2)),userId,keyHash).stream().findFirst();
    }
    public void audit(long userId,String key,String hash,long billId,long version,String type,String reason,LocalDateTime now,String json) {
        jdbc.update("INSERT INTO bill_financial_operations(userId,keyHash,requestHash,billId,version,operation,reason,occurredAt,responseJson) VALUES(?,?,?,?,?,?,?,?,?)",
                userId,key,hash,billId,version,type,reason,time(now),json);
    }
    public List<History> history(long billId) {
        return jdbc.query("SELECT version,operation,reason,occurredAt FROM bill_financial_operations WHERE billId=? ORDER BY version DESC LIMIT 100",
                (rs,n)->new History(rs.getLong(1),rs.getString(2),rs.getString(3),time(rs.getString(4))),billId);
    }
    public List<Payment> payments(long billId) {
        return jdbc.query("SELECT * FROM bill_payments WHERE billId=? ORDER BY createdAt,id",(rs,n)->new Payment(
                rs.getString("id"),rs.getString("source"),rs.getString("provider"),rs.getString("reference"),rs.getString("state"),
                money(rs,"amountCents"),money(rs,"returnedAmountCents"),
                time(rs.getString("scheduledFor")),time(rs.getString("succeededAt")),time(rs.getString("createdAt"))),billId);
    }
    public List<Refund> refunds(long billId) {
        return jdbc.query("SELECT id,paymentId,state,amountCents,reference FROM bill_refunds WHERE billId=? ORDER BY id",
                (rs,n)->new Refund(rs.getString(1),rs.getString(2),rs.getString(3),money(rs,4),rs.getString(5)),billId);
    }
    public void insertPayment(long userId,long billId,Payment p) {
        jdbc.update("INSERT INTO bill_payments(id,billId,userId,source,provider,reference,state,amountCents,scheduledFor,succeededAt,createdAt) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                p.id(),billId,userId,p.source(),p.provider(),p.reference(),p.state(),cents(p.amount()),time(p.scheduledFor()),time(p.succeededAt()),time(p.createdAt()));
    }
    public void paymentState(long billId,String id,String state,LocalDateTime succeededAt) {
        jdbc.update("UPDATE bill_payments SET state=?,succeededAt=COALESCE(succeededAt,?) WHERE billId=? AND id=?",state,time(succeededAt),billId,id);
    }
    public void returned(long billId,String id,BigDecimal amount) {
        jdbc.update("UPDATE bill_payments SET returnedAmountCents=returnedAmountCents+? WHERE billId=? AND id=?",cents(amount),billId,id);
    }
    public List<ReturnRecord> returns(long billId) {
        return jdbc.query("SELECT id,paymentId,amountCents,reference FROM bill_returns WHERE billId=? ORDER BY id",
                (rs,n)->new ReturnRecord(rs.getString(1),rs.getString(2),money(rs,3),rs.getString(4)),billId);
    }
    public void insertReturn(long userId,long billId,Payment p,ReturnRecord r) {
        jdbc.update("INSERT INTO bill_returns(id,billId,paymentId,userId,provider,reference,amountCents) VALUES(?,?,?,?,?,?,?)",
                r.id(),billId,p.id(),userId,p.provider(),r.reference(),cents(r.amount()));
    }
    public List<Dispute> disputes(long billId) {
        return jdbc.query("SELECT id,paymentId,state,amountCents,reference FROM bill_disputes WHERE billId=? ORDER BY id",
                (rs,n)->new Dispute(rs.getString(1),rs.getString(2),rs.getString(3),money(rs,4),rs.getString(5)),billId);
    }
    public void insertDispute(long userId,long billId,Payment p,Dispute d) {
        jdbc.update("INSERT INTO bill_disputes(id,billId,paymentId,userId,provider,reference,state,amountCents) VALUES(?,?,?,?,?,?,?,?)",
                d.id(),billId,p.id(),userId,p.provider(),d.reference(),d.state(),cents(d.amount()));
    }
    public void disputeState(long billId,String id,String state) {
        jdbc.update("UPDATE bill_disputes SET state=? WHERE billId=? AND id=?",state,billId,id);
    }
    public void insertRefund(long userId,long billId,Payment p,Refund r) {
        jdbc.update("INSERT INTO bill_refunds(id,billId,paymentId,userId,provider,reference,state,amountCents) VALUES(?,?,?,?,?,?,?,?)",
                r.id(),billId,p.id(),userId,p.provider(),r.reference(),r.state(),cents(r.amount()));
    }
    public void refundState(long billId,String id,String state) {
        jdbc.update("UPDATE bill_refunds SET state=? WHERE billId=? AND id=?",state,billId,id);
    }
    public void save(long billId,long version,String lifecycle,Snapshot s) {
        jdbc.update("UPDATE bill_settlements SET version=?,lifecycle=?,stage=?,confirmedAmountCents=?,pendingAmountCents=?,remainingAmountCents=?,overpaidAmountCents=? WHERE billId=?",
                version,lifecycle,s.stage(),cents(new BigDecimal(s.confirmedAmount())),cents(new BigDecimal(s.pendingAmount())),cents(new BigDecimal(s.remainingAmount())),cents(new BigDecimal(s.overpaidAmount())),billId);
    }
    public void amount(long userId,long billId,BigDecimal amount,LocalDateTime now) {
        jdbc.update("UPDATE bills SET amountCents=?,updatedAt=? WHERE userId=? AND id=?",cents(amount),time(now),userId,billId);
    }
}
