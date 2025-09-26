#!/usr/bin/env bash
# Compare getBookStringified.ts files between two folder trees.
# Only prints output for files that differ or are missing.

set -eu

LEFT_DIR="${1%/}"
RIGHT_DIR="${2%/}"

while IFS= read -r -d '' left_file; do
  slug="$(basename "$(dirname "$left_file")")"
  right_file="${RIGHT_DIR}/${slug}/getBookStringified.ts"

  if [ ! -f "$right_file" ]; then
    echo "===== ${slug}/getBookStringified.ts is MISSING on right side ====="
    continue
  fi

  if ! diff -q "$left_file" "$right_file" >/dev/null; then
    echo ""
    echo "===== Differences in ${slug}/getBookStringified.ts ====="
    diff -u "$left_file" "$right_file"
  fi

done < <(find "$LEFT_DIR" -type f -name 'getBookStringified.ts' -print0 | sort -z)
