-- Additive fresh schema; never drop existing business data.
CREATE TABLE IF NOT EXISTS users (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 username VARCHAR(100) NOT NULL, email VARCHAR(254) NOT NULL,
 password VARCHAR(255) NOT NULL, address VARCHAR(250) NOT NULL DEFAULT '',
 createdAt DATETIME(6) NOT NULL, updatedAt DATETIME(6) NOT NULL,
 CONSTRAINT uk_users_email UNIQUE(email)
);
CREATE TABLE IF NOT EXISTS bills (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, userId BIGINT NOT NULL,
 amount DECIMAL(11,2) NOT NULL, vendorName VARCHAR(100) NOT NULL,
 comment VARCHAR(500) NOT NULL DEFAULT '',
 createdAt DATETIME(6) NOT NULL, updatedAt DATETIME(6) NOT NULL,
 dueAt DATETIME(6) NOT NULL, paidAt DATETIME(6) NULL,
 CONSTRAINT fk_bills_user FOREIGN KEY(userId) REFERENCES users(id),
 CONSTRAINT ck_bills_amount CHECK(amount > 0),
 INDEX idx_bills_user_due(userId,dueAt),
 INDEX idx_bills_user_created(userId,createdAt)
);
CREATE TABLE IF NOT EXISTS user_preferences (
 userId BIGINT NOT NULL PRIMARY KEY, theme VARCHAR(10) NOT NULL DEFAULT 'system',
 updatedAt DATETIME(6) NOT NULL,
 CONSTRAINT fk_preferences_user FOREIGN KEY(userId) REFERENCES users(id),
 CONSTRAINT ck_preferences_theme CHECK(theme IN ('light','dark','system'))
);

-- Persistent per-user idempotency records. Do not delete them when a bill is removed.
CREATE TABLE IF NOT EXISTS bill_creation_requests (
 userId BIGINT NOT NULL,
 keyHash CHAR(64) NOT NULL,
 requestHash CHAR(64) NOT NULL,
 billId BIGINT NULL,
 createdAt DATETIME(6) NOT NULL,
 PRIMARY KEY(userId,keyHash),
 CONSTRAINT fk_creation_user FOREIGN KEY(userId) REFERENCES users(id)
);

