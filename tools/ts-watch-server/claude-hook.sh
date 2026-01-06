#!/bin/bash
# ts-watch-server hook for Claude Code
# Queries the TypeScript watch server for project-wide errors after edits

TS_WATCH_PORT="${TS_WATCH_PORT:-61235}"
TS_WATCH_URL="http://127.0.0.1:${TS_WATCH_PORT}"

# Read the hook input
input=$(cat)

# Parse the tool name and file path
tool_name=$(echo "$input" | jq -r '.tool_name // ""' 2>/dev/null) || tool_name=""
file_path=$(echo "$input" | jq -r '.tool_input.file_path // ""' 2>/dev/null) || file_path=""

# Only process Edit and Write tools
if [ "$tool_name" != "Edit" ] && [ "$tool_name" != "Write" ]; then
    exit 0
fi

# Only process TypeScript/JavaScript files
case "$file_path" in
    *.ts|*.tsx|*.js|*.jsx|*.mts|*.mjs)
        ;;
    *)
        exit 0
        ;;
esac

# Check if ts-watch-server is running
if ! curl -s --connect-timeout 1 "${TS_WATCH_URL}/health" > /dev/null 2>&1; then
    # Server not running, silently exit
    exit 0
fi

# Small delay to let tsgo detect the file change
sleep 0.3

# Query /diagnostics directly (doesn't wait for all watchers)
response=$(curl -s --max-time 5 "${TS_WATCH_URL}/diagnostics" 2>/dev/null)

if [ -z "$response" ]; then
    exit 0
fi

# Get error count
error_count=$(echo "$response" | jq -r '.errorCount // 0' 2>/dev/null)
ready=$(echo "$response" | jq -r '.ready // false' 2>/dev/null)

if [ "$error_count" = "0" ] || [ -z "$error_count" ]; then
    exit 0
fi

# Format errors for output (redirect to stderr for Claude Code hooks)
echo "" >&2
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
if [ "$ready" = "true" ]; then
    echo "TypeScript Project-Wide Errors ($error_count total)" >&2
else
    echo "TypeScript Project-Wide Errors ($error_count total) [some watchers still loading]" >&2
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
echo "" >&2

# Extract and format each error (limit to first 10)
echo "$response" | jq -r '
    .files | to_entries | .[0:10][] |
    .key as $file |
    .value[] |
    "[\(.code)] \($file | split("/") | .[-3:] | join("/")):\(.line):\(.column)"
    + "\n    " + .message
' >&2 2>/dev/null

remaining=$((error_count - 10))
if [ "$remaining" -gt 0 ]; then
    echo "" >&2
    echo "... and $remaining more error(s)" >&2
fi

echo "" >&2
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
echo "" >&2

# Exit with error code to signal issues
exit 2
