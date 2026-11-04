$ErrorActionPreference = 'Stop'
$taskSourceRoot = $PSScriptRoot
$taskRepositoryRoot = [IO.Path]::GetFullPath((Join-Path $taskSourceRoot '..\..'))
$taskRoot = Join-Path $taskRepositoryRoot 'build\native-qa'
$taskSigningKey = Join-Path $taskRepositoryRoot 'build\rolero-dev.jks'
New-Item -ItemType Directory -Force -Path $taskRoot | Out-Null
Copy-Item -LiteralPath (Join-Path $taskSourceRoot 'RoleroInstrumentation.java') -Destination (Join-Path $taskRoot 'RoleroInstrumentation.java') -Force
Copy-Item -LiteralPath (Join-Path $taskSourceRoot 'AndroidManifest.xml') -Destination (Join-Path $taskRoot 'AndroidManifest.xml') -Force
$taskSdk = 'C:\Users\bardiostudio\AppData\Local\Android\Sdk'
$taskTools = Join-Path $taskSdk 'build-tools\35.0.0'
$taskJava = 'C:\Program Files\Android\Android Studio\jbr\bin'
$taskAndroidJar = Join-Path $taskSdk 'platforms\android-35\android.jar'
$taskClasses = Join-Path $taskRoot 'classes'
$taskDex = Join-Path $taskRoot 'dex'
New-Item -ItemType Directory -Force -Path $taskClasses,$taskDex | Out-Null
function Invoke-QaTool([string]$Executable, [string[]]$Arguments) {
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) { throw "La preparación de la prueba falló: $Executable" }
}
Invoke-QaTool (Join-Path $taskTools 'aapt2.exe') @('link','-o',(Join-Path $taskRoot 'base.apk'),'-I',$taskAndroidJar,'--manifest',(Join-Path $taskRoot 'AndroidManifest.xml'),'--min-sdk-version','26','--target-sdk-version','35')
Invoke-QaTool (Join-Path $taskJava 'javac.exe') @('--release','8','-encoding','UTF-8','-classpath',$taskAndroidJar,'-d',$taskClasses,(Join-Path $taskRoot 'RoleroInstrumentation.java'))
Invoke-QaTool (Join-Path $taskJava 'jar.exe') @('cf',(Join-Path $taskRoot 'classes.jar'),'-C',$taskClasses,'.')
Invoke-QaTool (Join-Path $taskJava 'java.exe') @('-cp',(Join-Path $taskTools 'lib\d8.jar'),'com.android.tools.r8.D8','--lib',$taskAndroidJar,'--min-api','26','--output',$taskDex,(Join-Path $taskRoot 'classes.jar'))
Copy-Item -LiteralPath (Join-Path $taskRoot 'base.apk') -Destination (Join-Path $taskRoot 'unsigned.apk') -Force
Add-Type -AssemblyName System.IO.Compression.FileSystem
$taskArchive = [IO.Compression.ZipFile]::Open((Join-Path $taskRoot 'unsigned.apk'),[IO.Compression.ZipArchiveMode]::Update)
try { [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($taskArchive,(Join-Path $taskDex 'classes.dex'),'classes.dex',[IO.Compression.CompressionLevel]::Optimal) | Out-Null } finally { $taskArchive.Dispose() }
Invoke-QaTool (Join-Path $taskTools 'zipalign.exe') @('-f','-p','4',(Join-Path $taskRoot 'unsigned.apk'),(Join-Path $taskRoot 'aligned.apk'))
Invoke-QaTool (Join-Path $taskJava 'java.exe') @('-jar',(Join-Path $taskTools 'lib\apksigner.jar'),'sign','--ks',$taskSigningKey,'--ks-key-alias','rolero','--ks-pass','pass:rolero-local','--key-pass','pass:rolero-local','--out',(Join-Path $taskRoot 'Rolero-QA.apk'),(Join-Path $taskRoot 'aligned.apk'))
Invoke-QaTool (Join-Path $taskJava 'java.exe') @('-jar',(Join-Path $taskTools 'lib\apksigner.jar'),'verify',(Join-Path $taskRoot 'Rolero-QA.apk'))
Write-Output 'Prueba nativa preparada.'
