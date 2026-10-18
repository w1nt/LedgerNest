# LedgerNest

A local-first personal finance and analytics tool, with user-provided API credentials.

LedgerNest is a free, open-source project intended to run on your own computer. Its goal is to sync authorized bank transactions using your own Plaid credentials, categorize and analyze data locally, and optionally connect to an AI API of your choice.

## Current Status

**`0.1.0-SNAPSHOT` is a migration baseline extracted from an existing billing application, not a finished Plaid-powered desktop product.** The desktop now runs React in Electron, with a TypeScript local business layer and embedded SQLite. Device unlock, local profile access, bill listing, creation, overview and charts use validated IPC; they do not require Java, MySQL or a listening HTTP server. The Java backend remains as a migration reference for operations not yet ported. Plaid Link, bank transaction syncing, guided first-run setup, and an AI agent are not implemented. The roadmap below describes planned work, not completed features.

| Feature | Status |
| --- | --- |
| Bill lists, search, filters, creation, overview, and trend charts | Existing prototype |
| Chinese and English interfaces, themes, shared dropdowns, and amount tooltips | Existing prototype |
| Electron main/preload, SQLite and OS-authenticated local sessions | Implemented for the current UI; validated capability-based IPC |
| User-provided Plaid credentials and Link authorization | Not implemented |
| Historical transaction imports, incremental syncing, and reconciliation | Not implemented |
| Windows Hello / macOS device unlock | Adapter/UI implemented; Windows native acceptance blocked by local unsigned-code policy, macOS untested |
| Encrypted embedded local storage | Implemented with SQLite3MultipleCiphers, OS-protected keys and passphrase backups |
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

Requires **Node.js 24.17+** for development. Windows builds use the system .NET Framework 4.8 compiler and WinRT metadata (Windows 11, build 22000+ baseline; older Windows versions are not validated); macOS builds need Xcode Command Line Tools (`xcrun swiftc`). Linux device unlock is currently unsupported and does not fall back to password login. Run from the repository root:

```powershell
npm ci
npm --prefix frontend/my-react-app ci
# Optional: create synthetic local test data before opening the app.
npm run seed:example
npm start
```

`npm start` builds the React UI and Electron main/preload, then opens the desktop application. After a successful build, `npm run start:built` starts it without rebuilding. No Vite server, Spring Boot process, Java runtime, MySQL server or database credentials are needed. Installers and platform signing are a later milestone; these commands run from source.

In source development the database remains `data/ledgernest.sqlite`, preserving the earlier SQLite migration. `LEDGERNEST_DB_PATH` overrides the file; relative paths resolve from the repository root. A packaged application is designed to use Electron's per-user application data directory, but packaging and migration into that directory are not yet implemented. After successful device authentication, an empty database is initialized automatically; existing unknown schemas and newer schema versions are rejected without resetting them. Fixtures are never inserted automatically.

On the unlock screen, choose **Unlock workspace** and complete the system prompt. Windows uses **Windows Hello** (PIN, face or fingerprint, according to your device settings); LedgerNest never reads your Windows password. Configure Hello in Windows sign-in options if it is unavailable. macOS uses LocalAuthentication with Touch ID or the Mac login password. A failed, canceled or unavailable verification leaves storage closed; there is no automatic password or availability-only fallback.

One OS account opens one local profile. On an empty database the profile is created after verification, using the OS username. A sole existing profile is adopted without changing IDs or bills. Multiple profiles in a legacy database are refused pending an explicit separation workflow. The optional seeder retains the synthetic `example` profile, historical credentials `example@example.com` / `example123`, and 32 bills; those credentials are no longer entered in the desktop UI. Running the seeder again skips existing fixtures and does not reset credentials. Seed before first use of a new empty vault; it refuses to add an unrelated example profile to a vault already owned by another profile. The separate demo entry uses in-memory examples and never unlocks the financial database.

The database now encrypts pages automatically. Keys, database files, recovery snapshots and portable backups are ignored by Git. Read the storage section below before copying data to another device. Do not put a live database on a network drive or treat file synchronization as database synchronization.

Windows application-control policies may block the locally compiled, unsigned `desktop/dist/ledgernest-auth.exe`. Availability alone does not prove the real prompt works. When an existing **trusted code-signing certificate** is available in `Cert:\CurrentUser\My`, its non-secret thumbprint can be supplied before building:

```powershell
$env:LEDGERNEST_WINDOWS_SIGNING_THUMBPRINT = "YOUR_EXISTING_TRUSTED_CERTIFICATE_THUMBPRINT"
npm run build:desktop
```

The build signs only the authentication helper using that certificate and requires a Valid Authenticode result. It does not create certificates, modify trust stores, disable application control, or add an authentication fallback. This optional signing branch has not been exercised here because no code-signing certificate is installed. Timestamping and signed installer/application distribution remain later packaging work; an enterprise policy may additionally require its administrator to approve the signer. If policy blocks the helper, the app stays locked and the in-memory demo remains available.

### Legacy Browser Preview

