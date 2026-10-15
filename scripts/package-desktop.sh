#!/bin/sh
# Build on the target OS. Packages contain runtime files, never a developer database or credentials.
set -eu
cd "$(dirname "$0")/.."
root=$(pwd)
platform=$(uname -s)
case "$platform" in
    Darwin|Linux) ;;
    *) printf '%s\n' "Use scripts/package-desktop.ps1 on Windows." >&2; exit 1 ;;
esac
if command -v dotnet >/dev/null 2>&1; then
    dotnet=dotnet
elif [ -x "$HOME/.dotnet/dotnet" ]; then
    dotnet="$HOME/.dotnet/dotnet"
else
    printf '%s\n' "Install the .NET 10 SDK before packaging the password-change helper." >&2
    exit 1
fi
cargo build --release --bin bunyan
"$dotnet" publish tools/PasswordChange -c Release -o target/password-change
out="$root/target/desktop"
mkdir -p "$out"

if [ "$platform" = Darwin ]; then
    app="$out/Bunyan.app/Contents"
    mkdir -p "$app/MacOS" "$app/Resources/password-change" "$out/Bunyan.iconset"
    cp target/release/bunyan "$app/MacOS/bunyan-bin"
    cp -R target/password-change/. "$app/Resources/password-change/"
    cp packaging/macos/Info.plist "$app/Info.plist"
    cp packaging/macos/Bunyan "$app/MacOS/Bunyan"
    chmod +x "$app/MacOS/Bunyan"
    for size in 16 32 128 256 512; do
        sips -s format png -z "$size" "$size" assets/bunyan.jpeg --out "$out/Bunyan.iconset/icon_${size}x${size}.png" >/dev/null
        doubled=$((size * 2))
        sips -s format png -z "$doubled" "$doubled" assets/bunyan.jpeg --out "$out/Bunyan.iconset/icon_${size}x${size}@2x.png" >/dev/null
    done
    iconutil -c icns "$out/Bunyan.iconset" -o "$app/Resources/Bunyan.icns"
    codesign --force --sign - "$app/MacOS/bunyan-bin"
    codesign --force --sign - "$out/Bunyan.app"
    printf 'Built %s\n' "$out/Bunyan.app"
else
    mkdir -p "$out/Bunyan/password-change"
    cp target/release/bunyan "$out/Bunyan/bunyan"
    cp -R target/password-change/. "$out/Bunyan/password-change/"
    cp assets/bunyan.jpeg "$out/Bunyan/bunyan.jpeg"
    # Desktop Exec quoting differs from shell quoting; escape reserved characters in the absolute path.
    escaped=$(printf '%s' "$out/Bunyan" | sed 's/\\/\\\\/g; s/"/\\"/g; s/`/\\`/g; s/\$/\\$/g; s/%/%%/g')
    cat > "$out/Bunyan.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Bunyan
Comment=Local log dashboard
Exec="$escaped/bunyan"
Icon=$out/Bunyan/bunyan.jpeg
Terminal=false
Categories=Development;
EOF
    chmod +x "$out/Bunyan.desktop"
    printf 'Built %s\n' "$out/Bunyan.desktop"
fi
