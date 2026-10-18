#!/usr/bin/env python3
"""Read a consistent MySQL snapshot into a NEW SQLite file, without changing MySQL.

Only this one-time migration requires Python and the mysql CLI. Runtime needs neither.
Set MYSQL_PWD in the process environment; never supply a password as a CLI argument.
"""
import argparse
from collections import Counter
from contextlib import closing
from datetime import datetime
from decimal import Decimal
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import uuid

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = ROOT / 'backend/SpringBoot_demo/src/main/resources/schema.sql'
TABLES = ('users', 'bills', 'user_preferences', 'bill_creation_requests', 'bill_settlements',
          'bill_payments', 'bill_refunds', 'bill_financial_operations', 'bill_disputes', 'bill_returns')
TIMESTAMPS = {'createdAt', 'updatedAt', 'dueAt', 'paidAt', 'scheduledFor', 'succeededAt', 'occurredAt'}


def schema_columns(schema):
    with closing(sqlite3.connect(':memory:')) as database:
        database.executescript(schema)
        return {table: [row[1] for row in database.execute(f'PRAGMA table_info({table})')] for table in TABLES}


def convert_value(column, value):
    if column.endswith('Cents'):
        cents = Decimal(str(value)) * 100
        if not cents.is_finite() or cents != cents.to_integral_value() or not -(2 ** 63) <= cents < 2 ** 63:
            raise ValueError(f'Invalid monetary precision or range for {column}')
        return int(cents)
    if column in TIMESTAMPS and value is not None:
        timestamp = datetime.fromisoformat(value)
        if timestamp.tzinfo is not None:
            raise ValueError('Expected UTC timestamps without an offset from MySQL')
        return timestamp.isoformat(timespec='microseconds') + '000'
    return value


def export_mysql(args, columns):
    statements = ["SET time_zone = '+00:00'", 'SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ',
                  'START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY']
    for table in TABLES:
        fields = []
        for column in columns[table]:
            source = column[:-5] if column.endswith('Cents') else column
            expression = f'CAST(`{source}` AS CHAR)' if column.endswith('Cents') or column in TIMESTAMPS else f'`{source}`'
            fields.extend((f"'{column}'", expression))
        statements.append(f"SELECT JSON_OBJECT('table','{table}','row',JSON_OBJECT({','.join(fields)})) FROM `{table}`")
    statements.append('COMMIT')
    result = subprocess.run([args.mysql_command, f'--host={args.host}', f'--port={args.port}',
                             f'--user={args.user}', f'--database={args.database}', '--default-character-set=utf8mb4',
                             '--batch', '--raw', '--skip-column-names'], input=';\n'.join(statements) + ';\n',
                            capture_output=True, text=True, encoding='utf-8', timeout=120)
    if result.returncode:
        raise RuntimeError(f'MySQL read-only export failed (exit {result.returncode}); check connection and SELECT permissions')
    return [json.loads(line) for line in result.stdout.splitlines() if line.strip()]


def migrate_records(records, output, schema):
    output = Path(output).resolve()
    if output.exists():
        raise FileExistsError('Destination already exists; migration never overwrites a database')
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_name('.sqlite-migration-' + uuid.uuid4().hex)
    columns = schema_columns(schema)
    expected = {table: [] for table in TABLES}
    try:
        with closing(sqlite3.connect(temporary)) as database:
            database.execute('PRAGMA foreign_keys=ON')
            database.executescript(schema)
            database.execute('BEGIN IMMEDIATE')
            for record in records:
                table, row = record['table'], record['row']
                if table not in columns or set(row) != set(columns[table]):
                    raise ValueError('Unexpected source table or columns')
                values = tuple(convert_value(column, row[column]) for column in columns[table])
                database.execute(f'INSERT INTO {table} ({",".join(columns[table])}) VALUES ({",".join("?" for _ in values)})', values)
                expected[table].append(values)
            if database.execute('PRAGMA foreign_key_check').fetchall():
                raise ValueError('Foreign-key validation failed')
            for table in TABLES:
                actual = database.execute(f'SELECT {",".join(columns[table])} FROM {table}').fetchall()
                if Counter(actual) != Counter(expected[table]):
                    raise ValueError(f'Row verification failed for {table}')
            if database.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                raise ValueError('SQLite integrity validation failed')
            database.commit()
        # Publish atomically without overwriting an existing file, even in a race.
        os.link(temporary, output)
        return {table: len(expected[table]) for table in TABLES}
    finally:
        if temporary.exists():
            temporary.unlink()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=3306)
    parser.add_argument('--user', required=True)
    parser.add_argument('--database', required=True)
    parser.add_argument('--mysql-command', default='mysql')
    parser.add_argument('--output', type=Path, default=ROOT / 'data/ledgernest.sqlite')
    args = parser.parse_args()
    if not re.fullmatch(r'[A-Za-z0-9_-]+', args.database):
        parser.error('Invalid source database name')
    if args.output.exists():
        parser.error('Destination already exists; choose a new path')
    schema = SCHEMA.read_text(encoding='utf-8-sig')
    records = export_mysql(args, schema_columns(schema))
    counts = migrate_records(records, args.output, schema)
    print(json.dumps({'migrated_rows': counts, 'total': sum(counts.values()), 'verified': True}))


if __name__ == '__main__':
    main()
