package org.example.springboot_demo.model;

import java.math.BigDecimal;

public record BillSummary(long totalCount, BigDecimal totalAmount, BigDecimal paidAmount,
                          BigDecimal pendingAmount, BigDecimal overdueAmount, long paidCount, long overdueCount,
                          BigDecimal processingAmount,BigDecimal overpaidAmount,BigDecimal confirmedAmount) {}
