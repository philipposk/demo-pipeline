#!/bin/zsh
# Play one pre-recorded clip through the speakers (macOS afplay) and log its start and end (epoch seconds) to take.log.
# Usage: play.sh <clip.wav> [name]
f="$1"
name="${2:-$(basename "$f" .wav)}"
[[ -f "$f" ]] || { echo "no such clip: $f"; exit 2; }
log="$(dirname "$0")/take.log"
python3 -c "import time; print(f'{time.time():.3f} play $name')" >> "$log"
afplay -v 1.0 "$f"
python3 -c "import time; print(f'{time.time():.3f} end $name')" >> "$log"
