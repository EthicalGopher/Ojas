#!/usr/bin/env bash
# Android refuses to update an app with one signed by a different key (e.g. switching between
# the debug dev build and the release APK). This checks the installed app's certificate and
# uninstalls it only when it doesn't match the build we're about to install.
#
# Usage: scripts/ensure-signature.sh debug|release
set -euo pipefail

APP_ID="com.sankhyah.expocameratest"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KIND="${1:-debug}"

if [ "$KIND" = "release" ]; then
  PROPS="$ROOT/android/keystore.properties"
  if [ ! -f "$PROPS" ]; then KIND="debug"; fi
fi

if [ "$KIND" = "release" ]; then
  get() { grep "^$1=" "$PROPS" | cut -d= -f2-; }
  KEYSTORE="$ROOT/android/app/$(get storeFile)"; STOREPASS="$(get storePassword)"; ALIAS="$(get keyAlias)"
else
  KEYSTORE="$ROOT/android/app/debug.keystore"; STOREPASS="android"; ALIAS="androiddebugkey"
fi

if ! adb get-state >/dev/null 2>&1; then
  echo "No device connected - skipping signature check."; exit 0
fi

APK_PATH="$(adb shell pm path "$APP_ID" 2>/dev/null | head -1 | sed 's/^package://' | tr -d '\r')"
if [ -z "$APK_PATH" ]; then
  exit 0 # not installed, nothing to do
fi

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
adb pull "$APK_PATH" "$TMP/installed.apk" >/dev/null 2>&1

BUILD_TOOLS="$(ls -d "${ANDROID_HOME:-/opt/android-sdk}"/build-tools/* | sort -V | tail -1)"
installed="$("$BUILD_TOOLS/apksigner" verify --print-certs "$TMP/installed.apk" | grep -m1 'SHA-256 digest' | awk '{print $NF}')"
expected="$(keytool -exportcert -keystore "$KEYSTORE" -storepass "$STOREPASS" -alias "$ALIAS" 2>/dev/null | sha256sum | awk '{print $1}')"

if [ "$installed" != "$expected" ]; then
  echo "Installed app is signed with a different key than this $KIND build."
  echo "Uninstalling $APP_ID so the $KIND build can be installed (app data on the device is cleared)."
  adb uninstall "$APP_ID" >/dev/null
fi
