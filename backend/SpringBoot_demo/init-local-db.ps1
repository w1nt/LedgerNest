# Kept as a compatibility entry point: schema creation is now automatic on startup.
$ErrorActionPreference = 'Stop'
Write-Output 'SQLite is initialized automatically when LedgerNest starts. No MySQL setup is required.'
Write-Output 'Use start-local.ps1; optional LEDGERNEST_DB_PATH selects a local SQLite file.'
