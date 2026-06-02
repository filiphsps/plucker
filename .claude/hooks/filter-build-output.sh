#!/bin/bash
# Claude Code PreToolUse hook (Bash matcher): trims `pnpm build` (electron-vite
# / vite + tsc) output down to errors and the per-bundle "built in" markers.
#
# Same mechanism as filter-test-output.sh: rewrites the command as
#   set -o pipefail; { CMD ; } 2>&1 | awk <filter>
# so `pipefail` preserves the runner's exit code. The filter is default-KEEP, so
# every compile/type/rollup error survives; it only sheds vite progress noise
# (`transforming…`, `✓ N modules transformed`, `rendering chunks`, `computing
# gzip size`) and the per-chunk size table (`dist/… kB │ gzip: …`). The
# `✓ built in …`, `error during build`, type errors and pnpm failure markers are
# always kept, even past the line cap.
#
# Compound/piped/redirected, dev/watch, and non-build commands pass through.

set -u

command -v jq >/dev/null 2>&1 || { echo '{}'; exit 0; }

passthrough() { echo '{}'; exit 0; }

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')

[ -n "$cmd" ] || passthrough
case "$cmd" in *build-output-filter*) passthrough ;; esac
case "$cmd" in
    *'|'* | *'>'* | *'<'* | *'&&'* | *';'* | *'`'* | *'$('*) passthrough ;;
esac

# Skip dev/watch/preview — those never exit (or aren't a one-shot build).
printf '%s' "$cmd" | grep -Eq '(--watch|(^| )-w( |$)|(^| )(dev|preview)([ ]|$))' && passthrough

printf '%s' "$cmd" | grep -Eq '(^| )(pnpm|electron-vite|vite)( |$)' || passthrough
printf '%s' "$cmd" | grep -Eq '(^| )build(:[a-z:]+)?([ ]|$)' || passthrough

PROG=$(
    cat <<'AWK'
function strip(s){ gsub(ANSI, "", s); return s }
BEGIN{ CAP=400; n=0; ESC=sprintf("%c",27); ANSI=ESC "\\[[0-9;?]*[ -/]*[@-~]" }
{
  line=strip($0)
  is_sum = (line ~ /✓ built in /) \
        || (line ~ /(error TS[0-9]|: error( |:)|Type error:|Transform failed|Could not resolve|Cannot find module|error during build|RollupError|\[vite\]|\[plugin )/) \
        || (line ~ /(ELIFECYCLE|ERR_PNPM|run failed|exited \(|^[ \t]*ERROR)/) \
        || (line ~ /[0-9]+ (errors?|warnings?)([^a-zA-Z]|$)/)
  if (!is_sum) {
    if (line ~ /transforming \(|✓ [0-9]+ modules transformed/) next
    if (line ~ /(rendering chunks|computing gzip size)/) next
    if (line ~ /(^|[ \t])(dist|out|build)\/.* kB/) next
    if (line ~ /vite v[0-9].* building for/) next
    if (line ~ /^[ \t]*> /) next
  }
  if (line ~ /^[ \t]*$/) { if (lastblank) next; lastblank=1 } else lastblank=0
  buf[n]=line; sum[n]=is_sum; n++
}
END{
  if (n<=CAP){ for(i=0;i<n;i++) print buf[i]; exit }
  for(i=0;i<CAP;i++) print buf[i]
  print "... [build-output-filter] truncated " (n-CAP) " lines; summary kept below ..."
  for(i=CAP;i<n;i++) if(sum[i]) print buf[i]
}
AWK
)

filtered_cmd="set -o pipefail; { $cmd ; } 2>&1 | awk '$PROG'"

jq -n --arg cmd "$filtered_cmd" \
    '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"allow",updatedInput:{command:$cmd}}}'
