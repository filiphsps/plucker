#!/bin/bash
# Claude Code PreToolUse hook (Bash matcher): enforce pnpm.
# CLAUDE.md mandates pnpm for everything; this blocks stray `npm`/`npx` before
# they run (and pollute the lockfile / node_modules). exit 2 denies the call and
# the message on stderr is shown back to the agent.
#
# Matches npm/npx only as a command (line start or after a shell separator),
# never when "npm" merely appears inside a word like "pnpm" or a string arg.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command')

if echo "$COMMAND" | grep -qE '(^|&&|\|\||;)\s*npm\s'; then
    echo "Blocked: use pnpm, not npm." >&2
    exit 2
fi

if echo "$COMMAND" | grep -qE '(^|&&|\|\||;)\s*npx\s'; then
    echo "Blocked: use 'pnpm dlx' (or 'pnpm exec' for local binaries), not npx." >&2
    exit 2
fi

exit 0
