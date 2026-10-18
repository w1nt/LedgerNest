package org.example.springboot_demo.service;

import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import org.example.springboot_demo.model.Bill;
import org.example.springboot_demo.model.Settlement.*;

/** Pure projection: debt, payment progress, refund/return and reconciliation remain separate facts. */
public final class SettlementPolicy {
    private SettlementPolicy() {}
    public static final Set<String> IN_FLIGHT = Set.of("created","requires_action","processing","unknown");
    public static BigDecimal money(BigDecimal value) {
        if(value==null || value.scale()<0 || value.scale()>2 || value.precision()>11
                || value.signum()<=0 || value.compareTo(new BigDecimal("999999999.99"))>0) throw Checks.bad("金额须为正数且最多两位小数。");
        return value.setScale(2);
    }
    public static String decimal(BigDecimal value) { return value.setScale(2).toPlainString(); }
    public static Snapshot project(Bill bill,long version,String lifecycle,List<Payment> payments,List<Refund> refunds,List<Dispute> disputes,ZoneId zone) {
        BigDecimal received=BigDecimal.ZERO,pending=BigDecimal.ZERO,scheduled=BigDecimal.ZERO,
                returned=BigDecimal.ZERO,disputed=BigDecimal.ZERO,lost=BigDecimal.ZERO,refunded=BigDecimal.ZERO;
        Set<String> sources=new TreeSet<>(); List<String> flags=new ArrayList<>();
        for(Payment p:payments) {
            if(p.state().equals("succeeded")) { received=received.add(p.amount()); sources.add(p.source().equals("app")?"gateway":"user_report"); }
            if(IN_FLIGHT.contains(p.state())) pending=pending.add(p.amount());
            if(p.state().equals("scheduled")) scheduled=scheduled.add(p.amount());
            returned=returned.add(p.returnedAmount());
            if(p.state().equals("unknown")) add(flags,"payment_result_unknown");
            if(p.state().equals("requires_action")) add(flags,"requires_action");
            if(p.state().equals("scheduled")) add(flags,"scheduled");
            if(p.state().equals("scheduled") && p.scheduledFor()!=null && p.scheduledFor().isBefore(LocalDateTime.now(ZoneOffset.UTC))) add(flags,"schedule_due_unconfirmed");
            if(IN_FLIGHT.contains(p.state()) && p.createdAt().isBefore(LocalDateTime.now(ZoneOffset.UTC).minusHours(24))) add(flags,"confirmation_stale");
        }
        for(Refund r:refunds) {
            if(r.state().equals("succeeded")) refunded=refunded.add(r.amount());
            if(r.state().equals("pending")) add(flags,"refund_pending");
            if(r.state().equals("failed")) add(flags,"refund_failed");
        }
        for(Dispute d:disputes) {
            if(d.state().equals("open")) disputed=disputed.add(d.amount());
            if(d.state().equals("lost")) lost=lost.add(d.amount());
        }
        BigDecimal net=received.subtract(refunded).subtract(returned).subtract(lost);
        BigDecimal obligation=lifecycle.equals("voided")?BigDecimal.ZERO:bill.amount();
        // Negative net is an exception, not permission to invent a larger customer debt.
        BigDecimal remaining=obligation.subtract(net.max(BigDecimal.ZERO)).max(BigDecimal.ZERO),overpaid=net.subtract(obligation).max(BigDecimal.ZERO);
        if(refunded.signum()>0) add(flags,refunded.compareTo(received)>=0?"refunded":"partially_refunded");
        if(returned.signum()>0) add(flags,"payment_returned");
        if(disputed.signum()>0) add(flags,"disputed");
        if(lost.signum()>0) add(flags,"dispute_lost");
        if(net.signum()<0) add(flags,"needs_review");
        if(lifecycle.equals("voided") && (net.signum()!=0 || pending.signum()>0)) add(flags,"needs_review");
        if(overpaid.signum()>0) add(flags,"overpaid");
        if(pending.compareTo(remaining)>0) add(flags,"possible_duplicate_payment");
        if(net.signum()>0 && remaining.signum()>0) add(flags,"partially_paid");
        if(remaining.signum()>0 && !payments.isEmpty() && payments.get(payments.size()-1).state().equals("failed")) add(flags,"payment_failed");
        boolean overdue=lifecycle.equals("open") && remaining.signum()>0 && bill.dueAt().isBefore(
                LocalDate.now(zone).atStartOfDay(zone).withZoneSameInstant(ZoneOffset.UTC).toLocalDateTime());
        if(overdue) add(flags,"overdue");
        String stage=lifecycle.equals("voided")?"voided":pending.signum()>0?"awaiting_confirmation":remaining.signum()==0?"completed":"unpaid";
        String source=sources.isEmpty()?"none":sources.size()==1?sources.iterator().next():"mixed";
        return new Snapshot(bill.id(),version,stage,source,overdue,decimal(bill.amount()),decimal(net),decimal(pending),decimal(scheduled),
                decimal(refunded),decimal(returned),decimal(disputed),decimal(lost),decimal(remaining),decimal(overpaid),List.copyOf(flags));
    }
    private static void add(List<String> flags,String flag) { if(!flags.contains(flag)) flags.add(flag); }
}
