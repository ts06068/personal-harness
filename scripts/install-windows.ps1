# Windows setup uses WSL2 Ubuntu. Run in local PowerShell, not an SSH shell.
[CmdletBinding()]
param(
    [ValidatePattern('^[A-Za-z0-9._-]+$')][string]$Distribution = 'Ubuntu-24.04',
    [ValidatePattern('^\d+\.\d+\.\d+(-[A-Za-z0-9.-]+)?$')][string]$Version = '0.3.1',
    [switch]$SkipFonts,
    [switch]$DryRun
)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$source = "https://raw.githubusercontent.com/ts06068/personal-harness/v$Version"
if ($DryRun) {
    Write-Output "Windows execution: WSL2 / $Distribution"
    Write-Output "Release: $Version; installer: $source/scripts/install.py"
    Write-Output 'Checks: WSL2, non-root Ubuntu user, Linux x86_64, Python 3.12+, Git, curl'
    Write-Output 'Installs: workspace inside WSL; per-user fonts and a separate Windows Terminal profile'
    Write-Output 'Existing distributions, terminal settings, projects and credentials are retained.'
    return
}
if ($env:OS -ne 'Windows_NT') { throw 'Run in local Windows PowerShell. The harness itself runs in WSL2.' }
if (-not (Get-Command wsl.exe -ErrorAction SilentlyContinue)) {
    throw 'Install WSL2 first: run wsl --install -d Ubuntu-24.04 in an administrator PowerShell, restart Windows if requested, create your Ubuntu user, then rerun this installer.'
}
# wsl.exe can emit UTF-16 text to a pipe; strip embedded NULs in Windows PowerShell.
$installed = ((& wsl.exe --list --quiet 2>$null) -join "`n").Replace([string][char]0, '')
if ($LASTEXITCODE -ne 0 -or -not ($installed -split "`n" | Where-Object { $_.Trim() -eq $Distribution })) {
    Write-Host "Installing $Distribution. Windows may request administrator permission or a restart."
    & wsl.exe --install --distribution $Distribution --no-launch
    if ($LASTEXITCODE -notin @(0, 3010)) { throw "WSL installation did not complete. Run wsl --install -d $Distribution in administrator PowerShell." }
    Write-Host "Open $Distribution once, create your Linux username/password, exit its shell, then rerun this installer. Restart Windows first if WSL requested it."
    return
}
$details = ((& wsl.exe --list --verbose) -join "`n").Replace([string][char]0, '')
if ($details -notmatch ('(?m)^\s*\*?\s*' + [regex]::Escape($Distribution) + '\s+.+\s+2\s*$')) {
    throw "This installer requires WSL2. Inspect wsl --list --verbose; convert the chosen distribution yourself if appropriate: wsl --set-version $Distribution 2"
}
$uid = ((& wsl.exe --distribution $Distribution --exec id -u) -join '').Trim()
if ($LASTEXITCODE -ne 0 -or $uid -eq '0') { throw 'Initialize Ubuntu with your regular Linux user first. Do not install the workspace as root.' }
$arch = ((& wsl.exe --distribution $Distribution --exec uname -m) -join '').Trim()
if ($arch -ne 'x86_64') { throw 'This release supports x64 Windows/WSL only; ARM64 runtime assets are not yet packaged.' }
& wsl.exe --distribution $Distribution --exec bash -lc 'command -v python3 && command -v git && command -v curl' | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host 'Installing Ubuntu prerequisites; sudo may ask for your Linux password.'
    & wsl.exe --distribution $Distribution --exec sudo apt-get update
    if ($LASTEXITCODE -ne 0) { throw 'Ubuntu package index update failed.' }
    & wsl.exe --distribution $Distribution --exec sudo apt-get install -y python3 git curl ca-certificates
    if ($LASTEXITCODE -ne 0) { throw 'Ubuntu prerequisites could not be installed.' }
}
# The URL/version are validated constants. No credentials or user paths enter shell code.
$linuxScript = @'
set -eu
task_installer=$(mktemp /tmp/ph-install-XXXXXX.py)
trap 'rm -f "$task_installer"' EXIT
curl -fsSL __SOURCE__/scripts/install.py -o "$task_installer"
python3 "$task_installer" --version __VERSION__
'@
$linuxScript = $linuxScript.Replace('__SOURCE__', $source).Replace('__VERSION__', $Version).Replace("`r`n", "`n")
$encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($linuxScript))
# No nested quote escaping across the Windows/WSL boundary. Setup needs no stdin.
& wsl.exe --distribution $Distribution --exec bash -lc "echo $encoded | base64 --decode | bash"
if ($LASTEXITCODE -ne 0) { throw 'Personal Harness installation in WSL failed. Fix the reported error and rerun; existing accounts remain in WSL.' }

$work = Join-Path ([IO.Path]::GetTempPath()) ('ph-windows-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work | Out-Null
try {
    if (-not $SkipFonts) {
        New-Item -ItemType Directory -Path (Join-Path $work 'scripts'), (Join-Path $work 'config') | Out-Null
        $fontInstaller = Join-Path $work 'scripts/install-fonts-windows.ps1'
        Invoke-WebRequest -UseBasicParsing -Uri "$source/scripts/install-fonts-windows.ps1" -OutFile $fontInstaller
        Invoke-WebRequest -UseBasicParsing -Uri "$source/config/fonts.json" -OutFile (Join-Path $work 'config/fonts.json')
        & $fontInstaller
    }
    # A fragment adds one profile without parsing or rewriting the user's settings.json.
    $fragmentDir = Join-Path $env:LOCALAPPDATA 'Microsoft\Windows Terminal\Fragments\personal-harness'
    New-Item -ItemType Directory -Path $fragmentDir -Force | Out-Null
    $profile = @{
        guid = '{70328344-88af-4e2b-960e-05b93798881c}'
        name = 'Personal Harness (WSL)'
        commandline = "wsl.exe --distribution $Distribution --cd ~"
        hidden = $false
        useAcrylic = $true
        opacity = 80
        background = '#101010'
        foreground = '#e5e5e5'
        font = @{ face = 'JetBrainsMono Nerd Font Mono'; size = 12 }
    }
    $json = @{ profiles = @($profile) } | ConvertTo-Json -Depth 6
    [IO.File]::WriteAllText((Join-Path $fragmentDir 'profiles.json'), $json, (New-Object Text.UTF8Encoding($false)))
} finally { Remove-Item -LiteralPath $work -Recurse -Force }
Write-Host ''
Write-Host 'Open Windows Terminal > Personal Harness (WSL). Restart the terminal if the profile is not visible.'
Write-Host 'Inside that Ubuntu tab: ~/.local/bin/ph login chatgpt; ~/.local/bin/ph login claude; ~/.local/bin/ph login gemini'
Write-Host 'Then create a project under ~/workspace and run ~/.local/bin/ph open /path/to/project.'
Write-Host 'WSL has its own accounts and files; existing server logins are not copied.'
