# Import the fresh schema into an already-created dedicated database.
param(
    [ValidatePattern('^[A-Za-z][A-Za-z0-9_]{0,63}$')]
    [string]$DatabaseName = 'ledgernest_dev',
    [string]$AdminUser = 'root',
    [string]$MysqlCommand = 'mysql'
)
$ErrorActionPreference = 'Stop'
$schemaPath = (Join-Path $PSScriptRoot 'src/main/resources/schema.sql').Replace('\', '/')
# --password with no value prompts interactively; no password is embedded in arguments.
& $MysqlCommand '--host=127.0.0.1' '--port=3306' "--user=$AdminUser" '--password' "--database=$DatabaseName" '--default-character-set=utf8mb4' '-e' "source $schemaPath"
if ($LASTEXITCODE -ne 0) { throw 'Schema import failed. Check the dedicated database and administrator permissions.' }
