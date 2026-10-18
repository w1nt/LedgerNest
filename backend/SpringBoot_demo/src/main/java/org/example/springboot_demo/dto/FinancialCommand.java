package org.example.springboot_demo.dto;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

/** Client commands are user reports, never trusted provider confirmations. */
public record FinancialCommand(String type, Long version, String paymentId, String refundId,
        BigDecimal amount, String source, String provider, String reference, String state,
        OffsetDateTime scheduledFor, String reason, Boolean acknowledgeDuplicate,String disputeId) {}
