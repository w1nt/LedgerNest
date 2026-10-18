package org.example.springboot_demo.service;
import java.util.Set;
import org.example.springboot_demo.dto.FinancialCommand;
import org.example.springboot_demo.model.Settlement.Detail;
import org.example.springboot_demo.security.AuthSessions;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
/** Network work is outside transactions. Ambiguous results retain the reservation. */
@Service
public class PaymentDispatchService {
    private final SettlementService settlement;
    private final PaymentGateway gateway;
    public PaymentDispatchService(SettlementService settlement,PaymentGateway gateway) { this.settlement=settlement;this.gateway=gateway; }
    public Detail dispatch(long userId,long billId,String paymentId) {
        settlement.detail(userId,billId,"UTC");
        if(!gateway.available()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"未配置支付网关；当前不会执行扣款。");
        var payment=settlement.claimDispatch(userId,billId,paymentId);
        if(payment==null) return settlement.detail(userId,billId,"UTC");
        PaymentGateway.Result result;
        try {
            result=gateway.charge(payment.id(),payment.amount(),"USD");
            if(result==null || result.eventId()==null || result.eventId().length()>128 || result.state()==null ||
                    !Set.of("succeeded","failed","processing","unknown","requires_action").contains(result.state())) throw new IllegalStateException();
        } catch(RuntimeException ex) { result=new PaymentGateway.Result("unknown-"+payment.id(),"unknown"); }
        var current=settlement.detail(userId,billId,"UTC");
        if(result.state().equals("processing")) return current;
        return settlement.trustedCommand(userId,billId,new FinancialCommand("set_payment",current.settlement().version(),payment.id(),null,
                null,null,null,null,result.state(),null,"网关适配器返回结果",null,null),
                "gateway-"+AuthSessions.fingerprint(payment.id()+":"+result.eventId()));
    }
}
