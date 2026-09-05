[CmdletBinding()]
param(
    [string] $GamePath = 'C:\SteamLibrary\steamapps\common\SCP Secret Laboratory',
    [string] $OutputPath = 'output\dump.cs',
    [int] $WarmupSeconds = 20,
    [int] $ProcessId = 0,
    [switch] $Attach
)

$ErrorActionPreference = 'Stop'

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))

function Resolve-ProjectPath {
    param([Parameter(Mandatory)][string] $Path)

    if ([System.IO.Path]::IsPathRooted($Path)) {
        return [System.IO.Path]::GetFullPath($Path)
    }

    return [System.IO.Path]::GetFullPath((Join-Path $projectRoot $Path))
}

$gameRoot = [System.IO.Path]::GetFullPath($GamePath)
$exePath = Join-Path $gameRoot 'SCPSL.exe'
$outputFile = Resolve-ProjectPath $OutputPath
$driverPath = Resolve-ProjectPath 'src\driver\runtime_dumper.py'

foreach ($requiredPath in @($exePath, $driverPath, (Resolve-ProjectPath 'src\il2cpp\runtime_dumper.js'))) {
    if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
        throw "Required file not found: $requiredPath"
    }
}

$python = Get-Command python -ErrorAction SilentlyContinue
if ($null -eq $python) {
    throw 'Python was not found on PATH.'
}

& $python.Source -c 'import frida' 2>$null
if ($LASTEXITCODE -ne 0) {
    throw 'The Python frida package is not installed. Run: python -m pip install frida-tools'
}

$arguments = @(
    $driverPath,
    '--exe', $exePath,
    '--output', $outputFile,
    '--warmup', $WarmupSeconds
)

if ($ProcessId -gt 0) {
    $arguments += @('--pid', $ProcessId)
} elseif ($Attach) {
    $arguments += '--attach'
} else {
    $arguments += '--spawn'
}

& $python.Source @arguments
if ($LASTEXITCODE -ne 0) {
    throw "Runtime dump failed with exit code $LASTEXITCODE"
}

$dumpFile = Get-Item -LiteralPath $outputFile
$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $outputFile).Hash
Write-Host 'Dump completed.'
Write-Host "Path: $($dumpFile.FullName)"
Write-Host "Size: $($dumpFile.Length) bytes"
Write-Host "SHA256: $hash"

