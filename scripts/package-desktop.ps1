# Run on Windows with the Rust MSVC toolchain and .NET 10 SDK.
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
cargo build --release --bin bunyan
if ($LASTEXITCODE -ne 0) { throw "Rust build failed." }
dotnet publish tools/PasswordChange -c Release -o target/password-change
if ($LASTEXITCODE -ne 0) { throw "Password-helper publish failed." }
$out = Join-Path (Get-Location) "target/desktop/Bunyan"
New-Item -ItemType Directory -Force -Path $out | Out-Null
Copy-Item target/release/bunyan.exe $out
$helper = Join-Path $out "password-change"
New-Item -ItemType Directory -Force -Path $helper | Out-Null
Copy-Item target/password-change/* $helper -Recurse -Force
# The shortcut uses Paul's artwork; the executable stays a console binary so CLI commands still work.
Add-Type -AssemblyName System.Drawing
$image = [System.Drawing.Image]::FromFile((Join-Path (Get-Location) "assets/bunyan.jpeg"))
$bitmap = [System.Drawing.Bitmap]::new($image, 256, 256)
$handle = $bitmap.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($handle)
$stream = [System.IO.File]::Create((Join-Path $out "Bunyan.ico"))
try { $icon.Save($stream) }
finally { $stream.Dispose(); $icon.Dispose(); $bitmap.Dispose(); $image.Dispose() }
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class BunyanIcon { [DllImport("user32.dll")] public static extern bool DestroyIcon(IntPtr handle); }'
[BunyanIcon]::DestroyIcon($handle) | Out-Null
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut((Join-Path (Split-Path $out) "Bunyan.lnk"))
$shortcut.TargetPath = Join-Path $out "bunyan.exe"
$shortcut.WorkingDirectory = $out
$shortcut.IconLocation = Join-Path $out "Bunyan.ico"
$shortcut.WindowStyle = 7
$shortcut.Save()
Write-Host "Built $(Join-Path (Split-Path $out) 'Bunyan.lnk')"
