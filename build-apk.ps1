param(
    [string]$AndroidSdk = "$env:USERPROFILE\AppData\Local\Android\Sdk",
    [string]$JavaHome = 'C:\Program Files\Android\Android Studio\jbr',
    [switch]$Debug
)
$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$buildRoot = Join-Path $projectRoot 'build'
$distributionRoot = Join-Path $projectRoot 'dist'
$appRoot = Join-Path $projectRoot 'app\src\main'
$toolsRoot = Join-Path $AndroidSdk 'build-tools\35.0.0'
$androidJar = Join-Path $AndroidSdk 'platforms\android-35\android.jar'
$javaBin = Join-Path $JavaHome 'bin'
foreach ($requiredPath in @((Join-Path $javaBin 'java.exe'), (Join-Path $javaBin 'javac.exe'), (Join-Path $toolsRoot 'aapt2.exe'), $androidJar, (Join-Path $appRoot 'assets\index.html'))) {
    if (-not (Test-Path -LiteralPath $requiredPath)) { throw "No se encontro: $requiredPath" }
}
New-Item -ItemType Directory -Force -Path $buildRoot,$distributionRoot | Out-Null
# Generated intermediates are replaced individually; the signing key remains stable.
$classesRoot = Join-Path $buildRoot 'classes'
$generatedRoot = Join-Path $buildRoot 'generated'
$dexRoot = Join-Path $buildRoot 'dex'
foreach ($directory in @($classesRoot,$generatedRoot,$dexRoot)) { New-Item -ItemType Directory -Force -Path $directory | Out-Null }
function Invoke-Checked([string]$Executable, [string[]]$Arguments) {
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Fallo $Executable (codigo $LASTEXITCODE)" }
}
$compiledResources = Join-Path $buildRoot 'resources.zip'
$baseApk = Join-Path $buildRoot 'rolero-base.apk'
$unsignedApk = Join-Path $buildRoot 'rolero-unsigned.apk'
$alignedApk = Join-Path $buildRoot 'rolero-aligned.apk'
$outputApk = Join-Path $distributionRoot $(if ($Debug) { 'Rolero-debug.apk' } else { 'Rolero.apk' })
[xml]$manualManifest = Get-Content -LiteralPath (Join-Path $appRoot 'AndroidManifest.xml') -Raw
$manualManifest.DocumentElement.SetAttribute('package', 'mx.rolero.app')
$manualManifest.manifest.application.SetAttribute('debuggable', 'http://schemas.android.com/apk/res/android', $Debug.IsPresent.ToString().ToLowerInvariant())
$manualManifestPath = Join-Path $buildRoot 'AndroidManifest-manual.xml'
$manualManifest.Save($manualManifestPath)
Invoke-Checked (Join-Path $toolsRoot 'aapt2.exe') @('compile','--dir',(Join-Path $appRoot 'res'),'-o',$compiledResources)
Invoke-Checked (Join-Path $toolsRoot 'aapt2.exe') @('link','-o',$baseApk,'-I',$androidJar,'--manifest',$manualManifestPath,'-A',(Join-Path $appRoot 'assets'),'--java',$generatedRoot,'--min-sdk-version','26','--target-sdk-version','35',$compiledResources)
$javaSources = @(Get-ChildItem -LiteralPath (Join-Path $appRoot 'java'),$generatedRoot -Filter '*.java' -Recurse | ForEach-Object FullName)
Invoke-Checked (Join-Path $javaBin 'javac.exe') (@('--release','8','-encoding','UTF-8','-classpath',$androidJar,'-d',$classesRoot) + $javaSources)
$classesJar = Join-Path $buildRoot 'classes.jar'
Invoke-Checked (Join-Path $javaBin 'jar.exe') @('cf',$classesJar,'-C',$classesRoot,'.')
Invoke-Checked (Join-Path $javaBin 'java.exe') @('-cp',(Join-Path $toolsRoot 'lib\d8.jar'),'com.android.tools.r8.D8','--lib',$androidJar,'--min-api','26','--output',$dexRoot,$classesJar)
Copy-Item -LiteralPath $baseApk -Destination $unsignedApk -Force
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::Open($unsignedApk,[System.IO.Compression.ZipArchiveMode]::Update)
try {
    foreach ($dexFile in (Get-ChildItem -LiteralPath $dexRoot -Filter '*.dex')) {
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,$dexFile.FullName,$dexFile.Name,[System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
} finally { $archive.Dispose() }
Invoke-Checked (Join-Path $toolsRoot 'zipalign.exe') @('-f','-p','4',$unsignedApk,$alignedApk)
$keyStore = Join-Path $buildRoot 'rolero-dev.jks'
if (-not (Test-Path -LiteralPath $keyStore)) {
    Invoke-Checked (Join-Path $javaBin 'keytool.exe') @('-genkeypair','-keystore',$keyStore,'-storepass','rolero-local','-keypass','rolero-local','-alias','rolero','-keyalg','RSA','-keysize','2048','-validity','10000','-dname','CN=Rolero Local, OU=Development, O=Rolero, C=MX','-storetype','JKS')
}
$signerJar = Join-Path $toolsRoot 'lib\apksigner.jar'
Invoke-Checked (Join-Path $javaBin 'java.exe') @('-jar',$signerJar,'sign','--ks',$keyStore,'--ks-key-alias','rolero','--ks-pass','pass:rolero-local','--key-pass','pass:rolero-local','--out',$outputApk,$alignedApk)
Invoke-Checked (Join-Path $javaBin 'java.exe') @('-jar',$signerJar,'verify','--verbose',$outputApk)
Invoke-Checked (Join-Path $toolsRoot 'zipalign.exe') @('-c','-p','4',$outputApk)
Write-Host "APK listo: $outputApk"
Get-FileHash -LiteralPath $outputApk -Algorithm SHA256 | Format-List
