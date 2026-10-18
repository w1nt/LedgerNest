# Run the current local prototype with user-provided database configuration.
$ErrorActionPreference = 'Stop'
foreach ($requiredName in @('DB_URL', 'DB_USERNAME', 'DB_PASSWORD')) {
    if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($requiredName))) {
        throw "Set $requiredName in this terminal before starting. See the root README."
    }
}
$projectRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$projectVersion = (Get-Content -LiteralPath (Join-Path $projectRoot 'VERSION') -Raw).Trim()
$jarPath = Join-Path $PSScriptRoot "target/SpringBoot_demo-$projectVersion.jar"
if (-not (Test-Path -LiteralPath $jarPath)) {
    throw 'Build the backend with test-local.ps1 or the Maven wrapper first.'
}
$javaCommand = 'java'
if ($env:JAVA_HOME) { $javaCommand = Join-Path $env:JAVA_HOME 'bin/java.exe' }
& $javaCommand -jar $jarPath
if ($LASTEXITCODE -ne 0) { throw "Backend exited with code $LASTEXITCODE" }
