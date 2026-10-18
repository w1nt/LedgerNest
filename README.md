# LedgerNest

A local-first personal finance and analytics tool, with user-provided API credentials.

LedgerNest is a free, open-source project intended to run on your own computer. Its goal is to sync authorized bank transactions using your own Plaid credentials, categorize and analyze data locally, and optionally connect to an AI API of your choice.

## Current Status

**`0.1.0-SNAPSHOT` is a migration baseline extracted from an existing billing application, not a finished Plaid-powered desktop product.** The current code runs as a local React + Spring Boot + SQLite prototype. Embedded SQLite storage is implemented. Plaid Link, bank transaction syncing, guided first-run setup, and an AI agent are not implemented. The roadmap below describes planned work, not completed features.

| Feature | Status |
| --- | --- |
| Bill lists, search, filters, creation, overview, and trend charts | Existing prototype |
| Chinese and English interfaces, themes, shared dropdowns, and amount tooltips | Existing prototype |
| Local backend, SQLite, account sessions, and basic security controls | Existing prototype; needs adaptation to a local-tool workflow |
| User-provided Plaid credentials and Link authorization | Not implemented |
| Historical transaction imports, incremental syncing, and reconciliation | Not implemented |
| Embedded local storage | Implemented with SQLite; no database service or database credentials required |
| Guided first-run setup and application packaging | Not implemented |
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

## Run the Current Prototype

The current baseline requires Node.js 22.18+ and JDK 17+. SQLite is embedded in the backend; no MySQL installation, database account, or Python runtime is required for normal use.

### Backend

Run these PowerShell commands from the repository root:

```powershell
./backend/SpringBoot_demo/test-local.ps1
./backend/SpringBoot_demo/start-local.ps1
```

On first startup, the backend creates `data/ledgernest.sqlite` and its schema automatically. `DB_URL`, `DB_USERNAME`, and `DB_PASSWORD` are no longer used. To choose another file, set `LEDGERNEST_DB_PATH` before starting; relative paths in the startup script resolve from the repository root.

If Windows execution policy blocks a script, use `powershell.exe -NoProfile -ExecutionPolicy Bypass -File <script-path>`. The backend listens only on `127.0.0.1:8080` by default. On other systems, build with `./mvnw package` in the backend directory, then run the JAR **from the repository root** so the default data path remains consistent:

```sh
java -jar backend/SpringBoot_demo/target/SpringBoot_demo-0.1.0-SNAPSHOT.jar
```

The SQLite file and its `-wal` / `-shm` sidecars contain local data and are ignored by Git. The database is not encrypted automatically. Keep it private and stop the application before making a manual file backup, or use SQLite's backup API. Do not place an actively shared database on a network drive or use file synchronization as multi-device database synchronization.

### Frontend

Open a separate terminal:

```powershell
cd frontend/my-react-app
npm ci
npm run dev
```

Visit `http://127.0.0.1:5173`. The development server proxies `/api` requests to the local backend. You can register a local prototype account; the demo entry uses built-in synthetic data. To create API test data after starting the backend, run `node backend/SpringBoot_demo/seed-example.mjs` from the repository root. It creates synthetic examples only and does not connect to a bank. This remains the prototype account workflow; the new local first-run experience is not implemented.

## Development and Validation

The directory structure is retained from the prototype to support incremental migration:

- `frontend/my-react-app/`: React, TypeScript, and Vite.
- `backend/SpringBoot_demo/`: Spring Boot, JDBC, and SQLite.
- `scripts/sync-version.mjs`: synchronizes the root `VERSION` with frontend and backend metadata.

```powershell
node scripts/sync-version.mjs --check
npm --prefix frontend/my-react-app run build
npm --prefix frontend/my-react-app run lint
npm --prefix frontend/my-react-app run test:security
npm --prefix frontend/my-react-app run test:i18n
npm --prefix frontend/my-react-app run test:trends
# Tests use fresh temporary SQLite files, never your local application database:
./backend/SpringBoot_demo/test-local.ps1
# Optional migration-tool tests (Python 3.10+):
python -m unittest discover -s scripts/tests -v
```

Frontend and backend development remain separate, but share this repository and the root `VERSION`. Future development is committed to this project only. Its Git history is independent and does not include commits from the private prototype repository.

Existing frontend and backend development logs remain local and are excluded by `.gitignore`. Public updates belong in the corresponding README files. API credentials, local databases, backups, and build artifacts must not be committed.

## SQLite Migration and Test Account

The SQLite schema uses strict tables, foreign keys on every connection, WAL, and IMMEDIATE transactions. Monetary values are stored as **integer USD cents**; API amounts remain decimal strings. UTC timestamps are fixed-width text. This retains the existing bill API and does not implement bank syncing or payments.

To create synthetic data in a fresh database after starting the backend:

```powershell
node backend/SpringBoot_demo/seed-example.mjs
```

Test email: `example@example.com`; username: `example`; password: `example123`. The seeder creates 32 synthetic bills and adds only missing fixtures; it never resets an existing password. No sample database or real account data is shipped in Git.

For an existing legacy MySQL database, the optional one-time importer requires Python 3.10+ (SQLite 3.37+) and the MySQL CLI:

```powershell
# Set MYSQL_PWD in this terminal using your own source database credentials.
python scripts/migrate-mysql-to-sqlite.py --user YOUR_READ_USER --database YOUR_DATABASE --output data/imported.sqlite
```

The importer uses a read-only consistent snapshot, preserves IDs/password hashes/timestamps, converts money without rounding, and verifies every row plus foreign keys and integrity. It refuses to overwrite an existing destination. Stop the application and set `LEDGERNEST_DB_PATH` to the imported file before starting it. Clear `MYSQL_PWD` from the terminal when finished. This importer is optional; MySQL is not a runtime dependency.

## License

[MIT](LICENSE).
