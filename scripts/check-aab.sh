#!/bin/bash
# Checks a built Play App Bundle: the native ABIs it contains and (when bundletool is installed) its
# versionCode. Usage: scripts/check-aab.sh <file.aab> <expected-versionCode> <abi,abi,...>
set -euo pipefail

aab="${1:?usage: check-aab.sh <file.aab> <versionCode> <abis>}"
want_code="${2:?missing expected versionCode}"
abis="${3:?missing ABI list}"
bundletool="${BUNDLETOOL:-bundletool}"

[ -f "$aab" ] || { echo "check-aab: $aab not found" >&2; exit 1; }

# ABIs: every expected one is present, and no other ABI folder ships.
found=$(unzip -Z1 "$aab" | sed -n 's#^base/lib/\([^/]*\)/.*#\1#p' | sort -u | tr '\n' ',' | sed 's/,$//')
want=$(echo "$abis" | tr ',' '\n' | sort -u | tr '\n' ',' | sed 's/,$//')
if [ "$found" != "$want" ]; then
  echo "check-aab: ABI mismatch in $(basename "$aab"): bundle has [$found], expected [$want]" >&2
  exit 1
fi
echo "check-aab: ABIs ok ($found)"

# versionCode: needs bundletool (the manifest inside an .aab is protobuf, not readable with unzip).
if command -v "$bundletool" >/dev/null 2>&1; then
  got=$("$bundletool" dump manifest --bundle="$aab" --xpath=/manifest/@android:versionCode)
  if [ "$got" != "$want_code" ]; then
    echo "check-aab: versionCode is $got, expected $want_code" >&2
    exit 1
  fi
  echo "check-aab: versionCode ok ($got)"
else
  echo "check-aab: WARNING bundletool not found - versionCode NOT verified (expected $want_code)." >&2
  echo "           Install it (for example 'yay -S bundletool') or set BUNDLETOOL=/path/to/bundletool." >&2
fi
