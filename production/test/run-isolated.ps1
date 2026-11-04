$ErrorActionPreference = 'Stop'
$pgBin = 'C:\Program Files\PostgreSQL\16\bin'
$cluster = Join-Path $PSScriptRoot ('..\..\..\test-pg-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $cluster | Out-Null
$pwFile = Join-Path $cluster 'password.txt'
$testPassword = [guid]::NewGuid().ToString('N')
Set-Content -LiteralPath $pwFile -Value $testPassword -NoNewline
$started = $false
try {
  & "$pgBin\initdb.exe" -D (Join-Path $cluster 'data') -U test_runner --auth=scram-sha-256 --pwfile=$pwFile --encoding=UTF8 --locale=C *> (Join-Path $cluster 'init.log')
  if ($LASTEXITCODE -ne 0) { throw 'Isolated initdb failed; inspect init.log' }
  & "$pgBin\pg_ctl.exe" -D (Join-Path $cluster 'data') -l (Join-Path $cluster 'postgres.log') -o '-h 127.0.0.1 -p 55439' -w start
  if ($LASTEXITCODE -ne 0) { throw 'Isolated server start failed' }
  $started = $true
  $env:TEST_DATABASE_URL = "postgresql://test_runner:$testPassword@127.0.0.1:55439/postgres"
  & node --test (Join-Path $PSScriptRoot 'integration.test.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'Integration tests failed' }
} finally {
  if ($started) { & "$pgBin\pg_ctl.exe" -D (Join-Path $cluster 'data') -m fast -w stop }
  Remove-Item Env:TEST_DATABASE_URL -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $pwFile -ErrorAction SilentlyContinue
}
