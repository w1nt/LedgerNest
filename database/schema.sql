-- SQLite schema v1. Monetary columns store integer USD cents; timestamps are UTC text.
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 username TEXT NOT NULL, email TEXT COLLATE NOCASE NOT NULL,
 password TEXT NOT NULL, address TEXT NOT NULL DEFAULT '',
 createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL,
 CONSTRAINT uk_users_email UNIQUE(email)
) STRICT;
CREATE TABLE IF NOT EXISTS bills (
 id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER NOT NULL,
 amountCents INTEGER NOT NULL, vendorName TEXT NOT NULL,
 comment TEXT NOT NULL DEFAULT '',
 createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL,
 dueAt TEXT NOT NULL, paidAt TEXT NULL,
 CONSTRAINT fk_bills_user FOREIGN KEY(userId) REFERENCES users(id),
 CONSTRAINT ck_bills_amount CHECK(amountCents > 0)
) STRICT;
CREATE TABLE IF NOT EXISTS user_preferences (
 userId INTEGER NOT NULL PRIMARY KEY, theme TEXT NOT NULL DEFAULT 'system',
 updatedAt TEXT NOT NULL,
 CONSTRAINT fk_preferences_user FOREIGN KEY(userId) REFERENCES users(id),
 CONSTRAINT ck_preferences_theme CHECK(theme IN ('light','dark','system'))
) STRICT;

-- Persistent per-user idempotency records. Do not delete them when a bill is removed.
CREATE TABLE IF NOT EXISTS bill_creation_requests (
 userId INTEGER NOT NULL,
 keyHash TEXT NOT NULL,
 requestHash TEXT NOT NULL,
 billId INTEGER NULL,
 createdAt TEXT NOT NULL,
 PRIMARY KEY(userId,keyHash),
 CONSTRAINT fk_creation_user FOREIGN KEY(userId) REFERENCES users(id)
) STRICT;

