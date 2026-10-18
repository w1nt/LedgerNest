package org.example.springboot_demo.service;
import java.math.BigDecimal;
/** Adapter must use paymentId as provider idempotency key and verify identity, amount and currency. */
public interface PaymentGateway {
    record Result(String eventId,String state) {}
    boolean available();
    Result charge(String paymentId,BigDecimal amount,String currency);
}
