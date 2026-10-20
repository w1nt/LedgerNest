# LedgerNest

A free, open-source desktop finance tool built with Electron, React and encrypted SQLite. Your records stay on your computer, with optional encrypted backups to your own Google Drive. No author-hosted account or API server is required.

**Version: `0.1.0-SNAPSHOT` — development preview.** The current data model contains bills and settlement records. Bank transaction syncing and AI analysis are planned; saving Plaid or AI credentials does not connect those services. The project does not execute payments, direct debits, collections or fund transfers.

## Current Features

| Feature | Status |
| --- | --- |
| Bill overview, search, filters, creation and trend charts | Implemented with local data |
| Chinese/English, light/dark themes, density and reduced motion | Implemented |
| Device unlock and automatic locking | Windows/macOS adapters implemented; real device prompts require platform acceptance testing |
| Encrypted SQLite and OS-protected database keys | Implemented |
| Local encrypted backup and restore | Implemented in Settings and at the unlock screen |
| Plaintext CSV/JSON export | Implemented for all local bill records |
| Google Drive manual and scheduled encrypted backup | Implemented with UI; real-account acceptance testing remains |
| Plaid and optional AI configuration | Encrypted local configuration only |
| Bank authorization, transaction sync and reconciliation | Not implemented |
| AI requests, budgets, custom rules and reminders | Not implemented |
| Installers and signed distribution | Not implemented; run from source |

## Run Locally

Requires **Node.js 24.17+** and npm. Run these commands from the repository root:

```powershell
npm ci
npm --prefix frontend/my-react-app ci
npm start
```

`npm start` builds the frontend and Electron main/preload, then opens LedgerNest. After building, use `npm run start:built` to launch without rebuilding. Java, MySQL and a Vite server are not required.

Platform requirements:

- **Windows:** native-helper builds use the system .NET Framework 4.8 compiler and WinRT metadata. Windows 11/build 22000+ is the development baseline; older versions are unvalidated. Application-control policies may block an unsigned helper.
- **macOS:** builds require Xcode Command Line Tools (`xcrun swiftc`). Native authentication and Keychain behavior still need validation on a Mac.
- **Linux:** native device unlock is not implemented.

The unlock screen uses Windows Hello or macOS LocalAuthentication. LedgerNest does not read your OS password. Failed, canceled or unavailable verification leaves the database closed; there is no password fallback. Availability checks and automated verification fixtures do not prove a real device prompt has succeeded. If native unlock is unavailable, the in-memory demo can still preview the interface.

### Example Data

Before first use of a new vault, optionally run:

```powershell
npm run seed:example
```

Close LedgerNest first and complete the system verification prompt. This creates the synthetic `example` profile with 32 sample bills. Existing fixtures are preserved; the tool refuses to add a second profile to another user's vault. The old example email/password are not used by the desktop unlock screen. Demo mode uses separate in-memory examples and does not open your database.

### Local Data Location

Source builds use `data/ledgernest.sqlite`. Set `LEDGERNEST_DB_PATH` to use another path; relative paths resolve from the repository root. After successful device verification, a new vault is initialized automatically. Unknown schemas, missing keys and corrupt storage are rejected without resetting existing data.

A vault supports one local profile. Keep the live database outside cloud-synced or network folders. Copying its `.key` file to another OS account is not a portable recovery method; create an encrypted backup instead. Installers and migration into a packaged per-user data directory remain future work.

## Settings

Settings contains **Appearance**, **APIs & connections**, **Privacy & security**, and **Data & backups**.

- Customize language, theme, comfortable/compact density and motion. System reduced motion takes priority.
- Set automatic locking to 5, 10, 15 or 30 minutes. System lock, suspend and user changes also lock the vault; sessions have an 8-hour maximum. Background sync and status polling do not extend the idle timeout.
- Configure your own Plaid environment/Client ID/Secret, or an optional AI provider, HTTPS endpoint, model and API key. These are saved locally; bank authorization and AI calls are not implemented.
- Stored API credentials show only a masked prefix/suffix, with no reveal or copy control. Blank edits retain existing credentials; changing provider identity or endpoint requires a matching new secret.

API/security configuration is OS-encrypted and excluded from portable backups. Re-enter credentials after moving to another device. Demo mode allows appearance changes but cannot change real credentials, cloud configuration or local records.

## Backup, Restore and Export

Open **Settings → Data & backups** to choose a backup directory, create an encrypted `.lnbackup`, restore a backup, or export readable records. Local save dialogs let you choose filenames; existing files are never overwritten.

