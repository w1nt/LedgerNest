package org.example.springboot_demo;

import java.math.BigDecimal;
import java.net.*;
import java.net.http.*;
import java.util.*;
import java.util.concurrent.*;
import org.example.springboot_demo.service.PaymentGateway;
import org.example.springboot_demo.repository.SettlementRepository;
import org.junit.jupiter.api.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import org.springframework.beans.factory.annotation.*;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.dao.DataIntegrityViolationException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** Real HTTP + SQLite, with only the unconfigured network adapter replaced by a controlled test double. */
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties={"app.security.registrations-per-quarter-hour=1000","app.security.logins-per-minute=300"})
class SettlementIntegrationTests extends SqliteTestDatabase {
    @Value("${local.server.port}") int port;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper json;
    @MockitoBean PaymentGateway gateway;
    @MockitoSpyBean SettlementRepository settlementRepository;
    private HttpClient client;
    private String email;
    private long billId;
    private HttpResponse<String> send(HttpClient browser,String method,String path,Object body,String key) throws Exception {
        var b=HttpRequest.newBuilder(URI.create("http://localhost:"+port+path)).header("Content-Type","application/json")
                .header("X-Requested-With","XMLHttpRequest");
        if(key!=null) b.header("Idempotency-Key",key);
        return browser.send(b.method(method,body==null?HttpRequest.BodyPublishers.noBody():HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body))).build(),HttpResponse.BodyHandlers.ofString());
    }
    private JsonNode ok(HttpResponse<String> response,int status) throws Exception {
        assertEquals(status,response.statusCode(),response.body());return json.readTree(response.body());
    }
    private String root() { return "/bills/"+billId; }
    private JsonNode detail() throws Exception { return ok(send(client,"GET",root()+"/settlement",null,null),200); }
    private JsonNode snapshot() throws Exception { return detail().get("settlement"); }
    private Map<String,Object> input(String type) throws Exception {
        var c=new LinkedHashMap<String,Object>();c.put("type",type);c.put("version",snapshot().get("version").asLong());c.put("reason","settlement integration test");return c;
    }
    private JsonNode operation(Map<String,Object> c) throws Exception { return ok(send(client,"POST",root()+"/settlement/operations",c,UUID.randomUUID().toString()),200); }
    private JsonNode record(String source,String state,String amount) throws Exception {
        var c=input("record_payment");c.put("source",source);c.put("provider","test-bank");c.put("reference",UUID.randomUUID().toString());
        c.put("state",state);c.put("amount",amount);return operation(c);
    }
    private String paymentId(JsonNode result,int index) { return result.get("payments").get(index).get("id").asString(); }
    private JsonNode state(String payment,String state) throws Exception {
        var c=input("set_payment");c.put("paymentId",payment);c.put("state",state);return operation(c);
    }
    private boolean flag(JsonNode s,String flag) { for(var v:s.get("flags")) if(v.asString().equals(flag)) return true;return false; }
    private long createBill() throws Exception {
        return ok(send(client,"POST","/bills",Map.of("amount","100.00","vendorName","settlement test","comment","","dueAt","2026-01-01T00:00:00Z"),UUID.randomUUID().toString()),201).get("id").asLong();
    }
    @BeforeEach void setup() throws Exception {
        reset(gateway);when(gateway.available()).thenReturn(false);
        client=HttpClient.newBuilder().cookieHandler(new CookieManager(null,CookiePolicy.ACCEPT_ALL)).build();
        email="settlement-test-"+UUID.randomUUID()+"@example.test";
        ok(send(client,"POST","/register",Map.of("username","settlement-test","email",email,"password","Settlement-test-2026!","confirm","Settlement-test-2026!","address",""),null),201);
        ok(send(client,"POST","/login",Map.of("email",email,"password","Settlement-test-2026!"),null),200);
        billId=createBill();
    }
    @AfterEach void cleanup() {
        if(email==null) return;
        for(long id:jdbc.query("SELECT id FROM users WHERE email=?",(rs,n)->rs.getLong(1),email)) {
            jdbc.update("DELETE FROM bill_creation_requests WHERE userId=?",id);
            jdbc.update("DELETE FROM bills WHERE userId=?",id);
            jdbc.update("DELETE FROM user_preferences WHERE userId=?",id);jdbc.update("DELETE FROM users WHERE id=?",id);
        }
    }
    @Test void partialPaymentsAndUnknownConfirmationDriveAmountsAndSummary() throws Exception {
        var first=record("external","unknown","40.00");String p=paymentId(first,0);
        assertEquals("awaiting_confirmation",first.get("settlement").get("stage").asString());
        assertTrue(flag(first.get("settlement"),"payment_result_unknown"));
        state(p,"succeeded");assertEquals("60.00",snapshot().get("remainingAmount").asString());
        assertTrue(flag(snapshot(),"partially_paid"));
        var summary=ok(send(client,"GET","/bills/summary?month=2026-01",null,null),200);
        assertEquals("40.00",summary.get("paidAmount").asString());assertEquals("60.00",summary.get("pendingAmount").asString());
        assertEquals("60.00",summary.get("overdueAmount").asString());
        record("manual","succeeded","60.00");assertEquals("completed",snapshot().get("stage").asString());
        assertEquals("user_report",snapshot().get("confirmationSource").asString());
    }
    @Test void failedAttemptIsRetainedAndRetryIsANewPayment() throws Exception {
        String id=paymentId(record("manual","processing","100.00"),0);state(id,"failed");
        assertTrue(flag(snapshot(),"payment_failed"));
        var c=input("set_payment");c.put("paymentId",id);c.put("state","succeeded");
        assertEquals(409,send(client,"POST",root()+"/settlement/operations",c,UUID.randomUUID().toString()).statusCode());
        record("manual","succeeded","100.00");assertEquals(2,detail().get("payments").size());
        assertEquals("completed",snapshot().get("stage").asString());
    }
    @Test void durableIdempotencyAndVersionAndReferenceDeduplication() throws Exception {
        var c=input("record_payment");c.putAll(Map.of("source","external","provider","test-bank","reference","tx-unique","state","succeeded","amount","30.00"));
        String key=UUID.randomUUID().toString();var first=send(client,"POST",root()+"/settlement/operations",c,key);
        ok(first,200);assertEquals(first.body(),send(client,"POST",root()+"/settlement/operations",c,key).body());
        c.put("amount","31.00");assertEquals(409,send(client,"POST",root()+"/settlement/operations",c,key).statusCode());
        assertEquals(409,send(client,"POST",root()+"/settlement/operations",c,UUID.randomUUID().toString()).statusCode());
        c.put("version",snapshot().get("version").asLong());
        assertEquals(409,send(client,"POST",root()+"/settlement/operations",c,UUID.randomUUID().toString()).statusCode());
        assertEquals(1,detail().get("payments").size());assertEquals(1,detail().get("history").size());
    }
    @Test void concurrentAppAdmissionAndDispatchCallGatewayOnlyOnce() throws Exception {
        var c=input("record_payment");c.putAll(Map.of("source","app","state","created","amount","100.00"));
        var a=CompletableFuture.supplyAsync(()->{try{return send(client,"POST",root()+"/settlement/operations",c,UUID.randomUUID().toString());}catch(Exception e){throw new RuntimeException(e);}});
        var b=send(client,"POST",root()+"/settlement/operations",c,UUID.randomUUID().toString());
        var statuses=new ArrayList<>(List.of(a.get().statusCode(),b.statusCode()));Collections.sort(statuses);assertEquals(List.of(200,409),statuses);
        String id=paymentId(detail(),0);when(gateway.available()).thenReturn(true);
        when(gateway.charge(eq(id),eq(new BigDecimal("100.00")),eq("USD"))).thenReturn(new PaymentGateway.Result("test-event","succeeded"));
        String path=root()+"/payments/"+id+"/dispatch";
        var dispatchA=CompletableFuture.supplyAsync(()->{try{return send(client,"POST",path,null,null);}catch(Exception e){throw new RuntimeException(e);}});
        assertEquals(200,send(client,"POST",path,null,null).statusCode());assertEquals(200,dispatchA.get().statusCode());
        verify(gateway,times(1)).charge(eq(id),any(),eq("USD"));
        assertEquals("completed",snapshot().get("stage").asString());assertEquals("gateway",snapshot().get("confirmationSource").asString());
    }
    @Test void timeoutRetainsReservationAndClientCannotForgeGatewaySuccess() throws Exception {
        String id=paymentId(record("app","created","100.00"),0);when(gateway.available()).thenReturn(true);
        when(gateway.charge(anyString(),any(),anyString())).thenThrow(new IllegalStateException("network uncertain"));
        assertEquals(200,send(client,"POST",root()+"/payments/"+id+"/dispatch",null,null).statusCode());
        assertTrue(flag(snapshot(),"payment_result_unknown"));
        assertEquals(200,send(client,"POST",root()+"/payments/"+id+"/dispatch",null,null).statusCode());
        verify(gateway,times(1)).charge(anyString(),any(),anyString());
        var c=input("set_payment");c.putAll(Map.of("paymentId",id,"state","succeeded"));
        assertEquals(409,send(client,"POST",root()+"/settlement/operations",c,UUID.randomUUID().toString()).statusCode());
        assertFalse(ok(send(client,"GET",root()+"/payment-check?amount=100.00",null,null),200).get("allowed").asBoolean());
    }
    @Test void externalAutomaticDebitIsRecordedEvenIfItOverpaysAndRefundsAreSeparate() throws Exception {
        String id=paymentId(record("external","succeeded","100.00"),0);record("external","succeeded","100.00");
        assertEquals("100.00",snapshot().get("overpaidAmount").asString());
        var c=input("record_refund");c.putAll(Map.of("paymentId",id,"amount","50.00","state","pending","reference",UUID.randomUUID().toString()));
        var r=operation(c);String refundId=r.get("refunds").get(0).get("id").asString();
        assertEquals("100.00",snapshot().get("overpaidAmount").asString());assertTrue(flag(snapshot(),"refund_pending"));
        c=input("set_refund");c.putAll(Map.of("refundId",refundId,"state","succeeded"));operation(c);
        assertEquals("50.00",snapshot().get("overpaidAmount").asString());
        assertEquals(2,detail().get("payments").size());assertEquals("succeeded",detail().get("payments").get(0).get("state").asString());
    }
    @Test void failedRefundReleasesCapacityAndOversizedRefundIsRejected() throws Exception {
        String p=paymentId(record("manual","succeeded","100.00"),0);
        var c=input("record_refund");c.putAll(Map.of("paymentId",p,"amount","80.00","state","pending","reference","refund-a"));
        String r=operation(c).get("refunds").get(0).get("id").asString();
        c=input("record_refund");c.putAll(Map.of("paymentId",p,"amount","30.00","state","succeeded","reference","refund-b"));
        assertEquals(409,send(client,"POST",root()+"/settlement/operations",c,UUID.randomUUID().toString()).statusCode());
        c=input("set_refund");c.putAll(Map.of("refundId",r,"state","failed"));operation(c);
        c=input("record_refund");c.putAll(Map.of("paymentId",p,"amount","100.00","state","succeeded","reference","refund-c"));operation(c);
        assertEquals("100.00",snapshot().get("remainingAmount").asString());assertTrue(flag(snapshot(),"refunded"));
    }
    @Test void disputesAndReturnsDoNotEraseSuccessfulHistory() throws Exception {
        String p=paymentId(record("external","succeeded","100.00"),0);
        var c=input("open_dispute");c.putAll(Map.of("paymentId",p,"amount","30.00","reference","dispute-first"));
        String disputeId=operation(c).get("disputes").get(0).get("id").asString();
        assertTrue(flag(snapshot(),"disputed"));assertFalse(ok(send(client,"GET",root()+"/payment-check?amount=1.00",null,null),200).get("allowed").asBoolean());
        c=input("resolve_dispute");c.putAll(Map.of("disputeId",disputeId,"state","lost"));operation(c);
        assertEquals("30.00",snapshot().get("remainingAmount").asString());
        c=input("record_return");c.putAll(Map.of("paymentId",p,"amount","20.00","reference","bank-return-a"));operation(c);
        assertEquals("50.00",snapshot().get("remainingAmount").asString());
        assertEquals("succeeded",detail().get("payments").get(0).get("state").asString());
    }
    @Test void voidingExcludesStatisticsButDoesNotBlockExternalFactsAndCanReopen() throws Exception {
        operation(input("void"));assertEquals("voided",snapshot().get("stage").asString());
        assertEquals(0,ok(send(client,"GET","/bills/page",null,null),200).get("total").asLong());
        assertEquals(1,ok(send(client,"GET","/bills/page?status=voided",null,null),200).get("total").asLong());
        record("external","succeeded","100.00");assertEquals("100.00",snapshot().get("overpaidAmount").asString());
        operation(input("reopen"));assertEquals("completed",snapshot().get("stage").asString());
        assertEquals(409,send(client,"DELETE",root(),null,null).statusCode());
        assertEquals(404,send(client,"PATCH",root()+"/status",Map.of("status","unpaid"),null).statusCode());
    }
    @Test void adjustmentsPreserveHistoryAndCannotRaceInFlightMoney() throws Exception {
        record("manual","succeeded","40.00");var c=input("adjust_amount");c.put("amount","60.00");operation(c);
        assertEquals("20.00",snapshot().get("remainingAmount").asString());
        record("manual","processing","20.00");c=input("adjust_amount");c.put("amount","50.00");
        assertEquals(409,send(client,"POST",root()+"/settlement/operations",c,UUID.randomUUID().toString()).statusCode());
    }
    @Test void schedulesWarnButDoNotClaimMoneyAndRequireExplicitAcknowledgment() throws Exception {
        var c=input("record_payment");c.putAll(Map.of("source","external","provider","bank","reference","autopay-schedule","state","scheduled","amount","100.00","scheduledFor","2090-01-01T00:00:00Z"));
        operation(c);assertEquals("unpaid",snapshot().get("stage").asString());assertEquals("100.00",snapshot().get("scheduledAmount").asString());
        c=input("record_payment");c.putAll(Map.of("source","app","state","created","amount","100.00"));
        assertEquals(409,send(client,"POST",root()+"/settlement/operations",c,UUID.randomUUID().toString()).statusCode());
        c.put("acknowledgeDuplicate",true);operation(c);assertEquals("awaiting_confirmation",snapshot().get("stage").asString());
        assertEquals(0L,detail().get("payments").valueStream().filter(v->v.get("state").asString().equals("succeeded")).count());
    }
    @Test void manualPaymentSourceIsPreservedAndGatewayIsDisabled() throws Exception {
        record("manual","succeeded","100.00");
        var d=detail();assertEquals("user_report",d.get("settlement").get("confirmationSource").asString());
        String p=paymentId(d,0);var c=input("record_refund");c.putAll(Map.of("paymentId",p,"amount","10.00","state","succeeded","reference","legacy-refund"));operation(c);
        assertEquals("90.00",snapshot().get("confirmedAmount").asString());
        billId=createBill();p=paymentId(record("app","created","100.00"),0);
        assertEquals(503,send(client,"POST",root()+"/payments/"+p+"/dispatch",null,null).statusCode());
        verify(gateway,never()).charge(anyString(),any(),anyString());
    }
    @Test void ownershipAndInvalidInputsFailWithoutWritingFinancialHistory() throws Exception {
        var anonymous=HttpClient.newHttpClient();assertEquals(401,send(anonymous,"GET",root()+"/settlement",null,null).statusCode());
        assertEquals(404,send(client,"GET","/bills/9223372036854775807/settlement",null,null).statusCode());
        var c=input("record_payment");c.putAll(Map.of("source","manual","provider","bank","reference","invalid","state","succeeded","amount","1e9999999"));
        assertEquals(400,send(client,"POST",root()+"/settlement/operations",c,UUID.randomUUID().toString()).statusCode());
        assertEquals(0,detail().get("history").size());assertEquals(0,detail().get("payments").size());
    }
    @Test void auditFailureRollsBackPaymentProjectionAndIdempotencyTogether() throws Exception {
        var c=input("record_payment");c.putAll(Map.of("source","manual","provider","bank","reference","atomic","state","succeeded","amount","100.00"));
        String key=UUID.randomUUID().toString();
        doThrow(new DataIntegrityViolationException("forced audit failure")).when(settlementRepository).audit(anyLong(),anyString(),anyString(),anyLong(),anyLong(),anyString(),anyString(),any(),anyString());
        try { assertEquals(503,send(client,"POST",root()+"/settlement/operations",c,key).statusCode()); }
        finally { doCallRealMethod().when(settlementRepository).audit(anyLong(),anyString(),anyString(),anyLong(),anyLong(),anyString(),anyString(),any(),anyString()); }
        assertEquals(0,detail().get("payments").size());assertEquals(0,snapshot().get("version").asLong());
        assertEquals("unpaid",ok(send(client,"GET",root(),null,null),200).get("settlementStatus").asString());
        ok(send(client,"POST",root()+"/settlement/operations",c,key),200);
        assertEquals("completed",snapshot().get("stage").asString());
    }
    @Test void authenticatedOwnershipAndCrossBillExternalReferenceCannotBeBypassed() throws Exception {
        record("external","succeeded","100.00");
        String reference=detail().get("payments").get(0).get("reference").asString();
        long originalBill=billId;billId=createBill();
        var c=input("record_payment");c.putAll(Map.of("source","external","provider","test-bank","reference",reference,"state","succeeded","amount","100.00"));
        assertEquals(409,send(client,"POST",root()+"/settlement/operations",c,UUID.randomUUID().toString()).statusCode());
        long userId=jdbc.queryForObject("SELECT id FROM users WHERE email=?",Long.class,email);
        // A nonexistent owner never reveals or mutates another user's bill, even through the direct service boundary.
        var service=new org.example.springboot_demo.service.SettlementService(settlementRepository,
                new org.example.springboot_demo.repository.BillRepository(jdbc),json);
        var missing=assertThrows(org.springframework.web.server.ResponseStatusException.class,()->service.detail(userId+999999,originalBill,"UTC"));
        assertEquals(404,missing.getStatusCode().value());
    }
    @Test void overlappingExternalRefundAndReturnNeedsReviewRatherThanHidingNegativeNet() throws Exception {
        String p=paymentId(record("external","succeeded","100.00"),0);
        var c=input("record_refund");c.putAll(Map.of("paymentId",p,"amount","80.00","state","succeeded","reference","returned-and-refunded"));operation(c);
        c=input("record_return");c.putAll(Map.of("paymentId",p,"amount","100.00","reference","bank-return-overlap"));operation(c);
        assertEquals("-80.00",snapshot().get("confirmedAmount").asString());
        assertEquals("100.00",snapshot().get("remainingAmount").asString());assertTrue(flag(snapshot(),"needs_review"));
        assertFalse(ok(send(client,"GET",root()+"/payment-check?amount=100.00",null,null),200).get("allowed").asBoolean());
    }
    @Test void returnsAndMultiplePartialDisputesHaveIndependentDeduplication() throws Exception {
        String p=paymentId(record("external","succeeded","100.00"),0);
        var c=input("open_dispute");c.putAll(Map.of("paymentId",p,"amount","10.00","reference","dispute-a"));
        String d=operation(c).get("disputes").get(0).get("id").asString();
        c=input("resolve_dispute");c.putAll(Map.of("disputeId",d,"state","won"));operation(c);
        c=input("open_dispute");c.putAll(Map.of("paymentId",p,"amount","20.00","reference","dispute-b"));operation(c);
        assertEquals(2,detail().get("disputes").size());
        c=input("record_return");c.putAll(Map.of("paymentId",p,"amount","10.00","reference","return-unique"));operation(c);
        c.put("version",snapshot().get("version").asLong());
        assertEquals(409,send(client,"POST",root()+"/settlement/operations",c,UUID.randomUUID().toString()).statusCode());
        assertEquals(1,detail().get("returns").size());assertEquals("10.00",snapshot().get("returnedAmount").asString());
    }
    @Test void legacyStatusIsAbsentAndBasicEditsInvalidateStaleFinancialCommands() throws Exception {
        assertEquals(0L,jdbc.queryForObject("SELECT COUNT(*) FROM pragma_table_info('bills') WHERE name='status'",Long.class));
        var b=ok(send(client,"GET",root(),null,null),200);assertFalse(b.has("status"));
        assertEquals("unpaid",b.get("settlementStatus").asString());assertEquals("100.00",b.get("remainingAmount").asString());
        var stale=input("record_payment");stale.putAll(Map.of("source","app","amount","100.00","state","created"));
        ok(send(client,"PUT",root(),Map.of("amount","90.00","vendorName","edited","comment","","dueAt","2026-01-01T00:00:00Z"),null),200);
        assertEquals("90.00",snapshot().get("remainingAmount").asString());
        assertEquals(409,send(client,"POST",root()+"/settlement/operations",stale,UUID.randomUUID().toString()).statusCode());
    }
}
