# Build and test against automatically isolated temporary SQLite databases.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$javaTemp = Join-Path $projectRoot '.local-tools\java-tmp'
New-Item -ItemType Directory -Force -Path $javaTemp | Out-Null
$previousJavaOptions = $env:JAVA_TOOL_OPTIONS
try {
    # Windows JDK loopback sockets need a short, writable path; preserve spaces and user options.
    if ($env:OS -eq 'Windows_NT') {
        $env:JAVA_TOOL_OPTIONS = ($previousJavaOptions + ' -Djdk.net.unixdomain.tmpdir="' + $javaTemp + '"').Trim()
    }
    Push-Location $projectRoot
    try {
        & (Join-Path $PSScriptRoot 'mvnw.cmd') '-B' '-ntp' '-f' (Join-Path $PSScriptRoot 'pom.xml') 'clean' 'package'
        if ($LASTEXITCODE -ne 0) { throw "Backend checks failed with code $LASTEXITCODE" }
    } finally { Pop-Location }
} finally { $env:JAVA_TOOL_OPTIONS = $previousJavaOptions }
