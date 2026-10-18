# Run LedgerNest against its embedded SQLite file. No MySQL server or DB credentials required.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$projectVersion = (Get-Content -LiteralPath (Join-Path $projectRoot 'VERSION') -Raw).Trim()
$jarPath = Join-Path $PSScriptRoot "target/SpringBoot_demo-$projectVersion.jar"
if (-not (Test-Path -LiteralPath $jarPath)) {
    throw 'Build the backend with test-local.ps1 or the Maven wrapper first.'
}
$javaCommand = 'java'
if ($env:JAVA_HOME) { $javaCommand = Join-Path $env:JAVA_HOME 'bin/java.exe' }
$javaTemp = Join-Path $projectRoot '.local-tools\java-tmp'
New-Item -ItemType Directory -Force -Path $javaTemp | Out-Null
Push-Location $projectRoot
try {
    & $javaCommand "-Djdk.net.unixdomain.tmpdir=$javaTemp" -jar $jarPath
    if ($LASTEXITCODE -ne 0) { throw "Backend exited with code $LASTEXITCODE" }
} finally { Pop-Location }
