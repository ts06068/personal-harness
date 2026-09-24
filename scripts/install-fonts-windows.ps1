# Run in LOCAL Windows PowerShell, not in an SSH/WSL/container shell.
# Installs only the current user's fonts. Terminal preferences remain yours.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'Run this script on your Windows desktop.' }
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$work = Join-Path ([IO.Path]::GetTempPath()) ('ph-fonts-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work | Out-Null
try {
    $manifestPath = Join-Path $work 'fonts.json'
    $localManifest = Join-Path $PSScriptRoot '../config/fonts.json'
    if (Test-Path $localManifest) {
        Copy-Item $localManifest $manifestPath
    } else {
        Invoke-WebRequest -UseBasicParsing -Uri 'https://raw.githubusercontent.com/ts06068/personal-harness/main/config/fonts.json' -OutFile $manifestPath
    }
    $expectedManifestHash = 'c06f4638388bdbd3a33b185ecc880c0c17455177de539a9531d9b16ab781afc4'
    # A Windows Git checkout may use CRLF; the pinned manifest is UTF-8 with LF.
    $manifestText = [IO.File]::ReadAllText($manifestPath).Replace("`r`n", "`n")
    $manifestHasher = [Security.Cryptography.SHA256]::Create()
    try {
        $manifestHash = [BitConverter]::ToString($manifestHasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($manifestText))).Replace('-', '').ToLowerInvariant()
    } finally { $manifestHasher.Dispose() }
    if ($manifestHash -ne $expectedManifestHash) {
        throw 'Font manifest checksum mismatch. Download the current installer from the repository.'
    }
    $manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
    $fonts = @($manifest.files | Where-Object { -not $_.emoji })
    foreach ($font in $fonts) {
        $download = Join-Path $work $font.file
        Write-Host ('Downloading ' + $font.file)
        Invoke-WebRequest -UseBasicParsing -Uri $font.url -OutFile $download
        if ((Get-FileHash $download -Algorithm SHA256).Hash.ToLowerInvariant() -ne $font.sha256) {
            throw ('Font checksum mismatch: ' + $font.file)
        }
    }

    if (-not ('PersonalHarness.FontInstall' -as [type])) {
        Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
namespace PersonalHarness {
    public static class FontInstall {
        [DllImport("gdi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        public static extern int AddFontResourceEx(string name, uint flags, IntPtr reserved);
        [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        public static extern IntPtr SendMessageTimeout(IntPtr hwnd, uint msg, UIntPtr wparam,
            IntPtr lparam, uint flags, uint timeout, out UIntPtr result);
    }
}
'@
    }
    $fontDirectory = Join-Path $env:LOCALAPPDATA 'Microsoft\Windows\Fonts'
    New-Item -ItemType Directory -Path $fontDirectory -Force | Out-Null
    $registry = 'HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Fonts'
    if (-not (Test-Path $registry)) { New-Item -Path $registry -Force | Out-Null }
    foreach ($font in $fonts) {
        $target = Join-Path $fontDirectory $font.file
        $same = (Test-Path $target) -and ((Get-FileHash $target -Algorithm SHA256).Hash.ToLowerInvariant() -eq $font.sha256)
        if (-not $same) { Copy-Item (Join-Path $work $font.file) $target -Force }
        if ($font.file.EndsWith('.ttf')) {
            $style = $font.file -replace '^JetBrainsMonoNerdFontMono-', '' -replace '\.ttf$', '' -replace 'BoldItalic', 'Bold Italic'
            New-ItemProperty -Path $registry -Name ($manifest.terminal_family + ' ' + $style + ' (TrueType)') -PropertyType String -Value $target -Force | Out-Null
            $added = [PersonalHarness.FontInstall]::AddFontResourceEx($target, 0, [IntPtr]::Zero)
            if ($added -eq 0) { throw ('Windows could not activate ' + $font.file + '; restart Windows and retry if necessary.') }
            Write-Host ('Installed ' + $font.file)
        }
    }
    [UIntPtr]$result = [UIntPtr]::Zero
    [void][PersonalHarness.FontInstall]::SendMessageTimeout([IntPtr]0xffff, 0x001d, [UIntPtr]::Zero, [IntPtr]::Zero, 2, 1000, [ref]$result)
    Write-Host ''
    Write-Host ('Select this terminal font: ' + $manifest.terminal_family)
    Write-Host 'VS Code: Settings > Terminal > Integrated: Font Family'
    Write-Host "  'JetBrainsMono Nerd Font Mono', 'Segoe UI Emoji', monospace"
    Write-Host 'Windows Terminal: Settings > your SSH/PowerShell profile > Appearance > Font face'
    Write-Host 'Windows supplies Segoe UI Emoji; no separate emoji download is needed.'
    Write-Host 'Close and reopen VS Code / Windows Terminal after saving your work.'
} finally {
    Remove-Item -LiteralPath $work -Recurse -Force
}
