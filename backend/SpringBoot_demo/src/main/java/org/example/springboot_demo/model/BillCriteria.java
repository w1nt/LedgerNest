package org.example.springboot_demo.model;

import java.time.LocalDateTime;

/** Validated criteria; the service resolves calendar/time-zone rules before querying. */
public record BillCriteria(String query, String status, LocalDateTime overdueBefore,
                           LocalDateTime dueFrom, LocalDateTime dueUntil) {}
