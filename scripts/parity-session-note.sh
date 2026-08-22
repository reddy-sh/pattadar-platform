#!/usr/bin/env bash
# Tell a starting Claude session about parity sweeps waiting to be read.
#
# Wired as a SessionStart hook in .claude/settings.json. "Silently" must not
# become "invisibly": a branch nobody knows about is a branch nobody merges,
# and three weeks of unread sweeps is worse than no automation at all.
#
# Prints {} when there is nothing to say, so it is silent on a quiet repo.
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null || { printf '{}\n'; exit 0; }

branches="$(git branch --list 'parity/ios-*' --format='%(refname:short)' 2>/dev/null)"
[ -z "$branches" ] && { printf '{}\n'; exit 0; }

count="$(printf '%s\n' "$branches" | grep -c . )"
lines="$(printf '%s\n' "$branches" | sed 's/^/  · /')"

body="$count iOS parity sweep(s) are waiting to be reviewed. These were written
by a background agent after a web commit and have NOT been read by a human:

$lines

Read one with:  git log -p <branch> -- apps/ios docs/parity
Take it with:   git merge --no-ff <branch>
Drop it with:   git branch -D <branch>

The per-sweep report is docs/parity/<sha>.md on the branch. apps/ios/verify.sh
is still the founder's to run, by hand, before anything reaches the phone."

python3 - "$body" <<'PY'
import json, sys
print(json.dumps({
    "hookSpecificOutput": {
        "hookEventName": "SessionStart",
        "additionalContext": sys.argv[1],
    }
}))
PY
