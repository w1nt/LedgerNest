package org.example.springboot_demo.model;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** Internal database values: decimal money and UTC local timestamps, independent of JSON. */
public record Bill(long id, BigDecimal amount, String vendorName, String comment,
                   LocalDateTime createdAt, LocalDateTime dueAt, LocalDateTime updatedAt, LocalDateTime paidAt,
                   String settlementStatus,long settlementVersion,BigDecimal confirmedAmount,BigDecimal processingAmount,
                   BigDecimal remainingAmount,BigDecimal overpaidAmount) {}
