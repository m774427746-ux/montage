param(
 [Parameter(Mandatory)][string]$WinSWPath,
 [Parameter(Mandatory)][string]$ExpectedSHA256,
 [Parameter(Mandatory)][string]$EnvironmentFile,
 [string]$InstallDirectory = 'D:\ASBARIX-SERVER\service'
)
$ErrorActionPreference = 'Stop'
# Execute only after reviewing and approving the service account and ACL changes.
if ((Get-FileHash -LiteralPath $WinSWPath -Algorithm SHA256).Hash -ne $ExpectedSHA256) { throw 'WinSW checksum mismatch' }
if (-not (Test-Path -LiteralPath $EnvironmentFile -PathType Leaf)) { throw 'Local environment file required' }
$appRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$nodePath = (Get-Command node.exe).Source
if (Test-Path -LiteralPath $InstallDirectory) { throw 'Use a new service directory; existing files are never overwritten' }
New-Item -ItemType Directory -Path $InstallDirectory | Out-Null
$serviceExe = Join-Path $InstallDirectory 'AsbarixProduction.exe'
Copy-Item -LiteralPath $WinSWPath -Destination $serviceExe
$escape = { param($s) [System.Security.SecurityElement]::Escape($s) }
$xml = @"
<service>
 <id>AsbarixProduction</id><name>Asbarix Production</name>
 <description>Local print production service</description>
 <executable>$(& $escape $nodePath)</executable>
 <arguments>--env-file=&quot;$(& $escape $EnvironmentFile)&quot; &quot;$(& $escape (Join-Path $appRoot 'src\server.mjs'))&quot;</arguments>
 <workingdirectory>$(& $escape $appRoot)</workingdirectory>
 <startmode>Automatic</startmode>
 <serviceaccount><username>NT AUTHORITY\LocalService</username></serviceaccount>
 <logpath>$(& $escape (Join-Path $InstallDirectory 'logs'))</logpath>
 <log mode="roll-by-size"><sizeThreshold>10240</sizeThreshold><keepFiles>8</keepFiles></log>
 <onfailure action="restart" delay="10 sec"/>
 <stoptimeout>30 sec</stoptimeout>
</service>
"@
Set-Content -LiteralPath (Join-Path $InstallDirectory 'AsbarixProduction.xml') -Value $xml -Encoding utf8
Write-Host 'Before starting: grant LocalService read access to code and environment, Modify access only to storage and service logs. Do not grant access to existing customer folders.'
& $serviceExe install
if ($LASTEXITCODE -ne 0) { throw 'Service installation failed' }
Write-Host 'Installed, not started. Review permissions, then Start-Service AsbarixProduction.'