### Encrypted Backups

- Include the complete business database, including related settlement/history tables.
- Exclude API credentials, cloud authorization/settings, UI preferences and backup-directory settings.
- Require a separate **12–256 character passphrase**, with a **512 MiB database limit**. Manual-backup passphrases are not saved; Google Drive can remember its backup passphrase under OS encryption with explicit consent.
- Remain encrypted during snapshot creation and transfer. Keep your own copy of the passphrase: system login cannot replace it on another device, and the app cannot recover a lost passphrase.

You can choose a folder synced by your own cloud client for manual backups. That client handles uploading; independently confirm it has finished. Direct Google Drive integration is described below.

### Restore

Restore is available in Settings and at the unlock screen, including when the original database/key cannot be opened. It requires destination-device verification and the backup passphrase. The app validates the backup in a new database, shows the record count for confirmation, then switches the active database and asks you to unlock again.

Restore replaces active records without merging. Previous database/key files remain on the device; failed or canceled restores do not select the new database. Existing API/security settings stay with the installation. Repeated restores use additional disk space.

### Plaintext Export

CSV and JSON export all pages of the current profile's bill and settlement records. They exclude account details, password hashes, API keys and internal operation responses. Confirm that the file is unencrypted before saving it.

CSV headers and settlement labels follow the interface language. CSV uses UTF-8 with a BOM, quoted fields and apostrophe prefixes for formula-like text. JSON preserves original text, stable English field names and state codes. Amounts are exact decimal strings in USD; timestamps are UTC.

Exports are readable copies, not complete recovery archives. Bank transactions are not included because bank sync is not implemented.

## Optional Google Drive Backup

Open **Settings → Data & backups → Google Drive backup**. Sync and automatic mode are both **off by default**. You can upload manually or enable automatic uploads with an interval of **1–720 whole hours**, defaulting to **24 hours**.

Automatic upload runs only while LedgerNest is open and unlocked. The scheduler checks once a minute; unlocking checks for one overdue upload. The first automatic upload is due one interval after enabling, with later uploads scheduled from the last verified success. Closing the app installs no background service or OS task.

### Set Up Your Google Account

