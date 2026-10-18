package org.example.springboot_demo.controller;
import jakarta.servlet.http.HttpServletRequest;
import java.math.BigDecimal;
import org.example.springboot_demo.dto.FinancialCommand;
import org.example.springboot_demo.model.Settlement.*;
import org.example.springboot_demo.service.PaymentDispatchService;
import org.example.springboot_demo.service.SettlementService;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping({"/bills/{billId}","/api/bills/{billId}"})
public class SettlementController {
    private final SettlementService settlement;
    private final PaymentDispatchService dispatch;
    public SettlementController(SettlementService settlement,PaymentDispatchService dispatch) { this.settlement=settlement;this.dispatch=dispatch; }
    @GetMapping("/settlement")
    public Detail detail(@PathVariable long billId,@RequestParam(defaultValue="UTC") String timezone,HttpServletRequest request) {
        return settlement.detail(LoginController.userId(request),billId,timezone);
    }
    @GetMapping("/payment-check")
    public Check check(@PathVariable long billId,@RequestParam BigDecimal amount,HttpServletRequest request) {
        return settlement.check(LoginController.userId(request),billId,amount);
    }
    @PostMapping(value="/settlement/operations",consumes="application/json")
    public Detail command(@PathVariable long billId,@RequestBody FinancialCommand input,
            @RequestHeader(value="Idempotency-Key",required=false) String key,HttpServletRequest request) {
        return settlement.command(LoginController.userId(request),billId,input,key);
    }
    @PostMapping("/payments/{paymentId}/dispatch")
    public Detail dispatch(@PathVariable long billId,@PathVariable String paymentId,HttpServletRequest request) {
        return dispatch.dispatch(LoginController.userId(request),billId,paymentId);
    }
}
