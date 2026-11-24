# Registers a weekday 8:30 AM task that runs scripts\morning.ps1. Run once, in PowerShell, from the desk folder.
# Times use this PC's clock; change -At if you are not on New York time.
$script = Join-Path $PSScriptRoot 'morning.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$script`""
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday -At 8:30am
Register-ScheduledTask -TaskName 'Alphaline morning brief' -Action $action -Trigger $trigger -Description 'Facts brief + AI morning brief' -Force
Write-Host 'Scheduled. Remove it any time with: Unregister-ScheduledTask -TaskName "Alphaline morning brief"'
