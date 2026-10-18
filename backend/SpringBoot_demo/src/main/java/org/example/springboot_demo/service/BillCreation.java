package org.example.springboot_demo.service;

import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import org.example.springboot_demo.dto.BillResponse;
import org.example.springboot_demo.dto.Requests;
import org.example.springboot_demo.security.AuthSessions;
import org.example.springboot_demo.repository.BillCreationRequestRepository;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class BillCreation {
    private final BillCreationRequestRepository requests;
    private final BillService bills;
    public BillCreation(BillCreationRequestRepository requests, BillService bills) { this.requests = requests; this.bills = bills; }

    private String payloadHash(Requests.BillInput input) {
        if (input.amount() == null || input.dueAt() == null) throw Checks.bad("金额和到期日期不能为空。");
        if (input.amount().scale() < 0 || input.amount().scale() > 2 || input.amount().precision() > 11)
            throw Checks.bad("金额格式不正确，最多保留两位小数。");
        String amount;
        try { amount = input.amount().setScale(2, RoundingMode.UNNECESSARY).toPlainString(); }
        catch (ArithmeticException ex) { throw Checks.bad("金额最多保留两位小数。"); }
        String name = Checks.text(input.vendorName(), "账单名称", 100, true);
        String comment = Checks.text(input.comment(), "备注", 500, false);
        String due = input.dueAt().withOffsetSameInstant(ZoneOffset.UTC).toString();
        // Length-prefix text fields to avoid ambiguous delimiters inside user content.
        return AuthSessions.fingerprint(amount + ":" + name.length() + ":" + name
                + ":" + comment.length() + ":" + comment + ":" + due);
    }

    @Transactional(timeout = 10)
    public BillResponse create(long userId, Requests.BillInput input, String key) {
        if (key == null || !key.matches("[A-Za-z0-9_-]{16,128}"))
            throw Checks.bad("创建账单需要有效的 Idempotency-Key。");
        String keyHash = AuthSessions.fingerprint(key), requestHash = payloadHash(input);
        try {
            // The unique key serializes concurrent retries; DB transaction covers both rows.
            requests.insert(userId, keyHash, requestHash, LocalDateTime.now(ZoneOffset.UTC));
        } catch (DuplicateKeyException duplicate) {
            var existing = requests.findForUpdate(userId, keyHash)
                    .orElseThrow(() -> new IllegalStateException("Conflicting creation request not found"));
            if (!requestHash.equals(existing.requestHash()))
                throw new ResponseStatusException(HttpStatus.CONFLICT, "同一请求键不能用于不同账单内容。");
            if (existing.billId() == null)
                throw new ResponseStatusException(HttpStatus.CONFLICT, "此请求尚未完成，请稍后重试。");
            try { return bills.get(userId, existing.billId()); }
            catch (ResponseStatusException ex) {
                if (ex.getStatusCode().value() != 404) throw ex;
                // Preserve a tombstone: replay must never recreate an intentionally deleted bill.
                throw new ResponseStatusException(HttpStatus.CONFLICT, "该请求创建的账单已删除，不能重复创建。");
            }
        }
        BillResponse bill = bills.create(userId, input);
        requests.attachBill(userId, keyHash, bill.id());
        return bill;
    }
}
