# Printer agentini Windows'ga kirishda avtomatik (oynasiz) ishga tushirishga sozlaydi.
# Ishga tushirish:  powershell -ExecutionPolicy Bypass -File .\install-autostart.ps1
# O'chirish:        powershell -ExecutionPolicy Bypass -File .\install-autostart.ps1 -Remove
param([switch]$Remove)

$taskName = 'MilliyGoPrinterAgent'

if ($Remove) {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Output "O'chirildi: $taskName"
  exit 0
}

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { throw "Node.js topilmadi. https://nodejs.org dan o'rnating (18 yoki yangi)." }

$launcher = Join-Path $PSScriptRoot 'launch-hidden.vbs'
$action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "`"$launcher`"" -WorkingDirectory $PSScriptRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Output "Tayyor: '$taskName' Windows'ga kirganda avtomatik ishga tushadi. Hozir ham ishga tushirildi."
