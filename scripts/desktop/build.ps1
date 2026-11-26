param(
    [string]$NodeLicense = (Join-Path $PSScriptRoot 'LICENSE.node.txt'),
    [switch]$ThirdEdition
)

$ErrorActionPreference = 'Stop'
$project = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$compiler = Join-Path ([Environment]::GetFolderPath('Windows')) 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$framework = Split-Path -Parent $compiler
$node = (Get-Command node.exe -ErrorAction Stop).Source
if ((& $node -p process.arch) -ne 'x64') { throw 'The desktop build requires an x64 Node.js runtime.' }
if (!(Test-Path -LiteralPath $compiler -PathType Leaf)) { throw 'The .NET Framework x64 compiler is required.' }
if (!(Test-Path -LiteralPath $NodeLicense -PathType Leaf)) { throw 'Provide the license for the bundled Node.js version.' }

Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$staging = Join-Path $tempRoot ('taehwa-build-' + [Guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($staging)
$payload = Join-Path $staging 'payload.zip'
$iconPath = Join-Path $staging 'workspace.ico'
$binary = Join-Path $staging 'workspace.exe'
$filename = if ($ThirdEdition) { '태화기업 업무자동화 3차.exe' } else { '태화기업 문서작업실.exe' }
$outputPath = Join-Path $project $filename

try {
    if ($ThirdEdition) {
        $site = Join-Path $staging 'public'
        & $node (Join-Path $project 'scripts/build-pages.mjs') $site / --v3-desktop
        if ($LASTEXITCODE -ne 0) { throw '3rd edition portal build failed.' }
    }
    $archive = [IO.Compression.ZipFile]::Open($payload, [IO.Compression.ZipArchiveMode]::Create)
    try {
        $appFiles = @('scripts/serve.mjs', 'server/index.mjs', 'server/generate.mjs')
        if (!$ThirdEdition) {
            $appFiles += @('public/index.html', 'public/styles.css', 'public/app.js', 'public/sw.js',
                'public/manifest.webmanifest', 'public/favicon.svg', 'public/icon-192.png', 'public/icon-512.png')
        }
        foreach ($relativePath in $appFiles) {
            [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                $archive, (Join-Path $project $relativePath), $relativePath)
        }
        if ($ThirdEdition) {
            foreach ($asset in Get-ChildItem -LiteralPath $site -Recurse -File) {
                $relativePath = $asset.FullName.Substring($staging.Length + 1).Replace('\', '/')
                [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $asset.FullName, $relativePath)
            }
        }
        [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $node, 'node.exe')
        [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $NodeLicense, 'LICENSE.node.txt')
    } finally {
        $archive.Dispose()
    }

    $png = [IO.File]::ReadAllBytes((Join-Path $project 'public/icon-192.png'))
    $icon = [IO.BinaryWriter]::new([IO.File]::Create($iconPath))
    try {
        $icon.Write([UInt16]0)
        $icon.Write([UInt16]1)
        $icon.Write([UInt16]1)
        $icon.Write([Byte[]](192, 192, 0, 0))
        $icon.Write([UInt16]1)
        $icon.Write([UInt16]32)
        $icon.Write([UInt32]$png.Length)
        $icon.Write([UInt32]22)
        $icon.Write($png)
    } finally {
        $icon.Dispose()
    }

    $sources = @(
        '/nologo', '/target:winexe', '/platform:x64', '/optimize+', '/codepage:65001',
        "/out:$binary", "/win32icon:$iconPath", "/resource:$payload,WorkspacePayload.zip",
        "/reference:$(Join-Path $framework 'System.IO.Compression.dll')",
        "/reference:$(Join-Path $framework 'System.IO.Compression.FileSystem.dll')",
        (Join-Path $PSScriptRoot 'Launcher.cs')
    )
    if ($ThirdEdition) { $sources += '/define:TAEHWA_V3' }
    & $compiler @sources
    if ($LASTEXITCODE -ne 0) { throw 'Windows executable compilation failed.' }
    Move-Item -LiteralPath $binary -Destination $outputPath -Force
    Get-Item -LiteralPath $outputPath
} finally {
    $resolvedStaging = (Resolve-Path -LiteralPath $staging).Path
    if ($resolvedStaging.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase)) {
        Remove-Item -LiteralPath $resolvedStaging -Recurse
    }
}
