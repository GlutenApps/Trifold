# Phone audio receiver helper (ADR 0007). Trifold's main process runs this hidden, in the
# Windows PowerShell 5.1 that ships with Windows, because it can call the WinRT API the
# "Bluetooth Audio Receiver" Store app is built on: Windows.Media.Audio.AudioPlaybackConnection.
# No native module, nothing to install.
#
# Main prepends `$Mode`, `$DeviceId` and `$ParentPid` before encoding the script.
#   list    - prints the paired phones Windows can receive audio from, then exits.
#   connect - opens the audio connection to $DeviceId and keeps it open until killed; the audio
#             only flows while this process holds the connection object. Reopens it when the
#             phone drops out and comes back. Exits when the parent process is gone.
# Every line on stdout is one JSON object: {"event":"devices",...} or {"event":"status",...}.

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Emit($Object) {
  [Console]::Out.WriteLine((ConvertTo-Json -InputObject $Object -Compress -Depth 4))
  [Console]::Out.Flush()
}

try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $methods = [System.WindowsRuntimeSystemExtensions].GetMethods()
  $asTaskOperation = ($methods | Where-Object {
      $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
      $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
    })[0]
  $asTaskAction = ($methods | Where-Object {
      $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
      $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction'
    })[0]

  function Await($Operation, $ResultType) {
    $task = $asTaskOperation.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
    $task.Wait(-1) | Out-Null
    return $task.Result
  }

  function AwaitAction($Action) {
    $task = $asTaskAction.Invoke($null, @($Action))
    $task.Wait(-1) | Out-Null
  }

  $null = [Windows.Media.Audio.AudioPlaybackConnection, Windows.Media.Audio, ContentType = WindowsRuntime]
  $null = [Windows.Media.Audio.AudioPlaybackConnectionOpenResult, Windows.Media.Audio, ContentType = WindowsRuntime]
  $null = [Windows.Devices.Enumeration.DeviceInformation, Windows.Devices.Enumeration, ContentType = WindowsRuntime]
  $null = [Windows.Devices.Enumeration.DeviceInformationCollection, Windows.Devices.Enumeration, ContentType = WindowsRuntime]
} catch {
  Emit @{ event = 'status'; state = 'failed'; detail = "This Windows cannot receive phone audio: $($_.Exception.Message)" }
  exit 3
}

if ($Mode -eq 'list') {
  $selector = [Windows.Media.Audio.AudioPlaybackConnection]::GetDeviceSelector()
  $found = Await ([Windows.Devices.Enumeration.DeviceInformation]::FindAllAsync($selector)) ([Windows.Devices.Enumeration.DeviceInformationCollection])
  $devices = @()
  foreach ($d in $found) { $devices += @{ id = $d.Id; name = $d.Name } }
  Emit @{ event = 'devices'; devices = $devices }
  exit 0
}

$connection = [Windows.Media.Audio.AudioPlaybackConnection]::TryCreateFromId($DeviceId)
if ($null -eq $connection) {
  Emit @{ event = 'status'; state = 'failed'; detail = 'Windows could not create an audio connection for this phone. Is it still paired?' }
  exit 2
}

function Open-Phone {
  try {
    AwaitAction ($connection.StartAsync())
    $result = Await ($connection.OpenAsync()) ([Windows.Media.Audio.AudioPlaybackConnectionOpenResult])
    $status = [string]$result.Status
    if ($status -eq 'Success') { return $null }
    switch ($status) {
      'RequestTimedOut' { return 'The phone did not answer. Is Bluetooth on and the phone nearby?' }
      'DeniedBySystem' { return 'Windows refused the connection. Another app may be receiving this phone already.' }
      default { return "Could not connect ($status)." }
    }
  } catch {
    return "Could not connect: $($_.Exception.Message)"
  }
}

function Parent-Alive {
  if (-not $ParentPid) { return $true }
  try { $null = Get-Process -Id $ParentPid -ErrorAction Stop; return $true } catch { return $false }
}

Emit @{ event = 'status'; state = 'connecting' }
$lastState = 'connecting'
$error_ = Open-Phone
if ($null -eq $error_) {
  Emit @{ event = 'status'; state = 'connected' }
  $lastState = 'connected'
} else {
  Emit @{ event = 'status'; state = 'failed'; detail = $error_ }
  $lastState = 'failed'
}

$nextRetry = [DateTime]::UtcNow
while (Parent-Alive) {
  Start-Sleep -Seconds 2
  $open = ([string]$connection.State) -eq 'Opened'
  if ($open) {
    if ($lastState -ne 'connected') {
      Emit @{ event = 'status'; state = 'connected' }
      $lastState = 'connected'
    }
    continue
  }
  if ($lastState -eq 'connected') {
    Emit @{ event = 'status'; state = 'reconnecting'; detail = 'The phone went away; waiting for it to come back.' }
    $lastState = 'reconnecting'
    $nextRetry = [DateTime]::UtcNow
  }
  if ([DateTime]::UtcNow -lt $nextRetry) { continue }
  $error_ = Open-Phone
  if ($null -eq $error_) {
    Emit @{ event = 'status'; state = 'connected' }
    $lastState = 'connected'
  } else {
    if ($lastState -ne 'reconnecting') {
      Emit @{ event = 'status'; state = 'reconnecting'; detail = $error_ }
      $lastState = 'reconnecting'
    }
    $nextRetry = [DateTime]::UtcNow.AddSeconds(8)
  }
}
Emit @{ event = 'status'; state = 'off'; detail = 'Trifold closed.' }
exit 0
