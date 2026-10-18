package org.example.springboot_demo;

import java.net.*;
import java.net.http.*;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.*;
import static org.junit.jupiter.api.Assertions.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** Real HTTP/MySQL integration tests; only UUID-prefixed test accounts are cleaned up. */
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT, properties={"app.security.registrations-per-quarter-hour=1000","app.security.logins-per-minute=300"})
class ApiIntegrationTests {
 @Value("${local.server.port}") int port;
 @Autowired JdbcTemplate jdbc;
 @Autowired ObjectMapper json;
 private final List<String> emails=new ArrayList<>();
 private HttpClient client() {
  return HttpClient.newBuilder().cookieHandler(new CookieManager(null,CookiePolicy.ACCEPT_ALL)).build();
 }
 private HttpResponse<String> send(HttpClient client,String method,String path,Object body) throws Exception {
  var builder=HttpRequest.newBuilder(URI.create("http://localhost:"+port+path))
   .header("X-Requested-With","XMLHttpRequest").header("Content-Type","application/json");
  if(method.equals("POST") && (path.equals("/bills") || path.endsWith("/settlement/operations"))) builder.header("Idempotency-Key",UUID.randomUUID().toString());
  builder.method(method,body==null?HttpRequest.BodyPublishers.noBody():HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body)));
  return client.send(builder.build(),HttpResponse.BodyHandlers.ofString());
 }
 private JsonNode data(HttpResponse<String> response,int expected) throws Exception {
  assertEquals(expected,response.statusCode(),response.body()); return json.readTree(response.body());
 }
 private Map<String,Object> registration(String email) {
  return Map.of("username","测试用户","email",email,"password","Test-password-123","confirm","Test-password-123","address","测试地址");
 }
 private String email() { String email="api-test-"+UUID.randomUUID()+"@example.test"; emails.add(email); return email; }
 private HttpClient account() throws Exception {
  HttpClient client=client(); String email=email();
  data(send(client,"POST","/register",registration(email)),201);
  data(send(client,"POST","/login",Map.of("email",email,"password","Test-password-123")),200);
  return client;
 }
 private Map<String,Object> bill(String amount,String name,String date) {
  return Map.of("amount",amount,"vendorName",name,"comment","家庭备注","dueAt",date);
 }
 private JsonNode create(HttpClient client,String amount,String name,String date) throws Exception {
  return data(send(client,"POST","/bills",bill(amount,name,date)),201);
 }
 private void complete(HttpClient client,long id) throws Exception {
  var b=data(send(client,"GET","/bills/"+id,null),200);
  data(send(client,"POST","/bills/"+id+"/settlement/operations",Map.of("type","record_payment","version",b.get("settlementVersion").asLong(),
   "source","manual","provider","test","reference",UUID.randomUUID().toString(),"state","succeeded","amount",b.get("amount").asString(),"reason","fixture payment")),200);
 }
 @AfterEach void cleanup() {
  for(String email:emails) {
   List<Long> ids=jdbc.query("SELECT id FROM users WHERE email=?",(rs,n)->rs.getLong(1),email);
   for(long id:ids) {
    jdbc.update("DELETE FROM bill_creation_requests WHERE userId=?",id);
    jdbc.update("DELETE FROM bills WHERE userId=?",id);
    jdbc.update("DELETE FROM user_preferences WHERE userId=?",id);
    jdbc.update("DELETE FROM users WHERE id=?",id);
   }
  }
 }
 private void assertCookieExpired(HttpResponse<String> response,HttpClient client) {
  String cookie=response.headers().firstValue("set-cookie").orElseThrow();
  assertTrue(cookie.startsWith("JSESSIONID="),cookie);
  assertTrue(cookie.contains("Path=/"),cookie);
  assertTrue(cookie.contains("Max-Age=0"),cookie);
  assertTrue(cookie.contains("Expires="),cookie);
  assertTrue(cookie.contains("HttpOnly"),cookie);
  assertTrue(cookie.toLowerCase(Locale.ROOT).contains("samesite=lax"),cookie);
  assertTrue(((CookieManager)client.cookieHandler().orElseThrow()).getCookieStore().getCookies().stream()
   .noneMatch(value -> value.getName().equals("JSESSIONID") && !value.hasExpired()));
 }
 @Test void authenticationAndCsrf() throws Exception {
  HttpClient client=client();
  assertEquals(401,send(client,"GET","/bills",null).statusCode());
  assertEquals(401,send(client,"GET","/api/me",null).statusCode());
  String email=email();
  JsonNode registered=data(send(client,"POST","/register",registration(email)),201);
  assertFalse(registered.has("password")); assertEquals("测试地址",registered.get("address").asString());
  assertEquals(401,send(client,"POST","/login",Map.of("email",email,"password","wrong")).statusCode());
  JsonNode login=data(send(client,"POST","/login",Map.of("email",email,"password","Test-password-123")),200);
  assertFalse(login.has("password"));
  assertEquals(login.get("id").asLong(),data(send(client,"GET","/me",null),200).get("id").asLong());
  String hash=jdbc.queryForObject("SELECT password FROM users WHERE email=?",String.class,email);
  assertTrue(hash.startsWith("pbkdf2$600000$")); assertFalse(hash.contains("Test-password-123"));
  var unsafe=HttpRequest.newBuilder(URI.create("http://localhost:"+port+"/bills"))
   .header("Content-Type","application/json").POST(HttpRequest.BodyPublishers.ofString("{}")).build();
  assertEquals(403,client.send(unsafe,HttpResponse.BodyHandlers.ofString()).statusCode());
  var foreign=HttpRequest.newBuilder(URI.create("http://localhost:"+port+"/logout"))
   .header("Origin","https://foreign.example").header("X-Requested-With","XMLHttpRequest")
   .POST(HttpRequest.BodyPublishers.noBody()).build();
  assertEquals(403,client.send(foreign,HttpResponse.BodyHandlers.ofString()).statusCode());
  String stale = ((CookieManager)client.cookieHandler().orElseThrow()).getCookieStore().getCookies().stream()
   .filter(cookie -> cookie.getName().equals("JSESSIONID")).findFirst().orElseThrow().getValue();
  var logout=send(client,"POST","/logout",null);
  assertEquals(204,logout.statusCode());
  assertCookieExpired(logout, client);
  var replay=HttpRequest.newBuilder(URI.create("http://localhost:"+port+"/me"))
   .header("Cookie","JSESSIONID="+stale).GET().build();
  assertEquals(401,client().send(replay,HttpResponse.BodyHandlers.ofString()).statusCode());
  var repeated=send(client,"POST","/api/logout",null);
  assertEquals(204,repeated.statusCode());
  assertCookieExpired(repeated,client);
  assertEquals(401,send(client,"GET","/bills",null).statusCode());
 }
 @Test void multiBillCrudAndOwnership() throws Exception {
  HttpClient owner=account(),other=account();
  JsonNode first=create(owner,"12.30","房租","2026-10-20T23:59:00-07:00");
  JsonNode second=create(owner,"0.10","电费","2026-10-21T00:00:00Z");
  long id=first.get("id").asLong(); assertNotEquals(id,second.get("id").asLong());
  assertEquals("12.30",first.get("amount").asString());
  assertEquals("2026-10-21T06:59:00Z",first.get("dueAt").asString());
  assertEquals(2,data(send(owner,"GET","/bills",null),200).size());
  assertEquals(0,data(send(other,"GET","/bills",null),200).size());
  assertEquals(404,send(other,"GET","/bills/"+id,null).statusCode());
  assertEquals(404,send(other,"PUT","/bills/"+id,bill("99.00","攻击","2026-10-22T00:00:00Z")).statusCode());
  assertEquals(404,send(other,"PATCH","/bills/"+id+"/status",Map.of("status","paid")).statusCode());
  assertEquals(404,send(other,"DELETE","/bills/"+id,null).statusCode());
  JsonNode updated=data(send(owner,"PUT","/bills/"+id,bill("15.00","新房租","2026-11-01T00:00:00Z")),200);
  assertEquals("15.00",updated.get("amount").asString());
  assertFalse(updated.has("status"));
  assertEquals(404,send(owner,"PATCH","/bills/"+id+"/status",Map.of("status","paid")).statusCode());
  complete(owner,id);
  JsonNode paid=data(send(owner,"GET","/bills/"+id,null),200);
  assertFalse(paid.get("paidAt").isNull());
  JsonNode again=data(send(owner,"GET","/bills/"+id,null),200);
  assertEquals(paid.get("paidAt"),again.get("paidAt"));
  assertEquals("completed",paid.get("settlementStatus").asString());
  assertEquals(409,send(owner,"DELETE","/bills/"+id,null).statusCode());
  long removable=second.get("id").asLong();
  assertEquals(204,send(owner,"DELETE","/bills/"+removable,null).statusCode());
  assertEquals(404,send(owner,"GET","/bills/"+removable,null).statusCode());
 }
 @Test void validationAndDuplicateEmail() throws Exception {
  HttpClient client=account();
  for(String amount:List.of("0","-1","1.001","1000000000.00"))
   assertEquals(400,send(client,"POST","/bills",bill(amount,"房租","2026-10-20T00:00:00Z")).statusCode());
  assertEquals(400,send(client,"POST","/bills",bill("1.00"," ","2026-10-20T00:00:00Z")).statusCode());
  assertEquals(400,send(client,"POST","/bills",bill("1.00","房租","not-a-date")).statusCode());
  assertEquals(400,send(client,"POST","/bills",Map.of("vendorName","房租")).statusCode());
  assertEquals(400,send(client,"GET","/bills/page?size=101",null).statusCode());
  assertEquals(400,send(client,"GET","/bills?month=2026-99",null).statusCode());
  assertEquals(400,send(client,"GET","/bills?timezone=invalid",null).statusCode());
  assertEquals(400,send(client,"GET","/bills?status=invalid",null).statusCode());
  String email=email();
  data(send(client,"POST","/register",registration(email)),201);
  assertEquals(409,send(client,"POST","/register",registration(email.toUpperCase(Locale.ROOT))).statusCode());
  var input=new HashMap<>(registration(email())); input.put("confirm","not-matching");
  assertEquals(400,send(client,"POST","/register",input).statusCode());
 }
 @Test void filtersPaginationAndStatistics() throws Exception {
  HttpClient client=account();
  create(client,"0.10","Electric 100%","2026-10-05T12:00:00Z");
  JsonNode paid=create(client,"0.20","Rent","2026-10-06T12:00:00Z");
  complete(client,paid.get("id").asLong());
  create(client,"9.00","Next","2026-11-01T00:00:00Z");
  assertEquals(1,data(send(client,"GET","/bills?q=100%25",null),200).size());
  assertEquals(1,data(send(client,"GET","/bills?q=rent&status=completed&month=2026-10",null),200).size());
  assertEquals(400,send(client,"GET","/bills?status=paid",null).statusCode());
  assertEquals(400,send(client,"GET","/bills?status=delayed",null).statusCode());
  JsonNode page=data(send(client,"GET","/bills/page?month=2026-10&size=1&page=2",null),200);
  assertEquals(2,page.get("total").asInt()); assertEquals(1,page.get("items").size());
  assertEquals(2,page.get("pages").asInt());
  JsonNode summary=data(send(client,"GET","/bills/summary?month=2026-10",null),200);
  assertEquals("0.30",summary.get("totalAmount").asString());
  assertEquals("0.20",summary.get("paidAmount").asString());
  assertEquals("0.10",summary.get("pendingAmount").asString());
  assertEquals(2,summary.get("totalCount").asInt());
  JsonNode empty=data(send(client,"GET","/bills/summary?month=2025-01",null),200);
  assertEquals("0.00",empty.get("totalAmount").asString());
  JsonNode trend=data(send(client,"GET","/bills/trend?endMonth=2026-11&months=3",null),200);
  assertEquals(3,trend.size()); assertEquals("2026-09",trend.get(0).get("month").asString());
  assertEquals("9.00",trend.get(2).get("totalAmount").asString());
 }
 @Test void timezoneAndReminders() throws Exception {
  HttpClient client=account();
  create(client,"5.00","Month boundary","2026-11-01T00:30:00Z");
  assertEquals(0,data(send(client,"GET","/bills?month=2026-10&timezone=UTC",null),200).size());
  assertEquals(1,data(send(client,"GET","/bills?month=2026-10&timezone=America%2FLos_Angeles",null),200).size());
  ZoneId zone=ZoneId.of("America/Los_Angeles");
  String yesterday=LocalDate.now(zone).minusDays(1).atTime(23,59).atZone(zone).toOffsetDateTime().toString();
  JsonNode overdue=create(client,"2.00","Overdue",yesterday);
  JsonNode reminder=data(send(client,"GET","/bills/reminders?days=0&timezone=America%2FLos_Angeles",null),200);
  assertTrue(reminder.size()>=1);
  JsonNode delayed=data(send(client,"GET","/bills?status=overdue&timezone=America%2FLos_Angeles",null),200);
  boolean found=false;
  for(JsonNode row:delayed) if(row.get("id").asLong()==overdue.get("id").asLong()) found=true;
  assertTrue(found);
  assertEquals("unpaid",data(send(client,"GET","/bills/"+overdue.get("id").asLong(),null),200).get("settlementStatus").asString());
 }
 @Test void profilePreferencesAndPassword() throws Exception {
  HttpClient client=account();
  JsonNode current=data(send(client,"GET","/api/me",null),200);
  HttpClient otherDevice=client();
  data(send(otherDevice,"POST","/login",Map.of("email",current.get("email").asString(),"password","Test-password-123")),200);
  JsonNode updated=data(send(client,"PATCH","/me",Map.of("username","新名字","address","新地址")),200);
  assertEquals("新地址",updated.get("address").asString());
  assertEquals("system",data(send(client,"GET","/me/preferences",null),200).get("theme").asString());
  assertEquals("dark",data(send(client,"PUT","/me/preferences",Map.of("theme","dark")),200).get("theme").asString());
  assertEquals(400,send(client,"PUT","/me/preferences",Map.of("theme","invalid")).statusCode());
  assertEquals(400,send(client,"PUT","/me/password",Map.of("currentPassword","wrong","password","New-password-123","confirm","New-password-123")).statusCode());
  var changed=send(client,"PUT","/me/password",Map.of("currentPassword","Test-password-123","password","New-password-123","confirm","New-password-123"));
  assertEquals(204,changed.statusCode());
  assertCookieExpired(changed,client);
  var revoked=send(otherDevice,"GET","/me",null);
  assertEquals(401,revoked.statusCode());
  assertCookieExpired(revoked,otherDevice);
  assertEquals(401,send(client,"GET","/me",null).statusCode());
  String email=current.get("email").asString();
  assertEquals(401,send(client,"POST","/login",Map.of("email",email,"password","Test-password-123")).statusCode());
  assertEquals(200,send(client,"POST","/login",Map.of("email",email,"password","New-password-123")).statusCode());
 }

 private HttpRequest raw(String method,String path,String body,String key) {
  var builder=HttpRequest.newBuilder(URI.create("http://localhost:"+port+path))
   .header("Content-Type","application/json").header("X-Requested-With","XMLHttpRequest");
  if(key!=null) builder.header("Idempotency-Key",key);
  return builder.method(method,HttpRequest.BodyPublishers.ofString(body)).build();
 }
 @Test void concurrentCreationIsIdempotentAndScopedToUser() throws Exception {
  HttpClient owner=account(),other=account();
  String key=UUID.randomUUID().toString();
  String payload=json.writeValueAsString(bill("7.25","并发测试","2026-10-20T00:00:00Z"));
  var first=owner.sendAsync(raw("POST","/bills",payload,key),HttpResponse.BodyHandlers.ofString());
  var second=owner.sendAsync(raw("POST","/api/bills",payload,key),HttpResponse.BodyHandlers.ofString());
  long id=data(first.get(),201).get("id").asLong();
  assertEquals(id,data(second.get(),201).get("id").asLong());
  assertEquals(1,data(send(owner,"GET","/bills",null),200).size());
  String changed=json.writeValueAsString(bill("7.26","并发测试","2026-10-20T00:00:00Z"));
  assertEquals(409,owner.send(raw("POST","/bills",changed,key),HttpResponse.BodyHandlers.ofString()).statusCode());
  assertNotEquals(id,data(other.send(raw("POST","/bills",payload,key),HttpResponse.BodyHandlers.ofString()),201).get("id").asLong());
  assertEquals(204,send(owner,"DELETE","/bills/"+id,null).statusCode());
  assertEquals(409,owner.send(raw("POST","/bills",payload,key),HttpResponse.BodyHandlers.ofString()).statusCode());
 }
 @Test void invalidCreationRollsBackIdempotencyRecord() throws Exception {
  HttpClient client=account(); String key=UUID.randomUUID().toString();
  String invalid=json.writeValueAsString(bill("-1.00","测试","2026-10-20T00:00:00Z"));
  assertEquals(400,client.send(raw("POST","/bills",invalid,key),HttpResponse.BodyHandlers.ofString()).statusCode());
  String valid=json.writeValueAsString(bill("1.00","测试","2026-10-20T00:00:00Z"));
  assertEquals(201,client.send(raw("POST","/bills",valid,key),HttpResponse.BodyHandlers.ofString()).statusCode());
  assertEquals(400,client.send(raw("POST","/bills",valid,null),HttpResponse.BodyHandlers.ofString()).statusCode());
 }
 @Test void strictJsonAndUntrustedFieldsAreRejected() throws Exception {
  HttpClient client=account();
  String payload=json.writeValueAsString(bill("1.00","O'Reilly <script>","2026-10-20T00:00:00Z"));
  String key=UUID.randomUUID().toString();
  for(String body:List.of(payload.substring(0,payload.length()-1)+",\"userId\":999}",
   payload.substring(0,payload.length()-1)+",\"status\":\"paid\"}",
   payload.substring(0,payload.length()-1)+",\"amount\":\"2.00\"}",payload+" {}",
   payload.replace("1.00","1e-2147483647"),payload.replace("2026-10-20","2026-02-30"),
   payload.replace("O'Reilly <script>","control\\u0000hidden"))) {
   assertEquals(400,client.send(raw("POST","/bills",body,key),HttpResponse.BodyHandlers.ofString()).statusCode(),body);
  }
  var saved=data(client.send(raw("POST","/bills",payload,key),HttpResponse.BodyHandlers.ofString()),201);
  assertEquals("O'Reilly <script>",saved.get("vendorName").asString());
  assertEquals(0,data(send(client,"GET","/bills?q=%27%20OR%20%271%27%3D%271",null),200).size());
 }
 @Test void requestSizeAndSecurityHeadersAreEnforced() throws Exception {
  HttpClient client=account();
  String body="{\"password\":\""+"x".repeat(17000)+"\"}";
  assertEquals(413,client.send(raw("POST","/login",body,null),HttpResponse.BodyHandlers.ofString()).statusCode());
  var chunked=HttpRequest.newBuilder(URI.create("http://localhost:"+port+"/login"))
   .header("Content-Type","application/json").header("X-Requested-With","XMLHttpRequest")
   .POST(HttpRequest.BodyPublishers.ofInputStream(()->new java.io.ByteArrayInputStream(body.getBytes(java.nio.charset.StandardCharsets.UTF_8)))).build();
  assertEquals(413,client.send(chunked,HttpResponse.BodyHandlers.ofString()).statusCode());
  String deep="{\"email\":"+"[".repeat(25)+"0"+"]".repeat(25)+"}";
  assertEquals(400,client.send(raw("POST","/login",deep,null),HttpResponse.BodyHandlers.ofString()).statusCode());
  assertEquals(414,send(client,"GET","/bills?q="+"a".repeat(2100),null).statusCode());
  assertEquals(400,send(client,"GET","/bills/page?page=999999999",null).statusCode());
  var me=send(client,"GET","/me",null);
  assertEquals(404,send(client,"GET","/missing-route",null).statusCode());
  assertEquals("no-store",me.headers().firstValue("cache-control").orElseThrow());
  assertEquals("DENY",me.headers().firstValue("x-frame-options").orElseThrow());
  assertEquals("nosniff",me.headers().firstValue("x-content-type-options").orElseThrow());
  assertTrue(me.headers().firstValue("content-security-policy").orElseThrow().contains("default-src 'none'"));
  assertTrue(me.headers().firstValue("x-request-id").isPresent());
  var cross=HttpRequest.newBuilder(URI.create("http://localhost:"+port+"/me"))
   .header("Origin","http://localhost:5173").GET().build();
  var unauth=client().send(cross,HttpResponse.BodyHandlers.ofString());
  assertEquals(401,unauth.statusCode());
  assertEquals("http://localhost:5173",unauth.headers().firstValue("access-control-allow-origin").orElseThrow());
 }
 @Test void failedLoginBudgetCannotBeBypassedByChangingIpHeader() throws Exception {
  HttpClient client=account(); String email=data(send(client,"GET","/me",null),200).get("email").asString();
  for(int attempt=0;attempt<5;attempt++) assertEquals(401,send(client,"POST","/login",Map.of("email",email,"password","incorrect")).statusCode());
  var request=HttpRequest.newBuilder(URI.create("http://localhost:"+port+"/login"))
   .header("Content-Type","application/json").header("X-Requested-With","XMLHttpRequest")
   .header("X-Forwarded-For","192.0.2.99")
   .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(Map.of("email",email,"password","Test-password-123")))).build();
  var response=client.send(request,HttpResponse.BodyHandlers.ofString());
  assertEquals(429,response.statusCode());
  assertTrue(Long.parseLong(response.headers().firstValue("retry-after").orElseThrow())>0);
  assertEquals(200,send(client,"GET","/me",null).statusCode());
 }
 @Test void legacyListIsBoundedButStatisticsStayComplete() throws Exception {
  HttpClient client=account(); long id=data(send(client,"GET","/me",null),200).get("id").asLong();
  var now=LocalDateTime.of(2026,10,20,0,0);
  List<Object[]> rows=new ArrayList<>();
  for(int i=0;i<1001;i++) rows.add(new Object[]{id,new java.math.BigDecimal("0.01"),"批量测试","",now,now,now});
  jdbc.batchUpdate("INSERT INTO bills(userId,amount,vendorName,comment,createdAt,updatedAt,dueAt) VALUES(?,?,?,?,?,?,?)",rows);
  jdbc.update("INSERT INTO bill_settlements(billId,remainingAmount) SELECT id,amount FROM bills WHERE userId=?",id);
  assertEquals(409,send(client,"GET","/bills",null).statusCode());
  var page=data(send(client,"GET","/bills/page?size=100",null),200);
  assertEquals(1001,page.get("total").asInt()); assertEquals(100,page.get("items").size());
  assertEquals("10.01",data(send(client,"GET","/bills/summary?month=2026-10",null),200).get("totalAmount").asString());
 }
}
