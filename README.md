# LedgerNest

A local-first personal finance and analytics tool, with user-provided API credentials.

LedgerNest is a free, open-source project intended to run on your own computer. Its goal is to sync authorized bank transactions using your own Plaid credentials, categorize and analyze data locally, and optionally connect to an AI API of your choice.

## Current Status

**`0.1.0-SNAPSHOT` is a migration baseline extracted from an existing billing application, not a finished Plaid-powered desktop product.** The desktop now runs React in Electron, with a TypeScript local business layer and embedded SQLite. Login, registration, bill listing, creation, overview and charts use validated IPC; they do not require Java, MySQL or a listening HTTP server. The Java backend remains as a migration reference for operations not yet ported. Plaid Link, bank transaction syncing, guided first-run setup, and an AI agent are not implemented. The roadmap below describes planned work, not completed features.

| Feature | Status |
| --- | --- |
| Bill lists, search, filters, creation, overview, and trend charts | Existing prototype |
| Chinese and English interfaces, themes, shared dropdowns, and amount tooltips | Existing prototype |
| Electron main/preload, SQLite and local account sessions | Implemented for the current UI; validated capability-based IPC |
| User-provided Plaid credentials and Link authorization | Not implemented |
| Historical transaction imports, incremental syncing, and reconciliation | Not implemented |
| Embedded local storage | Implemented with SQLite; no database service or database credentials required |
| Guided first-run setup, installers and signed distribution | Not implemented |
| Personalized local rules, budgets, and reminders | Not implemented |
| User-provided AI API and optional analysis assistant | Future extension |

The existing bill and settlement models are inherited prototype features, not a bank transaction model. The payment gateway remains disabled and does not charge accounts. This project does not provide payments, direct debits, payment collection, or fund transfers, and will not extend the payment gateway.

## Product Boundaries

- The project author does not host user accounts, bank credentials, or financial databases. Users run the application and keep their data locally.
- Bank syncing still requires internet access to Plaid and participating banks. Local-first does not mean fully offline.
- Users must obtain their own Plaid developer account, API access, and bank authorization. The project does not bundle, share, or issue API keys.
- The initial integration targets capabilities available through Plaid Trial. Compatibility and limits remain subject to Plaid's rules; this is not a promise of permanently free access.
- Basic syncing and analysis should not require an AI API. Optional third-party AI integrations must disclose what data is sent. Financial calculations remain deterministic and local; API keys must not be passed to the model.
- Investment trading, payment execution, and a publicly hosted service are outside the project scope.

## Initial Roadmap

1. Implement local configuration and secure credential storage to simplify setup and startup.
2. Add Plaid Link authorization and persist accounts and connections to avoid creating duplicate connections.
3. Introduce a separate bank transaction model. Use `/transactions/sync` with persisted cursors to handle pagination, additions, modifications, and removals.
4. Reconcile pending and posted transactions, refunds, transfers, and credit card repayments to avoid double-counting income or expenses.
5. Add transaction search, categories, tags, income and expense summaries, trends, and local data export, backup, and deletion.
6. Once the data workflow is reliable, add local rules and optional AI query and analysis tools.

Historical coverage depends on the bank and authorization. An initial request can ask for up to 730 days, with a default of 90 days; a complete history since account opening is not guaranteed. Future bills, such as utilities not yet charged, must not be represented as existing transactions. Plaid Trial currently limits cumulative Item creation to 10, and deleting an Item does not restore that allowance. Access tokens and sync cursors must be persisted.

Syncing is planned at startup, on demand, and periodically while the application runs, without an author-hosted public webhook. No background work is promised while the application is closed; the next startup catches up. Reading updates already available in Plaid does not mean the bank has refreshed its data immediately.

