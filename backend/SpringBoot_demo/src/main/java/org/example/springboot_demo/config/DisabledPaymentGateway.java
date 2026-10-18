package org.example.springboot_demo.config;
import java.math.BigDecimal;
import org.example.springboot_demo.service.PaymentGateway;
import org.springframework.stereotype.Component;
/** No provider configured: never simulate success or accept card credentials. */
@Component
public class DisabledPaymentGateway implements PaymentGateway {
    public boolean available() { return false; }
    public Result charge(String paymentId,BigDecimal amount,String currency) { throw new IllegalStateException("Payment provider unavailable"); }
}