-- Every bill is created together with its settlement; stage is the only lifecycle state.
CREATE TABLE IF NOT EXISTS bill_settlements (
 billId INTEGER NOT NULL PRIMARY KEY, version INTEGER NOT NULL DEFAULT 0,
 lifecycle TEXT NOT NULL DEFAULT 'open', stage TEXT NOT NULL DEFAULT 'unpaid',
 confirmedAmountCents INTEGER NOT NULL DEFAULT 0,
 pendingAmountCents INTEGER NOT NULL DEFAULT 0,
 remainingAmountCents INTEGER NOT NULL DEFAULT 0,
 overpaidAmountCents INTEGER NOT NULL DEFAULT 0,
 CONSTRAINT fk_settlement_bill FOREIGN KEY(billId) REFERENCES bills(id) ON DELETE CASCADE,
 CONSTRAINT ck_settlement_lifecycle CHECK(lifecycle IN ('open','voided')),
 CONSTRAINT ck_settlement_stage CHECK(stage IN ('unpaid','awaiting_confirmation','completed','voided'))
) STRICT;
CREATE TABLE IF NOT EXISTS bill_payments (
 id TEXT NOT NULL PRIMARY KEY, billId INTEGER NOT NULL, userId INTEGER NOT NULL,
 source TEXT NOT NULL, provider TEXT NOT NULL, reference TEXT NOT NULL,
 state TEXT NOT NULL, amountCents INTEGER NOT NULL,
 returnedAmountCents INTEGER NOT NULL DEFAULT 0,
 scheduledFor TEXT NULL, succeededAt TEXT NULL, createdAt TEXT NOT NULL,
 CONSTRAINT fk_payment_bill FOREIGN KEY(billId) REFERENCES bill_settlements(billId) ON DELETE CASCADE,
 CONSTRAINT ck_payment_source CHECK(source IN ('manual','external','app')),
 CONSTRAINT ck_payment_state CHECK(state IN ('scheduled','created','requires_action','processing','unknown','succeeded','failed','canceled')),
 CONSTRAINT ck_payment_amount CHECK(amountCents > 0 AND returnedAmountCents >= 0 AND returnedAmountCents <= amountCents),
 CONSTRAINT uk_payment_reference UNIQUE(userId,provider,reference)
) STRICT;
CREATE TABLE IF NOT EXISTS bill_refunds (
 id TEXT NOT NULL PRIMARY KEY, billId INTEGER NOT NULL, paymentId TEXT NOT NULL,
 userId INTEGER NOT NULL, provider TEXT NOT NULL, reference TEXT NOT NULL,
 state TEXT NOT NULL, amountCents INTEGER NOT NULL,
 CONSTRAINT fk_refund_bill FOREIGN KEY(billId) REFERENCES bill_settlements(billId) ON DELETE CASCADE,
 CONSTRAINT fk_refund_payment FOREIGN KEY(paymentId) REFERENCES bill_payments(id) ON DELETE CASCADE,
 CONSTRAINT ck_refund_state CHECK(state IN ('pending','succeeded','failed','canceled')),
 CONSTRAINT ck_refund_amount CHECK(amountCents > 0),
 CONSTRAINT uk_refund_reference UNIQUE(userId,provider,reference)
) STRICT;
CREATE TABLE IF NOT EXISTS bill_financial_operations (
 userId INTEGER NOT NULL, keyHash TEXT NOT NULL, requestHash TEXT NOT NULL,
 billId INTEGER NOT NULL, version INTEGER NOT NULL, operation TEXT NOT NULL,
 reason TEXT NOT NULL, occurredAt TEXT NOT NULL, responseJson TEXT NOT NULL,
 PRIMARY KEY(userId,keyHash), CONSTRAINT uk_operation_version UNIQUE(billId,version),
 CONSTRAINT fk_operation_bill FOREIGN KEY(billId) REFERENCES bill_settlements(billId) ON DELETE CASCADE
) STRICT;
CREATE TABLE IF NOT EXISTS bill_disputes (
 id TEXT NOT NULL PRIMARY KEY, billId INTEGER NOT NULL, paymentId TEXT NOT NULL,
 userId INTEGER NOT NULL, provider TEXT NOT NULL, reference TEXT NOT NULL,
 state TEXT NOT NULL, amountCents INTEGER NOT NULL,
 CONSTRAINT fk_dispute_bill FOREIGN KEY(billId) REFERENCES bill_settlements(billId) ON DELETE CASCADE,
 CONSTRAINT fk_dispute_payment FOREIGN KEY(paymentId) REFERENCES bill_payments(id) ON DELETE CASCADE,
 CONSTRAINT ck_dispute_state CHECK(state IN ('open','won','lost')),
 CONSTRAINT ck_dispute_amount CHECK(amountCents > 0),
 CONSTRAINT uk_dispute_reference UNIQUE(userId,provider,reference)
) STRICT;
CREATE TABLE IF NOT EXISTS bill_returns (
 id TEXT NOT NULL PRIMARY KEY, billId INTEGER NOT NULL, paymentId TEXT NOT NULL,
 userId INTEGER NOT NULL, provider TEXT NOT NULL, reference TEXT NOT NULL,
 amountCents INTEGER NOT NULL,
 CONSTRAINT fk_return_bill FOREIGN KEY(billId) REFERENCES bill_settlements(billId) ON DELETE CASCADE,
 CONSTRAINT fk_return_payment FOREIGN KEY(paymentId) REFERENCES bill_payments(id) ON DELETE CASCADE,
 CONSTRAINT ck_return_amount CHECK(amountCents > 0),
 CONSTRAINT uk_return_reference UNIQUE(userId,provider,reference)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_bills_user_due ON bills(userId,dueAt);
CREATE INDEX IF NOT EXISTS idx_bills_user_created ON bills(userId,createdAt);
CREATE INDEX IF NOT EXISTS idx_payment_bill ON bill_payments(billId);
CREATE INDEX IF NOT EXISTS idx_refund_bill ON bill_refunds(billId);
CREATE INDEX IF NOT EXISTS idx_dispute_bill ON bill_disputes(billId);
CREATE INDEX IF NOT EXISTS idx_return_bill ON bill_returns(billId);
PRAGMA user_version = 1;