1. Create/select your own project in the [Google Cloud console](https://console.cloud.google.com/) and enable **Google Drive API**.
2. Configure OAuth consent/audience and add your Google account as a test user when required. Declare `https://www.googleapis.com/auth/drive.file`; the app requests per-file access, not full-Drive access.
3. Create an OAuth client of type **Desktop app** and download its JSON. Keep that credentials file outside the repository. Web clients and service-account credentials are unsupported. See [Google's desktop OAuth guide](https://developers.google.com/identity/protocols/oauth2/native-app).
4. Unlock LedgerNest, select **Import desktop OAuth configuration**, and choose the JSON. Then click **Connect Google Drive** and authorize in your system browser.
5. Open **Sync settings**, enter a Drive folder name and backup filename prefix, and enable sync. Set and confirm a backup passphrase and explicitly consent to OS-encrypted local storage. Keep a separate copy for recovery. Saving confirms filenames consisting of your prefix, a UTC timestamp, a random identifier and `.lnbackup`.
6. Click **Sync to Google Drive now**, or enable **Automatic sync** and save your interval. Manual upload remains available in automatic mode.

The app creates or reuses an app-marked folder; it does not gain arbitrary access to existing Drive folders. Changing the passphrase affects future backups only. Reauthorizing may select another account, so uploads must be explicitly re-enabled afterward.

Google's consent, test-user and publication requirements still apply. External apps left in **Testing** generally receive seven-day refresh tokens for this Drive scope, which may require reconnecting. See [Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth) and [OAuth token expiration](https://developers.google.com/identity/protocols/oauth2#expiration). Real Google authorization and upload have not yet been accepted against a live account; automated tests use synthetic Google responses.

### Uploads and Recovery

- Uploads create independent **encrypted snapshots**. They never upload plaintext exports or replicate the live SQLite database.
- Resumable transfers use bounded retries and verify remote size/checksum before updating the success time. Failures remain visible; automatic retries use backoff. Expired authorization pauses uploads.
- **View cloud backups** lists the latest 100 app-marked files in the configured folder. **Download encrypted backup** saves a verified encrypted copy; use **Restore from backup** with its original passphrase to apply it.
- There is no automatic download, record merging, cloud overwrite or retention deletion. Manage Drive space yourself. Failed transfers can leave an upload session or an extra encrypted version; they are not reported as successful.
- Use the same Google project/client configuration on another device for app file visibility. With another project, download older backups from the Drive website and restore them locally if necessary.
- **Disconnect** stops uploads and removes the local refresh token and saved passphrase. It keeps cloud files. Revoke server-side authorization through your Google Account's third-party app permissions when needed.

No author-hosted server is used. Authorization opens a temporary `127.0.0.1` callback listener, protected with PKCE/state validation and a timeout. Tokens stay in the main process; Google endpoints and upload destinations are restricted, and redirects are refused.

## Storage and Security

React runs in a sandboxed Electron renderer and accesses SQLite through a restricted preload/IPC contract. There is no renderer SQL, arbitrary-path file API or raw-credential getter. Money is stored as integer cents; local operations use transactions, ownership checks and schema validation.

SQLite3MultipleCiphers encrypts database pages and WAL data. Random database keys are protected by Windows CurrentUser DPAPI or macOS Keychain/safeStorage. Portable backups use independent keys, scrypt and authenticated encryption. Private file permissions, process locking and encrypted staging protect local files; this does not protect against malware or an administrator controlling an unlocked OS account.

Files beside the original database:

- `.key`: OS-protected database key; not portable between OS accounts.
- `.settings`: encrypted API/security configuration.
- `.data-settings`: encrypted backup directory and active-restore selector.
- `.restores/`: restored databases and their protected keys; do not manually remove the selected files.
- `.cloud-settings`: encrypted Google configuration, refresh token, backup passphrase and schedule state. Access tokens are memory-only and cleared on lock.

These files, databases, backups, local logs and test artifacts are ignored by Git. Configuration corruption is rejected without silently resetting stored settings. This remains development software; device authentication, signed distribution and real cloud behavior need target-platform acceptance testing.

If a Windows policy blocks the locally compiled helper, an existing trusted code-signing certificate can be selected with `LEDGERNEST_WINDOWS_SIGNING_THUMBPRINT` before `npm run build:desktop`. This does not install certificates, change OS trust/policy or bypass authentication; the optional signing path still needs acceptance testing.

## Development

- `desktop/`: Electron main/preload, local services, encrypted storage, device authentication and Google Drive integration.
- `shared/`: typed billing, settings, data-tool and cloud contracts.
- `database/schema.sql`: current SQLite schema v1.
- `frontend/my-react-app/`: React UI; see its [development notes](frontend/my-react-app/README.md).
- `backend/SpringBoot_demo/`: retained Java reference, not part of desktop startup; see its [scope](backend/SpringBoot_demo/README.md).
- `scripts/`: build, startup, storage and optional legacy-import tools. The [MySQL importer](scripts/migrate-mysql-to-sqlite.py) is a one-time migration utility, not a runtime dependency.

```powershell
npm run build
npm test
npm --prefix frontend/my-react-app run lint
npm --prefix frontend/my-react-app run test:security
npm --prefix frontend/my-react-app run test:i18n
npm --prefix frontend/my-react-app run test:trends
npm run test:desktop
npm run test:settings
npm run test:data
npm run test:cloud
npm run test:storage
node scripts/sync-version.mjs --check
```

Electron integration tests use isolated databases/profiles, hidden windows and a separate fixture entry. Google responses and device verification are simulated there; these tests do not authorize a real account or prove native login works. `npm run test:native` only probes actual device-verification availability without submitting a prompt. Production has no environment-variable switch for those fixtures.

For a browser-only UI/demo preview, run `npm --prefix frontend/my-react-app run dev`. Native unlock and file/cloud operations require Electron. Do not put secrets in `VITE_` variables.

Optional storage CLI commands require closing LedgerNest first and completing device verification:

```powershell
npm run storage:backup -- "FULL_PATH_TO_NEW_FILE.lnbackup"
npm run storage:restore -- "FULL_PATH_TO_BACKUP.lnbackup" "FULL_PATH_TO_NEW_DATABASE.sqlite"
```

The terminal reads passphrases privately. CLI restore writes a new target without activating it; set `LEDGERNEST_DB_PATH` to that target before starting the app. Use the in-app restore flow for automatic activation.

## Next Steps

Add guided first-run setup, a separate bank transaction model, Plaid authorization/cursor-based sync and reconciliation, transaction analysis, and optional user-provided AI tools. Bank coverage, access and limits depend on the provider; the existing bill model is not a bank ledger. Complete native/cloud acceptance testing and signed packaging before distribution.

## License

[MIT](LICENSE).
