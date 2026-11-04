param([Parameter(Mandatory)][string]$EnvironmentFile)
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
& node --version
& node "--env-file=$EnvironmentFile" (Join-Path $root 'src\cli.mjs') check
if($LASTEXITCODE -ne 0){throw 'Readiness check failed'}
Get-Service -Name 'postgresql-x64-16' | Select-Object Name,Status
Get-PSDrive -PSProvider FileSystem | Select-Object Name,Free,Used
