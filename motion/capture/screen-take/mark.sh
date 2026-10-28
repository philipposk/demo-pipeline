#!/bin/zsh
# Log a milestone of the take (the agent answered, the deploy landed) to take.log, in epoch seconds.
# Usage: mark.sh <name>
log="$(dirname "$0")/take.log"
python3 -c "import time, sys; print(f'{time.time():.3f} mark {sys.argv[1]}')" "${1:-mark}" >> "$log"