-- Every bill is created together with its settlement; stage is the only lifecycle state.
CREATE TABLE IF NOT EXISTS bill_settlements (
 billId BIGINT NOT NULL PRIMARY KEY, version BIGINT NOT NULL DEFAULT 0,
 lifecycle VARCHAR(10) NOT NULL DEFAULT 'open', stage VARCHAR(24) NOT NULL DEFAULT 'unpaid',
 confirmedAmount DECIMAL(15,2) NOT NULL DEFAULT 0,
 pendingAmount DECIMAL(15,2) NOT NULL DEFAULT 0,
 remainingAmount DECIMAL(15,2) NOT NULL DEFAULT 0,
 overpaidAmount DECIMAL(15,2) NOT NULL DEFAULT 0,
 CONSTRAINT fk_settlement_bill FOREIGN KEY(billId) REFERENCES bills(id) ON DELETE CASCADE,
 CONSTRAINT ck_settlement_lifecycle CHECK(lifecycle IN ('open','voided')),
 CONSTRAINT ck_settlement_stage CHECK(stage IN ('unpaid','awaiting_confirmation','completed','voided'))
);
CREATE TABLE IF NOT EXISTS bill_payments (
 id CHAR(36) NOT NULL PRIMARY KEY, billId BIGINT NOT NULL, userId BIGINT NOT NULL,
 source VARCHAR(10) NOT NULL, provider VARCHAR(64) NOT NULL, reference VARCHAR(128) NOT NULL,
 state VARCHAR(20) NOT NULL, amount DECIMAL(11,2) NOT NULL,
 returnedAmount DECIMAL(11,2) NOT NULL DEFAULT 0,
 scheduledFor DATETIME(6) NULL, succeededAt DATETIME(6) NULL, createdAt DATETIME(6) NOT NULL,
 CONSTRAINT fk_payment_bill FOREIGN KEY(billId) REFERENCES bill_settlements(billId) ON DELETE CASCADE,
 CONSTRAINT ck_payment_source CHECK(source IN ('manual','external','app')),
 CONSTRAINT ck_payment_state CHECK(state IN ('scheduled','created','requires_action','processing','unknown','succeeded','failed','canceled')),
 CONSTRAINT ck_payment_amount CHECK(amount > 0 AND returnedAmount >= 0 AND returnedAmount <= amount),
 UNIQUE KEY uk_payment_reference(userId,provider,reference), INDEX idx_payment_bill(billId)
);
CREATE TABLE IF NOT EXISTS bill_refunds (
 id CHAR(36) NOT NULL PRIMARY KEY, billId BIGINT NOT NULL, paymentId CHAR(36) NOT NULL,
 userId BIGINT NOT NULL, provider VARCHAR(64) NOT NULL, reference VARCHAR(128) NOT NULL,
 state VARCHAR(10) NOT NULL, amount DECIMAL(11,2) NOT NULL,
 CONSTRAINT fk_refund_bill FOREIGN KEY(billId) REFERENCES bill_settlements(billId) ON DELETE CASCADE,
 CONSTRAINT fk_refund_payment FOREIGN KEY(paymentId) REFERENCES bill_payments(id) ON DELETE CASCADE,
 CONSTRAINT ck_refund_state CHECK(state IN ('pending','succeeded','failed','canceled')),
 CONSTRAINT ck_refund_amount CHECK(amount > 0),
 UNIQUE KEY uk_refund_reference(userId,provider,reference), INDEX idx_refund_bill(billId)
);
CREATE TABLE IF NOT EXISTS bill_financial_operations (
 userId BIGINT NOT NULL, keyHash CHAR(64) NOT NULL, requestHash CHAR(64) NOT NULL,
 billId BIGINT NOT NULL, version BIGINT NOT NULL, operation VARCHAR(40) NOT NULL,
 reason VARCHAR(500) NOT NULL, occurredAt DATETIME(6) NOT NULL, responseJson MEDIUMTEXT NOT NULL,
 PRIMARY KEY(userId,keyHash), UNIQUE KEY uk_operation_version(billId,version),
 CONSTRAINT fk_operation_bill FOREIGN KEY(billId) REFERENCES bill_settlements(billId) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS bill_disputes (
 id CHAR(36) NOT NULL PRIMARY KEY, billId BIGINT NOT NULL, paymentId CHAR(36) NOT NULL,
 userId BIGINT NOT NULL, provider VARCHAR(64) NOT NULL, reference VARCHAR(128) NOT NULL,
 state VARCHAR(10) NOT NULL, amount DECIMAL(11,2) NOT NULL,
 CONSTRAINT fk_dispute_bill FOREIGN KEY(billId) REFERENCES bill_settlements(billId) ON DELETE CASCADE,
 CONSTRAINT fk_dispute_payment FOREIGN KEY(paymentId) REFERENCES bill_payments(id) ON DELETE CASCADE,
 CONSTRAINT ck_dispute_state CHECK(state IN ('open','won','lost')),
 CONSTRAINT ck_dispute_amount CHECK(amount > 0),
 UNIQUE KEY uk_dispute_reference(userId,provider,reference), INDEX idx_dispute_bill(billId)
);
CREATE TABLE IF NOT EXISTS bill_returns (
 id CHAR(36) NOT NULL PRIMARY KEY, billId BIGINT NOT NULL, paymentId CHAR(36) NOT NULL,
 userId BIGINT NOT NULL, provider VARCHAR(64) NOT NULL, reference VARCHAR(128) NOT NULL,
 amount DECIMAL(11,2) NOT NULL,
 CONSTRAINT fk_return_bill FOREIGN KEY(billId) REFERENCES bill_settlements(billId) ON DELETE CASCADE,
 CONSTRAINT fk_return_payment FOREIGN KEY(paymentId) REFERENCES bill_payments(id) ON DELETE CASCADE,
 CONSTRAINT ck_return_amount CHECK(amount > 0),
 UNIQUE KEY uk_return_reference(userId,provider,reference), INDEX idx_return_bill(billId)
);
