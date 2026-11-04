#!/bin/bash
# Builds a test App Bundle (x86_64 + arm64, versionCode 1), turns it into device APKs with
# `bundletool build-apks --local-testing` (so Play Asset Delivery packs are delivered locally, as Play would),
# signs them with the release key Gradle uses (so they can replace the installed app in place), and installs
# them on the connected device/emulator.
#
# Usage: scripts/aab-test.sh        (env: BUNDLETOOL, ANDROID_DIR, OUT_DIR)
set -euo pipefail

bundletool="${BUNDLETOOL:-bundletool}"
android_dir="${ANDROID_DIR:-android}"
out_dir="${OUT_DIR:-build_output}"
props="$android_dir/keystore.properties"
aab="$android_dir/app/build/outputs/bundle/release/app-release.aab"

command -v "$bundletool" >/dev/null || {
  echo "bundletool not found. Install it (for example 'yay -S bundletool') or set BUNDLETOOL=/path/to/bundletool." >&2
  exit 1
}
[ -f "$props" ] || {
  echo "$props not found: the test APKs must be signed with the release key so they can replace the installed app. Run 'make keystore' first." >&2
  exit 1
}

prop() { sed -n "s/^$1=//p" "$props" | head -1; }
store_file="$android_dir/app/$(prop storeFile)"
key_alias="$(prop keyAlias)"
[ -f "$store_file" ] || { echo "keystore $store_file not found" >&2; exit 1; }

(cd "$android_dir" && ./gradlew bundleRelease -PversionCode=1 \
  -PreactNativeArchitectures=x86_64,arm64-v8a -PabiFilters=x86_64,arm64-v8a)

mkdir -p "$out_dir"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
# Passwords go through files (first line), never through the command line.
prop storePassword > "$tmp/store"
prop keyPassword > "$tmp/key"
chmod 600 "$tmp/store" "$tmp/key"

"$bundletool" build-apks --bundle="$aab" --local-testing --overwrite --output="$out_dir/ojas-test.apks" \
  --ks="$store_file" --ks-pass="file:$tmp/store" --ks-key-alias="$key_alias" --key-pass="file:$tmp/key"
"$bundletool" install-apks --apks="$out_dir/ojas-test.apks"

# Keep this test bundle (x86_64, versionCode 1) away from the path a Play upload would pick up.
mv "$aab" "$out_dir/ojas-test.aab"
echo "Installed the test bundle. It is saved as $out_dir/ojas-test.aab (never upload this one)."
