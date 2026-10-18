import importlib.util
from contextlib import closing
from pathlib import Path
import sqlite3
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'migrate-mysql-to-sqlite.py'
spec = importlib.util.spec_from_file_location('migration', SCRIPT)
migration = importlib.util.module_from_spec(spec)
spec.loader.exec_module(migration)


class MigrationTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.output = Path(self.folder.name) / 'account.sqlite'
        self.schema = migration.SCHEMA.read_text(encoding='utf-8-sig')
        self.timestamp = '2026-10-17 23:59:59.123456'

    def records(self):
        return [
            {'table': 'users', 'row': {'id': 7, 'username': 'example', 'email': 'example@example.com',
              'password': 'unchanged-password-hash', 'address': '', 'createdAt': self.timestamp, 'updatedAt': self.timestamp}},
            {'table': 'bills', 'row': {'id': 42, 'userId': 7, 'amountCents': '0.10', 'vendorName': '\u6d4b\u8bd5',
              'comment': 'literal % _ and emoji \U0001f331', 'createdAt': self.timestamp, 'updatedAt': self.timestamp,
              'dueAt': self.timestamp, 'paidAt': None}},
            {'table': 'bill_settlements', 'row': {'billId': 42, 'version': 3, 'lifecycle': 'open', 'stage': 'unpaid',
              'confirmedAmountCents': '0.00', 'pendingAmountCents': '0.00', 'remainingAmountCents': '0.10', 'overpaidAmountCents': '0.00'}}
        ]

    def test_preserves_ids_hashes_text_and_exact_cents(self):
        counts = migration.migrate_records(self.records(), self.output, self.schema)
        self.assertEqual(1, counts['bills'])
        with closing(sqlite3.connect(self.output)) as database:
            self.assertEqual((7, 'unchanged-password-hash'), database.execute('SELECT id,password FROM users').fetchone())
            self.assertEqual((42, 10, 'integer', '2026-10-17T23:59:59.123456000', None), database.execute(
                'SELECT id,amountCents,typeof(amountCents),dueAt,paidAt FROM bills').fetchone())
            self.assertEqual('\u6d4b\u8bd5', database.execute('SELECT vendorName FROM bills').fetchone()[0])
            self.assertEqual([], database.execute('PRAGMA foreign_key_check').fetchall())
            self.assertEqual(1, database.execute('PRAGMA user_version').fetchone()[0])

    def test_existing_destination_is_never_overwritten(self):
        self.output.write_bytes(b'existing-user-data')
        with self.assertRaises(FileExistsError):
            migration.migrate_records(self.records(), self.output, self.schema)
        self.assertEqual(b'existing-user-data', self.output.read_bytes())

    def test_late_foreign_key_error_publishes_no_partial_database(self):
        records = self.records()
        records[1]['row']['userId'] = 999
        with self.assertRaises(sqlite3.IntegrityError):
            migration.migrate_records(records, self.output, self.schema)
        self.assertFalse(self.output.exists())
        self.assertEqual([], list(Path(self.folder.name).iterdir()))

    def test_non_cent_amount_and_overflow_abort_without_rounding(self):
        for value in ('0.001', '92233720368547758.08', 'NaN'):
            with self.subTest(value=value), self.assertRaises(ValueError):
                migration.convert_value('amountCents', value)


if __name__ == '__main__':
    unittest.main()
