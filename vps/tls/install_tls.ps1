$ErrorActionPreference = 'Stop'
$root = 'C:\ProgramData\WinnerPipTLS'
$taskName = 'WinnerPip Encrypted Ingress'
if (Get-NetTCPConnection -State Listen -LocalPort 80 -ErrorAction SilentlyContinue) { throw 'Port 80 is occupied; inspect before changing anything.' }
New-Item -ItemType Directory -Force $root | Out-Null
icacls.exe $root /inheritance:r /grant:r '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-18:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not protect TLS data directory' }
$archive = Join-Path $root 'caddy.zip'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Invoke-WebRequest -UseBasicParsing 'https://github.com/caddyserver/caddy/releases/download/v2.11.4/caddy_2.11.4_windows_amd64.zip' -OutFile $archive
$expected = 'cd5ccfd86a4b40732cf715890d0dca5bf3f63adefec5a7914de85adf240c60ce7e5d2791631b88ef9758e46b23bb1730e020b9c5d696889740b284ffd4788e35'
if ((Get-FileHash $archive -Algorithm SHA512).Hash.ToLower() -ne $expected) { throw 'Caddy checksum mismatch' }
Expand-Archive $archive -DestinationPath $root -Force
$env:XDG_DATA_HOME = Join-Path $root 'data'
& "$root\caddy.exe" validate --config "$PSScriptRoot\Caddyfile" --adapter caddyfile
if ($LASTEXITCODE -ne 0) { throw 'TLS config invalid' }
if (!(Get-NetFirewallRule -Name 'WinnerPip-TLS-Ingress' -ErrorAction SilentlyContinue)) {
 New-NetFirewallRule -Name 'WinnerPip-TLS-Ingress' -DisplayName 'WinnerPip encrypted ingress' -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow | Out-Null
}
if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) { throw 'TLS task exists; do not overwrite it without review' }
$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument ('/k "' + $PSScriptRoot + '\start_tls.bat"') -WorkingDirectory $PSScriptRoot
$principal = New-ScheduledTaskPrincipal -UserId 'Administrator' -LogonType Interactive -RunLevel Highest
$trigger = New-ScheduledTaskTrigger -AtLogOn -User 'Administrator'
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $taskName -Action $action -Principal $principal -Trigger $trigger -Settings $settings | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Output 'TLS console launched in Administrator desktop session. Existing router/workers were not restarted.'
