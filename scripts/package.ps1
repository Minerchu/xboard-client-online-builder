param([string]$Destination)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not $Destination) { $Destination = Join-Path (Split-Path -Parent $projectRoot) 'xboard-unified-builder-baota.zip' }
$Destination = [IO.Path]::GetFullPath($Destination)
$temporaryZip = Join-Path ([IO.Path]::GetDirectoryName($Destination)) ('xboard-package-' + [guid]::NewGuid().ToString('N') + '.zip')
$archive = [IO.Compression.ZipFile]::Open($temporaryZip, [IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($file in Get-ChildItem -LiteralPath $projectRoot -Recurse -File -Force) {
        $relative = $file.FullName.Substring($projectRoot.Length + 1).Replace('\', '/')
        if ($relative -match '^(\.git/|android/data/|windows/builder/build-output/)' -or $relative -match '\.(jks|keystore|p12|pem|key)$' -or $relative -match '(^|/)\.env($|\.)' -or $relative -eq 'windows/builder/build-history.jsonl') { continue }
        if ($relative.StartsWith('android/private/') -and $relative -notin @('android/private/template.apk', 'android/private/apktool.jar')) { continue }
        $null = [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $file.FullName, 'xboard-unified-builder/' + $relative, [IO.Compression.CompressionLevel]::Optimal)
    }
} finally { $archive.Dispose() }
Move-Item -LiteralPath $temporaryZip -Destination $Destination -Force
Get-Item -LiteralPath $Destination | Select-Object FullName, Length
