package org.example.springboot_demo.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.*;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.example.springboot_demo.dto.BillResponse;
import org.example.springboot_demo.dto.Requests;
import org.example.springboot_demo.model.Bill;
import org.example.springboot_demo.model.BillCriteria;
import org.example.springboot_demo.repository.BillRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class BillService {
    private final BillRepository bills;

    private final SettlementService settlement;
    public BillService(BillRepository bills,SettlementService settlement) { this.bills = bills; this.settlement=settlement; }

    private static OffsetDateTime utc(LocalDateTime value) {
        return value == null ? null : value.atOffset(ZoneOffset.UTC);
    }

    private BillResponse response(Bill bill) {
        return new BillResponse(bill.id(), money(bill.amount()), bill.vendorName(), bill.comment(),
                utc(bill.createdAt()), utc(bill.dueAt()), utc(bill.updatedAt()), utc(bill.paidAt()),bill.settlementStatus(),bill.settlementVersion(),
                money(bill.confirmedAmount()),money(bill.processingAmount()),money(bill.remainingAmount()),money(bill.overpaidAmount()));
    }

    private BigDecimal amount(BigDecimal value) {
        if (value != null && (value.scale() < 0 || value.scale() > 2 || value.precision() > 11))
            throw Checks.bad("金额格式不正确，最多保留两位小数。");
        if (value == null || value.signum() <= 0 || value.compareTo(new BigDecimal("999999999.99")) > 0)
            throw Checks.bad("金额须在 0.01 至 999999999.99 之间。");
        try { return value.setScale(2, RoundingMode.UNNECESSARY); }
        catch (ArithmeticException ex) { throw Checks.bad("金额最多保留两位小数。"); }
    }

    private LocalDateTime due(OffsetDateTime value) {
        if (value == null || value.getYear() < 1000 || value.getYear() > 9998) throw Checks.bad("到期日期不正确。");
        LocalDateTime utc = value.withOffsetSameInstant(ZoneOffset.UTC).toLocalDateTime();
        if (utc.getYear() < 1000 || utc.getYear() > 9998) throw Checks.bad("到期日期不正确。");
        return utc;
    }

    private LocalDateTime now() { return LocalDateTime.now(ZoneOffset.UTC); }

    private void checkId(long id) {
        if (id < 1 || id > 9_007_199_254_740_991L) throw Checks.bad("账单编号不正确。");
    }

    @Transactional
    public BillResponse create(long userId, Requests.BillInput input) {
        BigDecimal amount = amount(input.amount());
        String name = Checks.text(input.vendorName(), "账单名称", 100, true);
        String comment = Checks.text(input.comment(), "备注", 500, false);
        long id = bills.insert(userId, amount, name, comment, due(input.dueAt()), now());
        settlement.initializeNewBill(id,amount);
        return get(userId, id);
    }

    public BillResponse get(long userId, long id) {
        checkId(id);
        return response(bills.findByIdForUser(userId, id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "账单不存在。")));
    }

    @Transactional
    public BillResponse update(long userId, long id, Requests.BillInput input) {
        settlement.guardEditable(userId,id);
        get(userId, id);
        bills.updateForUser(userId, id, amount(input.amount()), Checks.text(input.vendorName(), "账单名称", 100, true),
                Checks.text(input.comment(), "备注", 500, false), due(input.dueAt()), now());
        settlement.resizeUnpaidBill(id,amount(input.amount()));
        return get(userId, id);
    }

    @Transactional
    public void delete(long userId, long id) {
        settlement.guardEditable(userId,id);
        checkId(id);
        if (bills.deleteForUser(userId, id) == 0)
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "账单不存在。");
    }

    private YearMonth month(String value) {
        try {
            YearMonth month = YearMonth.parse(value);
            if (month.getYear() < 1000 || month.getYear() > 9998) throw Checks.bad("月份不正确。");
            return month;
        } catch (java.time.format.DateTimeParseException ex) { throw Checks.bad("月份须为 YYYY-MM。"); }
    }

    public ZoneId zone(String value) {
        if (value != null && value.length() > 64) throw Checks.bad("时区不正确。");
        try { return ZoneId.of(value == null ? "UTC" : value); }
        catch (DateTimeException ex) { throw Checks.bad("时区不正确。"); }
    }

    private BillCriteria criteria(String q, String status, String month, ZoneId zone) {
        String query = Checks.text(q, "搜索关键词", 600, false);
        status = status == null || status.isBlank() ? "all" : status;
        if (!List.of("all","any","unpaid","awaiting_confirmation","completed","voided","outstanding","overdue").contains(status)) throw Checks.bad("筛选状态不正确。");
        LocalDateTime today = LocalDate.now(zone).atStartOfDay(zone).withZoneSameInstant(ZoneOffset.UTC).toLocalDateTime();
        LocalDateTime from = null, until = null;
        if (month != null && !month.isBlank()) {
            YearMonth period = month(month);
            from = period.atDay(1).atStartOfDay(zone).withZoneSameInstant(ZoneOffset.UTC).toLocalDateTime();
            until = period.plusMonths(1).atDay(1).atStartOfDay(zone).withZoneSameInstant(ZoneOffset.UTC).toLocalDateTime();
        }
        return new BillCriteria(query, status, today, from, until);
    }

    public List<BillResponse> list(long userId, String q, String status, String month, ZoneId zone) {
        var rows = bills.findForUser(userId, criteria(q, status, month, zone), 1001);
        if (rows.size() > 1000)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "账单过多，请使用分页接口。");
        return rows.stream().map(this::response).toList();
    }

    public Map<String, Object> page(long userId, String q, String status, String month, ZoneId zone, int page, int size) {
        if (page < 1 || size < 1 || size > 100 || ((long) page - 1) * size > 10000)
            throw Checks.bad("分页范围不正确，size 须在 1 至 100 之间。");
        var criteria = criteria(q, status, month, zone);
        long total = bills.countForUser(userId, criteria);
        var rows = bills.findPageForUser(userId, criteria, size, ((long) page - 1) * size).stream().map(this::response).toList();
        return Map.of("items", rows, "total", total, "page", page, "size", size, "pages", (total + size - 1) / size);
    }

    public Map<String, Object> summary(long userId, String month, ZoneId zone) {
        String period = month == null ? YearMonth.now(zone).toString() : month;
        month(period);
        var summary = bills.summarizeForUser(userId, criteria(null, null, period, zone));
        return Map.ofEntries(Map.entry("month",period),Map.entry("totalAmount",money(summary.totalAmount())),
                Map.entry("paidAmount",money(summary.paidAmount())),Map.entry("pendingAmount",money(summary.pendingAmount())),
                Map.entry("remainingAmount",money(summary.pendingAmount())),Map.entry("overdueAmount",money(summary.overdueAmount())),
                Map.entry("totalCount",summary.totalCount()),Map.entry("paidCount",summary.paidCount()),
                Map.entry("pendingCount",summary.totalCount()-summary.paidCount()),Map.entry("overdueCount",summary.overdueCount()),
                Map.entry("processingAmount",money(summary.processingAmount())),Map.entry("overpaidAmount",money(summary.overpaidAmount())),
                Map.entry("confirmedAmount",money(summary.confirmedAmount())));
    }

    private String money(BigDecimal value) { return value.setScale(2).toPlainString(); }

    public List<Map<String, Object>> trend(long userId, String endMonth, int months, ZoneId zone) {
        if (months < 1 || months > 24) throw Checks.bad("趋势月份数须在 1 至 24 之间。");
        YearMonth end = endMonth == null ? YearMonth.now(zone) : month(endMonth);
        List<Map<String, Object>> result = new ArrayList<>();
        for (int i = months - 1; i >= 0; i--) result.add(summary(userId, end.minusMonths(i).toString(), zone));
        return result;
    }

    public List<BillResponse> reminders(long userId, int days, int limit, ZoneId zone) {
        if (days < 0 || days > 366 || limit < 1 || limit > 100)
            throw Checks.bad("days 须在 0 至 366 之间，limit 须在 1 至 100 之间。");
        LocalDateTime before = LocalDate.now(zone).plusDays(days + 1L).atStartOfDay(zone).withZoneSameInstant(ZoneOffset.UTC).toLocalDateTime();
        return bills.findRemindersForUser(userId, before, limit).stream().map(this::response).toList();
    }
}
