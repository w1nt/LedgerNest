package org.example.springboot_demo.model;

/** Nullable billId represents an uncompleted idempotency record inside its owning transaction. */
public record BillCreationRequest(String requestHash, Long billId) {}
