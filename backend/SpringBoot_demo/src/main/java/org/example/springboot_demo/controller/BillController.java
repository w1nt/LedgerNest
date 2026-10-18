package org.example.springboot_demo.controller;
import java.util.List;
import java.util.Map;
import jakarta.servlet.http.HttpServletRequest;
import org.example.springboot_demo.dto.BillResponse;
import org.example.springboot_demo.dto.Requests;
import org.example.springboot_demo.service.BillService;
import org.example.springboot_demo.service.BillCreation;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping({"/bills","/api/bills"})
public class BillController {
 private final BillService bills;
 private final BillCreation creation;
 public BillController(BillService bills,BillCreation creation) { this.bills=bills; this.creation=creation; }
 @GetMapping
 public List<BillResponse> list(HttpServletRequest request,@RequestParam(required=false) String q,
  @RequestParam(required=false) String status,@RequestParam(required=false) String month,@RequestParam(defaultValue="UTC") String timezone) {
  return bills.list(LoginController.userId(request),q,status,month,bills.zone(timezone));
 }
 @GetMapping("/page")
 public Map<String,Object> page(HttpServletRequest request,@RequestParam(required=false) String q,
  @RequestParam(required=false) String status,@RequestParam(required=false) String month,@RequestParam(defaultValue="UTC") String timezone,
  @RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="8") int size) {
  return bills.page(LoginController.userId(request),q,status,month,bills.zone(timezone),page,size);
 }
 @GetMapping("/summary")
 public Map<String,Object> summary(HttpServletRequest request,@RequestParam(required=false) String month,@RequestParam(defaultValue="UTC") String timezone) {
  return bills.summary(LoginController.userId(request),month,bills.zone(timezone));
 }
 @GetMapping("/trend")
 public List<Map<String,Object>> trend(HttpServletRequest request,@RequestParam(required=false) String endMonth,
  @RequestParam(defaultValue="6") int months,@RequestParam(defaultValue="UTC") String timezone) {
  return bills.trend(LoginController.userId(request),endMonth,months,bills.zone(timezone));
 }
 @GetMapping("/reminders")
 public List<BillResponse> reminders(HttpServletRequest request,@RequestParam(defaultValue="7") int days,
  @RequestParam(defaultValue="20") int limit,@RequestParam(defaultValue="UTC") String timezone) {
  return bills.reminders(LoginController.userId(request),days,limit,bills.zone(timezone));
 }
 @GetMapping("/{id}")
 public BillResponse get(@PathVariable long id,HttpServletRequest request) { return bills.get(LoginController.userId(request),id); }
 @PostMapping(consumes="application/json") @ResponseStatus(HttpStatus.CREATED)
 public BillResponse create(@RequestBody Requests.BillInput input,HttpServletRequest request,
  @RequestHeader(value="Idempotency-Key",required=false) String key) {
  return creation.create(LoginController.userId(request),input,key);
 }
 @PutMapping(value="/{id}",consumes="application/json")
 public BillResponse update(@PathVariable long id,@RequestBody Requests.BillInput input,HttpServletRequest request) { return bills.update(LoginController.userId(request),id,input); }
 @DeleteMapping("/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
 public void delete(@PathVariable long id,HttpServletRequest request) { bills.delete(LoginController.userId(request),id); }
}
