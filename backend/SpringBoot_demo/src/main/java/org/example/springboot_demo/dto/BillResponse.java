package org.example.springboot_demo.dto;
import java.time.OffsetDateTime;
/** Decimal strings preserve cents; timestamps are UTC. */
public record BillResponse(long id, String amount, String vendorName, String comment,
 OffsetDateTime createdAt, OffsetDateTime dueAt,
 OffsetDateTime updatedAt, OffsetDateTime paidAt,String settlementStatus,long settlementVersion,
 String confirmedAmount,String processingAmount,String remainingAmount,String overpaidAmount) {}
