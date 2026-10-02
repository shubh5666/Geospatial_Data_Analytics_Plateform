param(
    [ValidateSet('start', 'stop', 'status')]
    [string]$Action = 'status'
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$localRoot = Join-Path $projectRoot '.local'
$pgCtl = Join-Path $localRoot 'postgresql\bin\pg_ctl.exe'
$dataDirectory = Join-Path $localRoot 'postgres-data'
$logFile = Join-Path $localRoot 'postgres.log'

if (-not (Test-Path -LiteralPath $pgCtl) -or
    -not (Test-Path -LiteralPath (Join-Path $dataDirectory 'PG_VERSION'))) {
    throw 'Local PostgreSQL is not initialized. See docs/DATABASE_SETUP.md.'
}

if ($Action -eq 'start') {
    & $pgCtl -D $dataDirectory status *> $null
    if ($LASTEXITCODE -eq 0) {
        Write-Output 'Project database is already running.'
        exit 0
    }
    & $pgCtl -D $dataDirectory -l $logFile -w -t 15 start
} elseif ($Action -eq 'stop') {
    & $pgCtl -D $dataDirectory -w -t 15 -m fast stop
} else {
    & $pgCtl -D $dataDirectory status
}
exit $LASTEXITCODE
