#!/bin/zsh
# Record the whole screen (macOS, Retina, 30 fps) until stopped with: pkill -INT -f "avfoundation"
# Usage: rec.sh <out.mp4> [screen device index]   (list devices: ffmpeg -f avfoundation -list_devices true -i "")
# Logs its start time (epoch seconds) to take.log next to this script, so the edit can place sounds exactly.
out="$1"
dev="${2:-${SCREEN:-1}}"
[[ -z "$out" ]] && { echo "usage: rec.sh <out.mp4> [screen device index]"; exit 2; }
log="$(dirname "$0")/take.log"
python3 -c "import time; print(f'{time.time():.3f} rec-start $out')" >> "$log"
# -g 30 -bf 0: short GOPs without B-frames, so held-frame seeks in Remotion are exact.
exec ffmpeg -hide_banner -loglevel error -y -f avfoundation -capture_cursor 1 -framerate 30 -i "${dev}:none" \
  -c:v libx264 -preset veryfast -crf 18 -g 30 -bf 0 -pix_fmt yuv420p "$out"
