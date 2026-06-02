#!/bin/bash
# Claude Code PreToolUse hook (Bash matcher): trims `pnpm typecheck` (tsc
# --noEmit) output down to type errors and the run summary.
#
# Same mechanism as filter-test-output.sh: rewrites the command as
#   set -o pipefail; { CMD ; } 2>&1 | awk <filter>
# so `pipefail` preserves the runner's exit code. The filter is default-KEEP, so
# every `error TS…` line and pnpm failure marker survives; it only sheds pnpm's
# lifecycle chatter (the `> pkg@ver typecheck` / `> tsc …` script echoes). The
# `Found N errors` / `ELIFECYCLE` summary is always kept, even past the line cap.
#
# Plucker runs `pnpm typecheck` (= typecheck:node && typecheck:web), or each
# leg directly. The && lives inside the package.json script, so the command the
# agent runs has no separator and is not treated as compound here.
#
# Compound/piped/redirected and non-typecheck commands pass through untouched.

set -u

command -v jq >/dev/null 2>&1 || { echo '{}'; exit 0; }

passthrough() { echo '{}'; exit 0; }

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')

[ -n "$cmd" ] || passthrough
case "$cmd" in *typecheck-output-filter*) passthrough ;; esac
case "$cmd" in
    *'|'* | *'>'* | *'<'* | *'&&'* | *';'* | *'`'* | *'$('*) passthrough ;;
esac

# Skip watch mode (`tsc --watch`) — it never exits.
printf '%s' "$cmd" | grep -Eq '(--watch|(^| )-w( |$))' && passthrough

printf '%s' "$cmd" | grep -Eq '(^| )(pnpm|tsc)( |$)' || passthrough
printf '%s' "$cmd" | grep -Eq '(^| )typecheck(:[a-z]+)?([ ]|$)|(^| )tsc([ =]|$)' || passthrough

PROG=$(
    cat <<'AWK'
function strip(s){ gsub(ANSI, "", s); return s }
BEGIN{ CAP=500; n=0; ESC=sprintf("%c",27); ANSI=ESC "\\[[0-9;?]*[ -/]*[@-~]" }
{
  line=strip($0)
  is_sum = (line ~ /error TS[0-9]/) \
        || (line ~ /: error( |:)/) \
        || (line ~ /(ELIFECYCLE|run failed|exited \(|^[ \t]*ERROR)/) \
        || (line ~ /Found [0-9]+ error/) \
        || (line ~ /[0-9]+ (errors?|warnings?)([^a-zA-Z]|$)/)
  if (!is_sum) {
    if (line ~ /^[ \t]*> /) next
    if (line ~ /^[ \t]*\$ /) next
  }
  if (line ~ /^[ \t]*$/) { if (lastblank) next; lastblank=1 } else lastblank=0
  buf[n]=line; sum[n]=is_sum; n++
}
END{
  if (n<=CAP){ for(i=0;i<n;i++) print buf[i]; exit }
  for(i=0;i<CAP;i++) print buf[i]
  print "... [typecheck-output-filter] truncated " (n-CAP) " lines; summary kept below ..."
  for(i=CAP;i<n;i++) if(sum[i]) print buf[i]
}
AWK
)

filtered_cmd="set -o pipefail; { $cmd ; } 2>&1 | awk '$PROG'"

jq -n --arg cmd "$filtered_cmd" \
    '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"allow",updatedInput:{command:$cmd}}}'
