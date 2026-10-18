-- Run by init-local-db.ps1 only when bills.status still exists, with the backend stopped.
-- DML is repeatable: only bills lacking a settlement are imported. Existing financial facts stay intact.
START TRANSACTION;
CREATE TEMPORARY TABLE legacy_bill_status_import AS
 SELECT b.id,b.userId,b.amount,b.status,b.paidAt,b.createdAt
 FROM bills b LEFT JOIN bill_settlements s ON s.billId=b.id WHERE s.billId IS NULL;
INSERT INTO bill_settlements(billId,version,lifecycle,stage,confirmedAmount,pendingAmount,remainingAmount,overpaidAmount)
 SELECT id,0,'open',CASE WHEN status='paid' THEN 'completed' ELSE 'unpaid' END,
 CASE WHEN status='paid' THEN amount ELSE 0 END,0,CASE WHEN status='paid' THEN 0 ELSE amount END,0
 FROM legacy_bill_status_import;
INSERT INTO bill_payments(id,billId,userId,source,provider,reference,state,amount,returnedAmount,scheduledFor,succeededAt,createdAt)
 SELECT UUID(),id,userId,'manual','status-migration',CONCAT('imported-bill-',id),'succeeded',amount,0,NULL,
 COALESCE(paidAt,createdAt),createdAt FROM legacy_bill_status_import WHERE status='paid';
COMMIT;
DROP TEMPORARY TABLE legacy_bill_status_import;
-- Column/check/index removal follows in the administrator script after validating all bills have a settlement.
