package org.example.springboot_demo.service;

import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import org.example.springboot_demo.dto.FinancialCommand;
import org.example.springboot_demo.model.Bill;
import org.example.springboot_demo.model.Settlement.*;
import org.example.springboot_demo.repository.BillRepository;
import org.example.springboot_demo.repository.SettlementRepository;
import org.example.springboot_demo.security.AuthSessions;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;

/** Owner/bill lock + optimistic version + durable request key protect every financial mutation. */
@Service
public class SettlementService {
    private final SettlementRepository repo;
    private final BillRepository bills;
    private final ObjectMapper json;
    public SettlementService(SettlementRepository repo,BillRepository bills,ObjectMapper json) { this.repo=repo;this.bills=bills;this.json=json; }
    private static LocalDateTime now() { return LocalDateTime.now(ZoneOffset.UTC); }
    private static ResponseStatusException conflict(String text) { return new ResponseStatusException(HttpStatus.CONFLICT,text); }
    private Bill bill(long userId,long billId) {
        return bills.findByIdForUser(userId,billId).orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND,"账单不存在。"));
    }
    private Bill lock(long userId,long billId) { repo.lockOwner(userId);repo.lockBill(userId,billId);return bill(userId,billId); }
    /** Called only within the bill creation/edit transaction; no legacy status fallback. */
    public void initializeNewBill(long billId,BigDecimal amount) { repo.initialize(billId,amount); }
    public void resizeUnpaidBill(long billId,BigDecimal amount) { repo.updateUnpaidAmount(billId,amount); }
    @Transactional(readOnly=true)
    public Detail detail(long userId,long billId,String timezone) {
        Bill b=bill(userId,billId); ZoneId zone;
        try { if(timezone==null || timezone.length()>64) throw new IllegalArgumentException();zone=ZoneId.of(timezone); }
        catch(Exception ex) { throw Checks.bad("时区不正确。"); }
        var state=repo.state(billId).orElseThrow();
        var payments=repo.payments(billId);var refunds=repo.refunds(billId);var disputes=repo.disputes(billId);
        return new Detail(SettlementPolicy.project(b,state.version(),state.lifecycle(),payments,refunds,disputes,zone),
                payments,refunds,disputes,repo.returns(billId),repo.history(billId));
    }
    @Transactional(readOnly=true)
    public Check check(long userId,long billId,BigDecimal amount) {
        var d=detail(userId,billId,"UTC"); return admission(d,SettlementPolicy.money(amount),null);
    }
    private Check admission(Detail d,BigDecimal amount,String excludedPayment) {
        var s=d.settlement();List<String> blockers=new ArrayList<>(),warnings=new ArrayList<>();
        if(s.stage().equals("voided")) blockers.add("bill_voided");
        if(amount.compareTo(new BigDecimal(s.remainingAmount()))>0) blockers.add("amount_exceeds_remaining");
        if(new BigDecimal(s.remainingAmount()).signum()==0) blockers.add("bill_already_paid");
        if(d.payments().stream().anyMatch(p->!p.id().equals(excludedPayment) && SettlementPolicy.IN_FLIGHT.contains(p.state()))) blockers.add("payment_in_progress");
        if(s.flags().contains("disputed") || s.flags().contains("refund_pending") || s.flags().contains("needs_review")) blockers.add("reconciliation_required");
        if(s.flags().contains("scheduled")) warnings.add("scheduled_payment_exists");
        warnings.add("external_debits_may_not_be_synced");
        return new Check(blockers.isEmpty(),s.version(),s.remainingAmount(),List.copyOf(warnings),List.copyOf(blockers));
    }
    /** Called by legacy CRUD while its transaction is active; financial history must not be erased. */
    public void guardEditable(long userId,long billId) {
        lock(userId,billId);
        if(!repo.payments(billId).isEmpty() || !repo.history(billId).isEmpty())
            throw conflict("账单已有结算记录，请使用结算操作，不能覆盖或删除财务历史。");
    }
    private Payment payment(List<Payment> payments,String id) {
        return payments.stream().filter(p->p.id().equals(id)).findFirst().orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND,"付款记录不存在。"));
    }
    private String reference(String value) { return Checks.text(value,"外部记录编号",128,true); }
    private String key(String key) {
        if(key==null || !key.matches("[A-Za-z0-9_-]{16,128}")) throw Checks.bad("需要有效的 Idempotency-Key。");
        return AuthSessions.fingerprint(key);
    }
    @Transactional(timeout=10)
    public Detail command(long userId,long billId,FinancialCommand c,String requestKey) {
        return execute(userId,billId,c,requestKey,false);
    }
    /** Internal adapter boundary; no HTTP route accepts trusted provider commands. */
    @Transactional(timeout=10)
    public Detail trustedCommand(long userId,long billId,FinancialCommand c,String requestKey) {
        return execute(userId,billId,c,requestKey,true);
    }
    private Detail execute(long userId,long billId,FinancialCommand c,String requestKey,boolean trusted) {
        if(!trusted && requestKey!=null && (requestKey.startsWith("dispatch-") || requestKey.startsWith("gateway-"))) throw Checks.bad("请求键使用了系统保留前缀。");
        Bill b=lock(userId,billId); String key=key(requestKey);
        var canonical=trusted?new FinancialCommand(c.type(),null,c.paymentId(),c.refundId(),c.amount(),c.source(),c.provider(),c.reference(),c.state(),c.scheduledFor(),c.reason(),c.acknowledgeDuplicate(),c.disputeId()):c;
        String hash=AuthSessions.fingerprint(billId+":"+json.writeValueAsString(canonical));
        var previous=repo.operation(userId,key);
        if(previous.isPresent()) {
            if(!previous.get().hash().equals(hash)) throw conflict("同一请求键不能用于不同操作。");
            return json.readValue(previous.get().json(),Detail.class);
        }
        var state=repo.state(billId).orElseThrow();
        if(!trusted && (c.version()==null || c.version()!=state.version())) throw conflict("账单已变化，请刷新后确认，不能使用过时版本。");
        String type=Checks.text(c.type(),"操作",40,true),reason=Checks.text(c.reason(),"操作原因",500,true);
        var payments=repo.payments(billId);var refunds=repo.refunds(billId);
        var disputes=repo.disputes(billId);
        if(state.lifecycle().equals("voided") && !Set.of("reopen","record_payment","set_payment","record_refund","set_refund","record_return","open_dispute","resolve_dispute").contains(type))
            throw conflict("账单已作废。");
        String lifecycle=state.lifecycle();
        switch(type) {
            case "record_payment" -> {
                if(payments.size()>=1000) throw conflict("付款记录达到上限，需要人工归档审查。");
                BigDecimal amount=SettlementPolicy.money(c.amount());
                String source=Checks.text(c.source(),"来源",10,true);
                if(!Set.of("manual","external","app").contains(source)) throw Checks.bad("来源须为 manual、external 或 app。");
                String provider=source.equals("app")?"application":Checks.text(c.provider(),"记录来源系统",64,true);
                if(!source.equals("app") && Set.of("application","legacy").contains(provider)) throw Checks.bad("保留的来源系统名称。");
                String id=UUID.randomUUID().toString(),reference=source.equals("app")?id:reference(c.reference());
                String next=Checks.text(c.state(),"付款状态",20,true);
                if(!Set.of("scheduled","created","requires_action","processing","unknown","succeeded","failed","canceled").contains(next)) throw Checks.bad("付款状态不正确。");
                if(source.equals("app")) {
                    if(!next.equals("created")) throw Checks.bad("应用付款只能从 created 开始。");
                    Check check=admission(detail(userId,billId,"UTC"),amount,null);
                    if(!check.allowed()) throw conflict("重复支付防护阻止付款："+String.join(",",check.blockers()));
                    if(check.warnings().contains("scheduled_payment_exists") && !Boolean.TRUE.equals(c.acknowledgeDuplicate())) throw conflict("已有预约付款；请先核对并明确确认重复支付风险。");
                }
                LocalDateTime scheduled=null;
                if(next.equals("scheduled")) {
                    if(c.scheduledFor()==null || !c.scheduledFor().isAfter(OffsetDateTime.now(ZoneOffset.UTC))
                            || c.scheduledFor().getYear()>9998) throw Checks.bad("预约时间须为有效未来时间。");
                    scheduled=c.scheduledFor().withOffsetSameInstant(ZoneOffset.UTC).toLocalDateTime();
                } else if(c.scheduledFor()!=null) throw Checks.bad("只有 scheduled 可填写预约时间。");
                try { repo.insertPayment(userId,billId,new Payment(id,source,provider,reference,next,amount,BigDecimal.ZERO,
                        scheduled,next.equals("succeeded")?now():null,now())); }
                catch(DuplicateKeyException ex) { throw conflict("该来源记录已导入，不能重复关联或记账。"); }
            }
            case "set_payment" -> {
                Payment p=payment(payments,c.paymentId());
                if(p.source().equals("app") && !trusted) throw conflict("应用付款只能由可信网关结果更新，客户端不能确认扣款。");
                transition(p.state(),c.state());repo.paymentState(billId,p.id(),c.state(),c.state().equals("succeeded")?now():null);
            }
            case "record_refund" -> {
                if(refunds.size()>=1000) throw conflict("退款记录达到上限。");
                Payment p=payment(payments,c.paymentId()); requireSuccess(p);BigDecimal amount=SettlementPolicy.money(c.amount());
                if(!Set.of("pending","succeeded").contains(Objects.toString(c.state(),""))) throw Checks.bad("新退款须为 pending 或 succeeded。");
                BigDecimal reserved=refunds.stream().filter(r->r.paymentId().equals(p.id()) && Set.of("pending","succeeded").contains(r.state()))
                        .map(Refund::amount).reduce(BigDecimal.ZERO,BigDecimal::add);
                BigDecimal lost=disputes.stream().filter(d->d.paymentId().equals(p.id()) && d.state().equals("lost")).map(Dispute::amount).reduce(BigDecimal.ZERO,BigDecimal::add);
                if(reserved.add(amount).add(p.returnedAmount()).add(lost).compareTo(p.amount())>0
                        || disputes.stream().anyMatch(d->d.paymentId().equals(p.id()) && d.state().equals("open"))) throw conflict("退款超过可退金额，或付款仍有争议。");
                if(p.source().equals("app") && !trusted) throw conflict("应用付款退款需要网关适配器，当前不能通过用户报告执行退款。");
                try { repo.insertRefund(userId,billId,p,new Refund(UUID.randomUUID().toString(),p.id(),c.state(),amount,reference(c.reference()))); }
                catch(DuplicateKeyException ex) { throw conflict("退款记录已存在。"); }
            }
            case "set_refund" -> {
                Refund r=refunds.stream().filter(v->v.id().equals(c.refundId())).findFirst().orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND,"退款不存在。"));
                if(!trusted) requireReported(payment(payments,r.paymentId()));
                if(!r.state().equals("pending") || !Set.of("succeeded","failed","canceled").contains(Objects.toString(c.state(),""))) throw conflict("退款状态不能这样转换。");
                repo.refundState(billId,r.id(),c.state());
            }
            case "record_return" -> {
                Payment p=payment(payments,c.paymentId());if(!trusted) requireReported(p);requireSuccess(p);
                if(repo.returns(billId).size()>=1000) throw conflict("退回记录达到上限。");
                BigDecimal amount=SettlementPolicy.money(c.amount());
                if(p.returnedAmount().add(amount).compareTo(p.amount())>0) throw conflict("退回金额超过原付款。");
                try { repo.insertReturn(userId,billId,p,new ReturnRecord(UUID.randomUUID().toString(),p.id(),amount,reference(c.reference()))); }
                catch(DuplicateKeyException ex) { throw conflict("银行退回记录已导入。"); }
                repo.returned(billId,p.id(),amount);
            }
            case "open_dispute" -> {
                Payment p=payment(payments,c.paymentId());if(!trusted) requireReported(p);requireSuccess(p);
                if(disputes.size()>=1000) throw conflict("争议记录达到上限。");
                BigDecimal amount=SettlementPolicy.money(c.amount());
                BigDecimal reserved=disputes.stream().filter(d->d.paymentId().equals(p.id()) && !d.state().equals("won")).map(Dispute::amount).reduce(BigDecimal.ZERO,BigDecimal::add);
                if(reserved.add(amount).compareTo(p.amount())>0) throw conflict("争议金额超过原付款可争议余额。");
                try { repo.insertDispute(userId,billId,p,new Dispute(UUID.randomUUID().toString(),p.id(),"open",amount,reference(c.reference()))); }
                catch(DuplicateKeyException ex) { throw conflict("争议记录已存在。"); }
            }
            case "resolve_dispute" -> {
                Dispute d=disputes.stream().filter(v->v.id().equals(c.disputeId())).findFirst().orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND,"争议记录不存在。"));
                if(!trusted) requireReported(payment(payments,d.paymentId()));
                if(!d.state().equals("open") || !Set.of("won","lost").contains(Objects.toString(c.state(),""))) throw conflict("争议处理结果不正确。");
                repo.disputeState(billId,d.id(),c.state());
            }
            case "adjust_amount" -> {
                if(payments.stream().anyMatch(p->SettlementPolicy.IN_FLIGHT.contains(p.state()))) throw conflict("仍有在途付款，暂不能修改应付金额。");
                repo.amount(userId,billId,SettlementPolicy.money(c.amount()),now());
            }
            case "void" -> {
                if(payments.stream().anyMatch(p->SettlementPolicy.IN_FLIGHT.contains(p.state()) || p.state().equals("scheduled"))
                        || refunds.stream().anyMatch(r->r.state().equals("pending"))) throw conflict("需先处理在途或预约记录，不能假定作废会取消银行扣款。");
                lifecycle="voided";
            }
            case "cancel_app_payment" -> {
                Payment p=payment(payments,c.paymentId());
                if(!p.source().equals("app") || !p.state().equals("created")) throw conflict("只有尚未发送到网关的应用付款可以直接取消。");
                repo.paymentState(billId,p.id(),"canceled",null);
            }
            case "reopen" -> { if(!lifecycle.equals("voided")) throw conflict("只有作废账单可以重新打开。");lifecycle="open"; }
            default -> throw Checks.bad("不支持的结算操作。");
        }
        return finish(userId,billId,state.version()+1,lifecycle,type,reason,key,hash);
    }
    private void requireReported(Payment p) { if(p.source().equals("app")) throw conflict("网关付款的资金变动需要可信网关事件。"); }
    private void requireSuccess(Payment p) { if(!p.state().equals("succeeded")) throw conflict("只能处理已经确认成功的付款。"); }
    private void transition(String from,String to) {
        if(to==null || !Map.of("scheduled",Set.of("created","processing","succeeded","failed","canceled","unknown"),
                "created",Set.of("requires_action","processing","succeeded","failed","canceled","unknown"),
                "requires_action",Set.of("processing","succeeded","failed","canceled","unknown"),
                "processing",Set.of("requires_action","succeeded","failed","unknown"),"unknown",Set.of("requires_action","processing","succeeded","failed","canceled"))
                .getOrDefault(from,Set.of()).contains(to)) throw conflict("付款状态不能这样转换；成功后请记录退款或退回，失败重试请新增付款。");
    }
    private Detail finish(long userId,long billId,long version,String lifecycle,String type,String reason,String key,String hash) {
        Bill b=bill(userId,billId); var projection=SettlementPolicy.project(b,version,lifecycle,repo.payments(billId),repo.refunds(billId),repo.disputes(billId),ZoneOffset.UTC);
        repo.save(billId,version,lifecycle,projection);
        bills.updateCompletionForUser(userId,billId,projection.stage().equals("completed"),now());
        var occurredAt=now();var history=new ArrayList<History>();history.add(new History(version,type,reason,occurredAt));
        history.addAll(repo.history(billId));
        Detail response=new Detail(projection,repo.payments(billId),repo.refunds(billId),repo.disputes(billId),repo.returns(billId),List.copyOf(history.subList(0,Math.min(100,history.size()))));
        repo.audit(userId,key,hash,billId,version,type,reason,occurredAt,json.writeValueAsString(response));
        return response;
    }
    /** Claim commits before network work. A second dispatcher never sends this payment again. */
    @Transactional(timeout=10)
    public Payment claimDispatch(long userId,long billId,String paymentId) {
        lock(userId,billId);var state=repo.state(billId).orElseThrow(()->conflict("付款不存在。"));
        Payment p=payment(repo.payments(billId),paymentId);
        if(!p.source().equals("app")) throw conflict("外部付款不由本应用发送。");
        if(!p.state().equals("created")) return null;
        Check check=admission(detail(userId,billId,"UTC"),p.amount(),p.id());
        if(!check.allowed()) throw conflict("网关发送前复核拒绝付款："+String.join(",",check.blockers()));
        repo.paymentState(billId,p.id(),"processing",null);
        finish(userId,billId,state.version()+1,state.lifecycle(),"dispatch_claim","发送前持久化占位",
                key("dispatch-"+p.id()),AuthSessions.fingerprint(p.id()));
        return p;
    }
}
