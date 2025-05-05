#!/usr/bin/env bash
#
# make-boomerang – batch-process MP4s with boomerang-gemini-fade.py
# Usage:
#   ./make-boomerang *.mp4              # current dir
#   ./make-boomerang path/to/*.mp4      # any path pattern
#   ./make-boomerang video1.mp4 …       # explicit files
#
# Options passed to boomerang-gemini-fade.py:
#   -s 1.5   # slow-down factor
#   -f 0.8   # fade-in/out fraction
#   -q 20    # output quality

set -euo pipefail

# Bail if no arguments were supplied
if [ "$#" -eq 0 ]; then
  echo "Usage: $0 <file1.mp4> [file2.mp4 …]" >&2
  exit 1
fi

for f in "$@"; do
  # Skip if the argument doesn’t end in .mp4
  if [[ "$f" != *.mp4 ]]; then
    echo "Skipping non-MP4: $f" >&2
    continue
  fi

  # Verify the file exists before processing
  if [ ! -f "$f" ]; then
    echo "File not found: $f" >&2
    continue
  fi

  out="${f%.mp4}-slow-fade-sw-q20.mp4"
  echo "▶︎ Processing $f → $out"

  python3 boomerang-gemini-fade.py \
    -i "$f" \
    -o "$out" \
    -s 1.5 \
    -f 0.8 \
    -q 20
done
