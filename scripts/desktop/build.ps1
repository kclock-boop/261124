param(
    [string]$NodeLicense = (Join-Path $PSScriptRoot 'LICENSE.node.txt'),
    [switch]$ThirdEdition,
    [switch]$FourthEdition,
    [string]$RedactorSource,
    [string]$RedactorPython
)

$ErrorActionPreference = 'Stop'
if ($ThirdEdition -and $FourthEdition) { throw 'Select one edition.' }
if (([bool]$RedactorSource -ne [bool]$RedactorPython) -or ($RedactorSource -and !$FourthEdition)) {
    throw 'The private redactor requires both source and Python paths for edition four.'
}
$edition = if ($FourthEdition) { 4 } elseif ($ThirdEdition) { 3 } else { 2 }
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
$filename = if ($edition -ge 3) { "태화기업 업무자동화 $($edition)차.exe" } else { '태화기업 문서작업실.exe' }
$outputPath = Join-Path $project $filename

try {
    if ($edition -ge 3) {
        $site = Join-Path $staging 'public'
        $buildArgs = @($site, '/', "--v$edition-desktop")
        if ($RedactorSource) { $buildArgs += '--with-redactor' }
        & $node (Join-Path $project 'scripts/build-pages.mjs') @buildArgs
        if ($LASTEXITCODE -ne 0) { throw "Edition $edition portal build failed." }
    }
    $archive = [IO.Compression.ZipFile]::Open($payload, [IO.Compression.ZipArchiveMode]::Create)
    try {
        $appFiles = @('scripts/serve.mjs', 'server/index.mjs', 'server/generate.mjs', 'server/redactor.mjs')
        if ($edition -lt 3) {
            $appFiles += @('public/index.html', 'public/styles.css', 'public/app.js', 'public/sw.js',
                'public/manifest.webmanifest', 'public/favicon.svg', 'public/icon-192.png', 'public/icon-512.png')
        }
        foreach ($relativePath in $appFiles) {
            [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                $archive, (Join-Path $project $relativePath), $relativePath)
        }
        if ($edition -ge 3) {
            foreach ($asset in Get-ChildItem -LiteralPath $site -Recurse -File) {
                $relativePath = $asset.FullName.Substring($staging.Length + 1).Replace('\', '/')
                [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $asset.FullName, $relativePath)
            }
        }
        if ($RedactorSource) {
            $privateRoot = (Resolve-Path -LiteralPath $RedactorSource).Path
            $pythonRoot = (Resolve-Path -LiteralPath $RedactorPython).Path
            if (!(Test-Path -LiteralPath (Join-Path $pythonRoot 'python.exe') -PathType Leaf)) {
                throw 'The private tool runtime has no python.exe.'
            }
            [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                $archive, (Join-Path $PSScriptRoot 'run-redactor.py'), 'private-redactor/run.py')
            foreach ($name in @('app.py', 'core.py', 'workdoc.py', 'index.html')) {
                [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                    $archive, (Join-Path $privateRoot $name), ('private-redactor/app/' + $name))
            }
            $runtimeDirs = @('classifier', 'exporters', 'presets', 'readers', 'redactors', 'rules', 'static', '.local-deps')
            foreach ($folder in $runtimeDirs) {
                $subdirectory = Join-Path $privateRoot $folder
                foreach ($asset in Get-ChildItem -LiteralPath $subdirectory -Recurse -File -Force) {
                    $relative = $asset.FullName.Substring($privateRoot.Length + 1).Replace('\', '/')
                    if ($relative -match '(^|/)__pycache__/|\.pyc$' -or ($folder -eq 'presets' -and $asset.Extension -ne '.py')) { continue }
                    [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                        $archive, $asset.FullName, ('private-redactor/app/' + $relative))
                }
            }
            foreach ($asset in Get-ChildItem -LiteralPath $pythonRoot -Recurse -File -Force) {
                $relative = $asset.FullName.Substring($pythonRoot.Length + 1).Replace('\', '/')
                if ($relative -match '(^|/)__pycache__/|\.pyc$') { continue }
                [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                    $archive, $asset.FullName, ('private-redactor/python/' + $relative))
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
    if ($edition -ge 3) { $sources += "/define:TAEHWA_V$edition" }
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
