param([Parameter(Mandatory)][string]$EnvironmentFile,[Parameter(Mandatory)][string]$BackupRoot,[Parameter(Mandatory)][string]$StorageRoot)
$ErrorActionPreference='Stop'
$source=(Resolve-Path -LiteralPath $StorageRoot).Path
$target=(Resolve-Path -LiteralPath $BackupRoot).Path
if(-not [IO.Path]::IsPathRooted($source) -or -not [IO.Path]::IsPathRooted($target)){throw 'Absolute paths required'}
if($target.StartsWith('\\')){throw 'Network target requires separately validated backup infrastructure; use a separate local disk'}
$sourceDisk=Get-Partition -DriveLetter $source.Substring(0,1) | Get-Disk
$targetDisk=Get-Partition -DriveLetter $target.Substring(0,1) | Get-Disk
if($sourceDisk.Number -eq $targetDisk.Number){throw 'Backup must be on a separate physical disk'}
$service=Get-Service AsbarixProduction
$restart=$service.Status -eq 'Running'
try {
 if($restart){Stop-Service AsbarixProduction;$service.WaitForStatus('Stopped',[TimeSpan]::FromSeconds(45))}
 $env:BACKUP_ROOT=$target
 $env:EXPECTED_STORAGE_ROOT=$source
 & node "--env-file=$EnvironmentFile" (Join-Path $PSScriptRoot '..\src\backup.mjs') backup
 if($LASTEXITCODE -ne 0){throw 'Backup failed'}
}finally{
 Remove-Item Env:BACKUP_ROOT,Env:EXPECTED_STORAGE_ROOT -ErrorAction SilentlyContinue
 if($restart){Start-Service AsbarixProduction}
}
