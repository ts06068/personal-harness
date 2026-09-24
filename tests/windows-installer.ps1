# Exercises PowerShell control flow with a mocked WSL executable. No WSL is installed.
$ErrorActionPreference = 'Stop'
$installer = Join-Path $PSScriptRoot '../scripts/install-windows.ps1'
$tokens = $null; $errors = $null
[void][Management.Automation.Language.Parser]::ParseFile($installer, [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw ($errors | Out-String) }
$preview = & $installer -DryRun
if (($preview -join ' ') -notmatch 'WSL2') { throw 'Preview omitted WSL requirement.' }
$invalidRejected = $false
try { & $installer -DryRun -Distribution 'Ubuntu;echo invalid' } catch { $invalidRejected = $true }
if (-not $invalidRejected) { throw 'Distribution input was not validated.' }

$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('ph-windows-test-' + [guid]::NewGuid().ToString('N'))
$oldOS = $env:OS; $oldLocal = $env:LOCALAPPDATA
$global:PhInstallerTestCalls = @(); $global:PhInstallerTestScenario = 'ready'
$global:PhInstallerTestDownloads = @()
function global:Invoke-WebRequest {
    param([string]$Uri, [string]$OutFile, [switch]$UseBasicParsing)
    $global:PhInstallerTestDownloads += $Uri
    if ($OutFile.EndsWith('.ps1')) {
        Set-Content $OutFile 'if (-not (Test-Path (Join-Path $PSScriptRoot "../config/fonts.json"))) { throw "Missing pinned font manifest" }'
    } else { Set-Content $OutFile '{}' }
}
function global:wsl.exe {
    $global:PhInstallerTestCalls += ,@($args)
    $global:LASTEXITCODE = 0
    if ($args[0] -eq '--list' -and $args[1] -eq '--quiet') { if ($global:PhInstallerTestScenario -ne 'missing') { "Ubuntu-24.04`0" }; return }
    if ($args[0] -eq '--list') { if ($global:PhInstallerTestScenario -eq 'wsl1') { '* Ubuntu-24.04 Running 1' } else { '* Ubuntu-24.04 Running 2' }; return }
    if ($args -contains 'id') { if ($global:PhInstallerTestScenario -eq 'root') { '0' } else { '1000' }; return }
    if ($args -contains 'uname') { 'x86_64'; return }
    if ($global:PhInstallerTestScenario -eq 'failed-setup' -and ($args -join ' ') -match 'base64 --decode') { $global:LASTEXITCODE = 1 }
}
try {
    $env:OS = 'Windows_NT'; $env:LOCALAPPDATA = $testRoot
    New-Item -ItemType Directory -Path $testRoot | Out-Null
    $settings = Join-Path $testRoot 'settings.json'; Set-Content $settings 'EXISTING_USER_SETTINGS'
    & $installer
    if ($global:PhInstallerTestDownloads.Count -ne 2 -or ($global:PhInstallerTestDownloads | Where-Object { $_ -notmatch '/v0\.3\.0/' })) { throw 'Font files did not come from the selected release.' }
    $profileFile = Join-Path $testRoot 'Microsoft/Windows Terminal/Fragments/personal-harness/profiles.json'
    $profile = Get-Content $profileFile -Raw | ConvertFrom-Json
    if ($profile.profiles[0].commandline -ne 'wsl.exe --distribution Ubuntu-24.04 --cd ~') { throw 'Incorrect terminal profile command.' }
    if (-not $profile.profiles[0].useAcrylic -or $profile.profiles[0].opacity -ne 80) { throw 'Missing acrylic settings.' }
    if ((Get-Content $settings).Trim() -ne 'EXISTING_USER_SETTINGS') { throw 'User terminal settings were modified.' }
    Remove-Item $profileFile
    foreach ($case in @('wsl1', 'root', 'failed-setup')) {
        $global:PhInstallerTestScenario = $case; $rejected = $false
        try { & $installer -SkipFonts } catch { $rejected = $true }
        if (-not $rejected -or (Test-Path $profileFile)) { throw "Unsafe continuation: $case" }
    }
    $global:PhInstallerTestScenario = 'missing'; & $installer -SkipFonts
    if (Test-Path $profileFile) { throw 'Installer claimed completion before Ubuntu user setup.' }
    if (($global:PhInstallerTestCalls | ForEach-Object { $_ -join ' ' }) -match '--shutdown|--unregister|--set-default') { throw 'Installer changed unrelated WSL state.' }
    Write-Output 'WINDOWS_INSTALLER_FLOW_OK (WSL mocked; no actual Windows/WSL execution)'
} finally {
    $env:OS = $oldOS; $env:LOCALAPPDATA = $oldLocal
    Remove-Item Function:\wsl.exe
    Remove-Item Function:\Invoke-WebRequest
    Remove-Variable PhInstallerTestCalls, PhInstallerTestScenario, PhInstallerTestDownloads -Scope Global
    Remove-Item $testRoot -Recurse -Force
}