Official references: [Transactions](https://plaid.com/docs/transactions/) and [Plaid Trial](https://support.plaid.com/hc/en-us/articles/39994173227159-What-is-the-Plaid-Trial-plan).

## Run the Desktop

Requires **Node.js 24.17+** for development. Run from the repository root:

```powershell
npm ci
npm --prefix frontend/my-react-app ci
# Optional: create synthetic local test data before opening the app.
npm run seed:example
npm start
```

`npm start` builds the React UI and Electron main/preload, then opens the desktop application. After a successful build, `npm run start:built` starts it without rebuilding. No Vite server, Spring Boot process, Java runtime, MySQL server or database credentials are needed. Installers and platform signing are a later milestone; these commands run from source.

In source development the database remains `data/ledgernest.sqlite`, preserving the earlier SQLite migration. `LEDGERNEST_DB_PATH` overrides the file; relative paths resolve from the repository root. A packaged application is designed to use Electron's per-user application data directory, but packaging and migration into that directory are not yet implemented. An empty database is initialized automatically; existing unknown schemas and newer schema versions are rejected without resetting them. Fixtures are never inserted automatically.

Test account after explicitly seeding: **`example@example.com` / `example123`**, username `example`. The seeder creates 32 synthetic bills for the current period and prior months. Repeated runs skip existing fixture names; they never reset an existing password. This is a local prototype account, not an OS login or database encryption key. The separate demo entry still uses in-memory examples.

The SQLite file and its `-wal` / `-shm` sidecars contain local data and are ignored by Git. **Storage is not encrypted automatically.** Keep it private and close every application using the database before making a manual file backup, or use SQLite's backup API. Do not put a live database on a network drive or treat file synchronization as database synchronization.

### Legacy Browser Preview

The HTTP adapter remains available for regression work with the retained Java backend. To use it, run `backend/SpringBoot_demo/start-local.ps1` and `npm --prefix frontend/my-react-app run dev`, then visit `http://127.0.0.1:5173`. This path requires JDK 17+ and uses the same local database; close it when testing desktop writes. It is not part of normal desktop startup. Desktop account sessions are held in main-process memory rather than HTTP cookies.

## Development and Validation

- `desktop/`: Electron main/preload, TypeScript business services, SQLite access, isolated fixture tooling and desktop tests.
- `shared/desktop.ts`: typed renderer capability contract.
- `database/schema.sql`: desktop schema v1, compatible with the retained Java schema.
- `frontend/my-react-app/`: React, TypeScript and Vite; existing pages and routes are reused.
- `backend/SpringBoot_demo/`: retained Java reference, including APIs not yet migrated.
- `scripts/`: build, startup, fixture and one-time migration utilities.

```powershell
node scripts/sync-version.mjs --check
npm run build
npm test
npm run test:desktop
npm --prefix frontend/my-react-app run lint
npm --prefix frontend/my-react-app run test:security
npm --prefix frontend/my-react-app run test:i18n
npm --prefix frontend/my-react-app run test:trends
# Optional one-time importer tests (Python 3.10+):
python -m unittest discover -s scripts/tests -v
```

Unit tests and the real Electron integration test use temporary databases and profiles. The Electron test keeps windows hidden and verifies login, totals, six chart bars, creation through the UI, restart persistence, isolated renderer capabilities, rejected foreign IPC callers, and absence of HTTP API requests. To verify an existing example database without modifying it, set `LEDGERNEST_VERIFY_SOURCE=data/ledgernest.sqlite` for `npm run test:desktop`; SQLite's backup API creates an isolated test copy. This fixture-specific check expects the original 32 examples and October 2026 summary.

Desktop requests follow **React → restricted preload bridge → validated main-frame IPC → local business service → SQLite**. The bridge exposes only login, registration, current user, logout, paginated bills and bill creation. Renderer code has no Node integration, SQL, file paths, secrets or arbitrary IPC access. The sandbox, context isolation, restrictive CSP, custom application protocol, navigation checks, parameterized SQL, integer cents, transactional idempotency and bounded password hashing apply to this first desktop workflow. Main-process sessions expire after 30 minutes idle or 8 hours absolute and end when the app closes. Database contents remain accessible to the OS user; these controls do not replace disk encryption.

Profile/password editing, preference APIs, bill editing/deletion and standalone summary/reminder/settlement operations are retained in Java and **not exposed by the desktop bridge yet**. Existing charts calculate from the locally loaded bills. No payment execution or bank-sync capability is provided.

All components share the root `VERSION`; future development belongs to this repository. Its history is independent of the private prototype repository. Existing frontend and backend development logs remain local and are excluded by `.gitignore`. Public updates belong in README files. API credentials, local databases, backups and build artifacts must not be committed.

## SQLite Migration and Test Account

The SQLite schema uses strict tables, foreign keys on every connection, WAL, and IMMEDIATE transactions. Monetary values are stored as **integer USD cents**; API amounts remain decimal strings. UTC timestamps are fixed-width text. This retains the existing bill API and does not implement bank syncing or payments.

The test account and fixtures are created by `npm run seed:example` without starting Java or Electron. No sample database or real account data is shipped in Git.

For an existing legacy MySQL database, the optional one-time importer requires Python 3.10+ (SQLite 3.37+) and the MySQL CLI:

```powershell
# Set MYSQL_PWD in this terminal using your own source database credentials.
python scripts/migrate-mysql-to-sqlite.py --user YOUR_READ_USER --database YOUR_DATABASE --output data/imported.sqlite
```

The importer uses a read-only consistent snapshot, preserves IDs/password hashes/timestamps, converts money without rounding, and verifies every row plus foreign keys and integrity. It refuses to overwrite an existing destination. Stop the application and set `LEDGERNEST_DB_PATH` to the imported file before starting it. Clear `MYSQL_PWD` from the terminal when finished. This importer is optional; MySQL is not a runtime dependency.

## License

[MIT](LICENSE).