The retained HTTP adapter and Java backend are migration references. `npm --prefix frontend/my-react-app run dev` can preview the new unlock screen and in-memory demo in a browser; device unlock requires Electron and stays disabled there. The shared UI no longer offers browser account/password login. Any direct regression work with `backend/SpringBoot_demo/start-local.ps1` must use a separate, disposable plaintext database and JDK 17+. The Java driver cannot open the encrypted desktop database. No Java or Vite process is part of normal desktop startup; desktop sessions use main-process memory rather than cookies.

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
npm run test:storage
npm run test:native # real availability, hidden UI, no verification prompt
npm --prefix frontend/my-react-app run lint
npm --prefix frontend/my-react-app run test:security
npm --prefix frontend/my-react-app run test:i18n
npm --prefix frontend/my-react-app run test:trends
# Optional one-time importer tests (Python 3.10+):
python -m unittest discover -s scripts/tests -v
```

Unit tests and the real Electron integration test use temporary databases and profiles. The tests inject verification through a separate executable built under ignored `.local-tools/device-auth-tests/`; the production entry always selects the native verifier and has no test-authentication environment bypass. Automated verification fixtures do not prove a human Windows Hello / macOS prompt has succeeded. The Electron test keeps windows hidden and verifies unlock cancellation, database access gating, manual/OS locking, totals, six chart bars, creation through the UI, restart persistence, isolated renderer capabilities, rejected foreign IPC callers, abrupt-exit recovery with a fresh Chromium profile, and absence of HTTP API requests. To verify an existing example database without modifying it, set `LEDGERNEST_VERIFY_SOURCE=data/ledgernest.sqlite` for `npm run test:desktop`; the closed encrypted database and its OS-protected key file are copied to an isolated test directory. Close every app using the source first; a live lock or nonempty WAL causes this check to refuse the copy. This fixture-specific check expects the original 32 examples and October 2026 summary.

Desktop requests follow **React → restricted preload bridge → validated main-frame IPC → local business service → SQLite**. The bridge exposes device availability, unlock, current profile, lock, paginated bills, bill creation and a lock notification; account registration/password login are not exposed. Renderer code has no Node integration, SQL, file paths, OS credentials, database keys or arbitrary IPC access. The sandbox, context isolation, restrictive CSP, custom application protocol, navigation checks, parameterized SQL, integer cents and transactional idempotency apply to this workflow.

A main-process `DeviceSession` requires native verification before unwrapping keys or opening/creating the database. Lock closes the SQLite handle, releases the file lock, clears the session and notifies React to remove protected pages. System lock, suspend and active-user changes lock the app; it also locks after 10 minutes without protected application access, 10 minutes of OS inactivity, or 8 hours since unlock. Expiry is checked on requests and every five seconds. Pending verification is canceled on lock, and late results cannot reopen the vault. Closing the app also locks it; a reload inside the same unlocked process retains the session. Device verification is an application access gate, not an OS-enforced requirement for every DPAPI/Keychain decryption; software already running as the same unlocked OS user remains outside this protection boundary.

Profile editing, preference APIs, bill editing/deletion and standalone summary/reminder/settlement operations are retained in Java and **not exposed by the desktop bridge yet**. Existing charts calculate from the locally loaded bills. No payment execution or bank-sync capability is provided.

All components share the root `VERSION`; future development belongs to this repository. Its history is independent of the private prototype repository. Existing frontend and backend development logs remain local and are excluded by `.gitignore`. Public updates belong in README files. API credentials, local databases, backups and build artifacts must not be committed.

## Local Storage Security and Encrypted Backups

Persistent desktop storage uses `better-sqlite3-multiple-ciphers` 13.0.3 and SQLite3MultipleCiphers' modern `sqlcipher` mode (`legacy=0`): AES-256 page encryption, SHA-512 page HMAC verification, a random 256-bit database secret, and PBKDF2 with 256,000 iterations. Keys are applied through the native binary API rather than SQL literals. The schema remains v1. Use LedgerNest tooling for this cipher format.

`data/ledgernest.sqlite.key` holds an **OS-protected wrapper**, not the clear database key. Windows uses CurrentUser DPAPI directly through a hidden system PowerShell helper, independent of Chromium's Local State file. macOS/Linux use Electron safeStorage; Linux's `basic_text`/unavailable key-store fallback is rejected. No key is supplied by the renderer, a `VITE_` variable, environment variable or command-line argument. An existing encrypted database with a missing, wrong or corrupt key is never silently reset or given a replacement key.

Database/key/recovery files receive a current-user-only Windows DACL, or mode 0600 on POSIX; newly created storage directories use private permissions. WAL page contents are encrypted. Shared-memory sidecars carry SQLite coordination metadata and receive access restrictions. Temporary SQL data is held in memory; foreign keys, strict tables, secure deletion, disabled trusted schema/mmap, FULL synchronization, application file locks and transactional idempotency remain enabled. OS administrators and software acting as the unlocked OS user are outside this protection boundary; live plaintext in application memory is not encrypted by this feature.

Existing valid plaintext LedgerNest databases migrate after successful device verification, or explicitly with:

```powershell
npm run storage:encrypt
```

Migration validates the old schema, blocks competing writers, copies and compares all ten tables and sequence counters into a new database that is encrypted before its first write, and verifies integrity before publication. An encrypted `ledgernest.sqlite.migration-<id>.sqlite` recovery snapshot is retained next to the original path. It uses the same wrapped key. The original path is replaced only after verification; unknown databases are refused. Existing accounts, password hashes, bill IDs, timestamps and amounts are retained. Old external exports, OS snapshots or previously deleted plaintext blocks are not erased by this migration.

Close the application before running storage commands. All storage CLI operations (including seed, encrypt, backup and restore) require system device verification before opening storage or restoring data; cancellation fails closed. The system prompt is interactive even though the storage helper window stays hidden. To make a **portable backup**, choose a new output path:

```powershell
npm run storage:backup -- "FULL_PATH_TO_NEW_FILE.lnbackup"
```

The terminal asks for and confirms a 12–256 character passphrase with input hidden. It is sent to the hidden storage process over stdin only. Each backup has a fresh database key, wrapped with scrypt (`N=131072, r=8, p=1`) and AES-256-GCM. The authenticated envelope also binds a SHA-256 digest of the encrypted SQLite payload. Staging snapshots are encrypted from their first write; normal completion and failures clean up temporary backup files. Existing destinations are never overwritten. Backup format v1 supports files up to 512 MiB and needs roughly 128 MiB of working memory for scrypt.

To restore onto another device/OS account, use a **new database path**:

```powershell
npm run storage:restore -- "FULL_PATH_TO_BACKUP.lnbackup" "FULL_PATH_TO_NEW_DATABASE.sqlite"
```

Restore authenticates the passphrase and payload, verifies the SQLite schema/integrity, and wraps the restored key with the destination OS account before publishing the new database. Wrong passwords, damaged files and existing destinations are rejected. Set `LEDGERNEST_DB_PATH` to the restored file before starting the app. The backup does not contain the original machine's OS-key wrapper.

Moving the database and `.key` together within the same OS account preserves access; ordinary copies of this pair are not a portable recovery method. Keep a passphrase backup before reinstalling the OS or changing devices. A forgotten backup passphrase or lost OS key without a portable backup cannot be recovered by the project author. The historical example login password is unused by device unlock and remains separate from storage encryption. Backup/restore currently use the terminal; Settings controls and key-rotation UI are later work. Windows key protection and isolated unlock flows are tested here. An initial native availability/COM probe returned available, but a later rebuilt unsigned helper was blocked by the host's Code Integrity policy; the current production availability check therefore returns unavailable. Real Windows unlock is not accepted as working on this host. A trusted signed helper and a human-completed Windows Hello prompt are still required. We do not weaken or bypass OS application-control policies. The macOS helper and Keychain flow need compilation and end-to-end validation on a Mac, followed by signed distribution work. Linux native unlock is not implemented. User-owned cloud destinations and fast cross-device restore are planned for a later milestone; no cloud connection, upload or new backup UI is included.

Implementation references: [SQLite3MultipleCiphers cipher settings](https://utelle.github.io/SQLite3MultipleCiphers/docs/ciphers/cipher_sqlcipher/), [Windows DPAPI](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata), [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage), [Windows desktop verification](https://learn.microsoft.com/en-us/uwp/api/windows.security.credentials.ui.userconsentverifier), [macOS owner authentication](https://developer.apple.com/documentation/localauthentication/lapolicy/deviceownerauthentication).

## SQLite Migration and Test Account

The SQLite schema uses strict tables, foreign keys on every connection, WAL, and IMMEDIATE transactions. Monetary values are stored as **integer USD cents**; API amounts remain decimal strings. UTC timestamps are fixed-width text. This retains the existing bill API and does not implement bank syncing or payments.

The test account and fixtures are created by `npm run seed:example` using a hidden Electron storage tool with the same OS key protection as the app. No Java, HTTP server or normal application window is required; the OS verification dialog must be completed. No sample database or real account data is shipped in Git.

For an existing legacy MySQL database, the optional one-time importer requires Python 3.10+ (SQLite 3.37+) and the MySQL CLI:

```powershell
# Set MYSQL_PWD in this terminal using your own source database credentials.
python scripts/migrate-mysql-to-sqlite.py --user YOUR_READ_USER --database YOUR_DATABASE --output data/imported.sqlite
```

The legacy importer produces a plaintext SQLite file; keep it in a private directory and run the desktop encryption migration against that path before normal use. It does not produce a portable encrypted backup. The importer uses a read-only consistent snapshot, preserves IDs/password hashes/timestamps, converts money without rounding, and verifies every row plus foreign keys and integrity. It refuses to overwrite an existing destination. Stop the application and set `LEDGERNEST_DB_PATH` to the imported file before starting it. Clear `MYSQL_PWD` from the terminal when finished. This importer is optional; MySQL is not a runtime dependency.

## License

[MIT](LICENSE).
