$ErrorActionPreference = 'Stop'

$sdk = $env:ANDROID_HOME
if (-not $sdk) { $sdk = [Environment]::GetEnvironmentVariable('ANDROID_HOME', 'User') }
if (-not $sdk) { $sdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$env:ANDROID_HOME = $sdk
$env:ANDROID_AVD_HOME = [Environment]::GetEnvironmentVariable('ANDROID_AVD_HOME', 'User')
if (-not $env:ANDROID_AVD_HOME) { throw 'Set ANDROID_AVD_HOME for your Windows user before running this script' }

$emulator = Join-Path $sdk 'emulator\emulator.exe'
$adb = Join-Path $sdk 'platform-tools\adb.exe'
if (-not (Test-Path $emulator) -or -not (Test-Path $adb)) { throw "Android SDK not found at $sdk" }
if (-not (Test-Path (Join-Path $env:ANDROID_AVD_HOME 'HaiHand_API33.ini'))) { throw 'HaiHand_API33 AVD not found' }

function Get-HaiHandEmulatorSerial {
    foreach ($device in (& $adb devices)) {
        if ($device -match '^(emulator-\d+)\s+device$') {
            $serial = $Matches[1]
            if ((& $adb -s $serial emu avd name 2>$null) -contains 'HaiHand_API33') {
                return $serial
            }
        }
    }
}

if (Get-HaiHandEmulatorSerial) {
    Write-Host 'HaiHand_API33 is already running.'
} else {
    Start-Process -FilePath $emulator -ArgumentList '-avd', 'HaiHand_API33' -WorkingDirectory (Split-Path $emulator) -WindowStyle Normal
    Write-Host 'Starting HaiHand_API33 with Quick Boot.'
}

Write-Host 'Waiting for Android to finish booting...'
$ready = $false
for ($i = 0; $i -lt 150; $i++) {
    $serial = Get-HaiHandEmulatorSerial
    if ($serial -and (& $adb -s $serial shell getprop sys.boot_completed).Trim() -eq '1') {
        $ready = $true
        break
    }
    Start-Sleep -Seconds 2
}
if (-not $ready) { throw 'HaiHand_API33 did not finish booting within 5 minutes' }

Push-Location (Join-Path $PSScriptRoot 'mobile')
try {
    Write-Host 'Starting Expo Go on HaiHand_API33...'
    & npx.cmd expo start --go --android
} finally {
    Pop-Location
}
