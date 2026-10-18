# Use a dedicated local development/test database; tests clean their own temporary records.
$ErrorActionPreference = 'Stop'
foreach ($requiredName in @('DB_URL', 'DB_USERNAME', 'DB_PASSWORD')) {
    if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($requiredName))) {
        throw "Set $requiredName in this terminal before testing. See the root README."
    }
}
& (Join-Path $PSScriptRoot 'mvnw.cmd') '-B' '-ntp' '-f' (Join-Path $PSScriptRoot 'pom.xml') 'package'
if ($LASTEXITCODE -ne 0) { throw "Backend checks failed with code $LASTEXITCODE" }
