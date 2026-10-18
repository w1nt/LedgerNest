package org.example.springboot_demo.model;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import com.fasterxml.jackson.annotation.JsonFormat;

/** Settlement is independent of the legacy bookkeeping status. Amounts are decimal strings on the wire. */
public final class Settlement {
    private Settlement() {}
    public record Payment(String id, String source, String provider, String reference, String state,
            @JsonFormat(shape=JsonFormat.Shape.STRING) BigDecimal amount,
            @JsonFormat(shape=JsonFormat.Shape.STRING) BigDecimal returnedAmount,
            LocalDateTime scheduledFor, LocalDateTime succeededAt, LocalDateTime createdAt) {}
    public record Refund(String id, String paymentId, String state,@JsonFormat(shape=JsonFormat.Shape.STRING) BigDecimal amount, String reference) {}
    public record Dispute(String id,String paymentId,String state,@JsonFormat(shape=JsonFormat.Shape.STRING) BigDecimal amount,String reference) {}
    public record ReturnRecord(String id,String paymentId,@JsonFormat(shape=JsonFormat.Shape.STRING) BigDecimal amount,String reference) {}
    public record Snapshot(long billId, long version, String stage, String confirmationSource, boolean overdue,
            String amountDue, String confirmedAmount, String pendingAmount, String scheduledAmount,
            String refundedAmount, String returnedAmount, String disputedAmount,String disputeLostAmount, String remainingAmount,
            String overpaidAmount, List<String> flags) {}
    public record Detail(Snapshot settlement, List<Payment> payments, List<Refund> refunds,List<Dispute> disputes,List<ReturnRecord> returns, List<History> history) {}
    public record History(long version, String operation, String reason, LocalDateTime occurredAt) {}
    public record Check(boolean allowed, long version, String maximumAmount, List<String> warnings, List<String> blockers) {}
}
