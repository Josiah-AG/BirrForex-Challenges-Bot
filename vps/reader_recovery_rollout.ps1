# Run in the Administrator interactive desktop session, one terminal at a time.
param(
 [Parameter(Mandatory=$true)][ValidateRange(1,15)][int]$TerminalId,
 [ValidateSet('Enable','Rollback','Refresh')][string]$Mode='Enable',
 [string]$BackupRoot='C:\BirrForex\backups\reader-recovery-20261018',
 [switch]$RestoreProfile
)
$ErrorActionPreference='Stop'
if((Get-Process -Id $PID).SessionId -eq 0){throw 'Use an interactive scheduled task or the Administrator desktop'}
$repo=Split-Path $PSScriptRoot -Parent
$root=Join-Path $BackupRoot "terminal-$TerminalId"
$drain=Join-Path $PSScriptRoot "maintenance_$TerminalId.drain"
$stop=Join-Path $PSScriptRoot "stop_worker_$TerminalId.flag"
$flag=Join-Path $PSScriptRoot "reader_recovery_$TerminalId.enabled"
$exe="C:\MetaTrader\Terminal $TerminalId\terminal64.exe"
$ini="C:\MetaTrader\Terminal $TerminalId\base_login.ini"
$port=8000+$TerminalId
$env:VPS_API_KEY=[Environment]::GetEnvironmentVariable('VPS_API_KEY','Machine')
if(!$env:VPS_API_KEY){throw 'Machine API key not configured'}
$keyBody=@{api_key=$env:VPS_API_KEY}|ConvertTo-Json
function Get-Health { Invoke-RestMethod "http://127.0.0.1:$port/health" -TimeoutSec 4 }
function Stop-OwnedWorker {
 New-Item $stop -ItemType File -Force|Out-Null
 Get-CimInstance Win32_Process|Where-Object {$_.Name -match '^python' -and $_.CommandLine -match "worker.py\s+$TerminalId\s+$port(\s|$)"}|ForEach-Object {Stop-Process -Id $_.ProcessId -Force}
 Start-Sleep -Seconds 2
 Get-CimInstance Win32_Process|Where-Object {$_.Name -eq 'cmd.exe' -and $_.CommandLine -match "--worker\s+$TerminalId\s+$port(\s|$)"}|ForEach-Object {Stop-Process -Id $_.ProcessId -Force}
}
function Start-OwnedWorker([bool]$AttachOnly) {
 $env:VPS_ATTACH_ONLY=if($AttachOnly){'1'}else{'0'}
 Start-Process cmd.exe -WorkingDirectory $repo -ArgumentList "/k call `"$PSScriptRoot\start_vps.bat`" --worker $TerminalId $port"
}
function Wait-Ready([int]$Version) {
 # Enable may use the repeated-timeout cold-start allowance (up to 600s).
 # Do not declare deployment failure while that bounded recovery is still running.
 $until=(Get-Date).AddSeconds($(if($Mode -eq 'Enable'){660}else{210}))
 do {
  try {
   $h=Get-Health
   if($h.status -eq 'ok' -and $h.ipc_connected -and !$h.busy -and !$h.recovery_in_progress -and ($Version -ne 2 -or $h.reader_recovery_version -eq 2)){
    $ea=Invoke-RestMethod "http://127.0.0.1:$port/ea-health" -Method Post -ContentType 'application/json' -Body $keyBody -TimeoutSec 5
    if($ea.status -eq 'verified'){return $h}
   }
  } catch {}
  Start-Sleep -Seconds 3
 } while((Get-Date) -lt $until)
 throw 'Worker/EA verification failed; maintenance retained'
}
New-Item $root -ItemType Directory -Force|Out-Null
New-Item $drain -ItemType File -Force|Out-Null
Start-Sleep -Seconds 4
try {
 $until=(Get-Date).AddMinutes(6)
 $idle=$false
 do {
  try {$h=Get-Health;$idle=(!$h.busy -and !$h.recovery_in_progress)}catch{
   # No live worker means there can be no request holding its terminal lock.
   $owned=Get-CimInstance Win32_Process|Where-Object {$_.Name -match '^python' -and $_.CommandLine -match "worker.py\s+$TerminalId\s+$port(\s|$)"}
   $idle=!$owned
  }
  if(!$idle){Start-Sleep -Seconds 3}
 } while(!$idle -and (Get-Date) -lt $until)
 if(!$idle){throw 'Terminal is busy; nothing stopped'}
 if(!(Test-Path "$root\manifest.json")){
  $data=@(Get-ChildItem "$env:APPDATA\MetaQuotes\Terminal" -Directory | Where-Object {
   $origin=Join-Path $_.FullName 'origin.txt'
   (Test-Path $origin) -and ((Get-Content $origin -Raw).Trim().TrimEnd('\') -ieq (Split-Path $exe))
  })
  if($data.Count -ne 1){throw 'Cannot uniquely identify terminal data folder'}
  Copy-Item $ini "$root\base_login.ini"
  Copy-Item "$($data[0].FullName)\Config\common.ini" "$root\common.ini"
  Copy-Item "$($data[0].FullName)\MQL5\Profiles\Charts" "$root\Charts" -Recurse
  $profileMatch=Select-String -Path "$root\common.ini" -Pattern '^ProfileLast=(.*)$'
  $profile=if($profileMatch){$profileMatch.Matches[0].Groups[1].Value.Trim()}else{'Default'}
  @{terminal=$TerminalId;data=$data[0].FullName;profile=$profile;created=(Get-Date -Format o)}|ConvertTo-Json|Set-Content "$root\manifest.json"
 }
 $started=Get-Date
 Stop-OwnedWorker
 if($Mode -eq 'Enable'){
  if(!(Test-Path "$PSScriptRoot\native_sltp_$TerminalId.installed")){throw 'Reader EA is not installed'}
  New-Item $flag -ItemType File -Force|Out-Null
  Start-OwnedWorker $false
  $after=Wait-Ready 2
 }elseif($Mode -eq 'Refresh'){
  if(!(Test-Path $flag)){throw 'Refresh requires reader recovery already enabled'}
  Start-OwnedWorker $true
  $after=Wait-Ready 2
 }else{
  Remove-Item $flag -ErrorAction SilentlyContinue
  if($RestoreProfile){
   $manifest=Get-Content "$root\manifest.json" -Raw|ConvertFrom-Json
   Get-CimInstance Win32_Process|Where-Object {$_.ExecutablePath -ieq $exe}|ForEach-Object {Stop-Process -Id $_.ProcessId -Force}
   Start-Sleep -Seconds 3
   $content=Get-Content "$root\base_login.ini" -Raw
   # Original profile files were never overwritten; select that saved profile.
   $content += "`r`n[Charts]`r`nProfileLast=$($manifest.profile)`r`n"
   Set-Content -Path $ini -Value $content -Encoding ASCII
   Start-Process $exe -ArgumentList ('/config:"'+$ini+'"')
   Start-Sleep -Seconds 45
  }
  # Default rollback keeps a working reader profile while reverting recovery policy.
  Start-OwnedWorker $true
  $after=Wait-Ready 1
 }
 Remove-Item $stop -ErrorAction SilentlyContinue
 Remove-Item $drain -ErrorAction SilentlyContinue
 @{success=$true;mode=$Mode;terminal=$TerminalId;seconds=[math]::Round(((Get-Date)-$started).TotalSeconds,2);health=$after;finished=(Get-Date -Format o)}|ConvertTo-Json -Depth 6|Set-Content "$root\last-result.json"
 Write-Output "Terminal $TerminalId $Mode verified; returned to queue"
}catch{
 # Do not release an unverified terminal or let its BAT restart endlessly.
 @{success=$false;mode=$Mode;terminal=$TerminalId;error=$_.Exception.Message;finished=(Get-Date -Format o)}|ConvertTo-Json|Set-Content "$root\last-result.json"
 throw
}
