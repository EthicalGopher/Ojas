#!/usr/bin/env bash
# Turns render_arena.py output into the app's arena assets: H.264 loops for the crowd shots and
# JPEG stills for the stage close-ups and the heroes-on-stage shots (android/app/src/main/assets/web/arena/).
set -euo pipefail
SRC=${1:?usage: encode_plates.sh <render_dir> [dest]}
DEST=${2:-android/app/src/main/assets/web/arena}
mkdir -p "$DEST"
for shot in crowd wide; do
  [ -d "$SRC/$shot" ] || continue
  ffmpeg -y -loglevel error -framerate 24 -i "$SRC/$shot/%04d.png" \
    -c:v libx264 -preset slow -crf 21 -pix_fmt yuv420p -profile:v high -movflags +faststart "$DEST/$shot.mp4"
done
# stills: the stage plates (you, rival, both) and, from --athletes, the shots with the heroes on stage
for still in "$SRC"/*.png; do
  [ -f "$still" ] || continue
  ffmpeg -y -loglevel error -i "$still" -q:v 3 "$DEST/$(basename "${still%.png}").jpg"
done
ls -la "$DEST"
