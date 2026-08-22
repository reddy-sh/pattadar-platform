#!/usr/bin/env bash
# Point git at the repo's own hooks, so they are version controlled.
#
# .git/hooks is per-clone and invisible to review; .githooks is a directory in
# the tree that anyone can read in a diff. core.hooksPath is per-clone config,
# so this has to be run once per machine — it is deliberately not automatic.
#
#   scripts/install-git-hooks.sh            install
#   scripts/install-git-hooks.sh --status   what is wired up right now
#   scripts/install-git-hooks.sh --remove   unwire, leaving the files in place
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

case "${1:-install}" in
  --status)
    echo "core.hooksPath: $(git config core.hooksPath || echo '(unset — repo hooks are NOT active)')"
    echo "kill switch:    $([ -f .parity/OFF ] && echo 'ON — .parity/OFF exists, no sweeps will run' || echo 'off — sweeps will run')"
    echo "claude CLI:     $(command -v claude || echo 'MISSING — the hook exits quietly without it')"
    if [ -s .parity/ledger.jsonl ]; then
      echo "last sweeps:"
      tail -5 .parity/ledger.jsonl | sed 's/^/  /'
    else
      echo "last sweeps:    none yet"
    fi
    pending="$(git branch --list 'parity/ios-*' | tr -d ' *')"
    [ -n "$pending" ] && { echo "pending branches:"; printf '%s\n' "$pending" | sed 's/^/  /'; }
    exit 0
    ;;
  --remove)
    git config --unset core.hooksPath || true
    echo "unwired. .githooks/ is still there; re-run this script to wire it back."
    exit 0
    ;;
esac

git config core.hooksPath .githooks
chmod +x .githooks/* 2>/dev/null || true
mkdir -p .parity

echo "hooks installed — core.hooksPath = .githooks"
echo
echo "  post-commit  a web commit starts a background iOS parity sweep"
echo
echo "  stop it:      touch .parity/OFF"
echo "  start again:  rm .parity/OFF"
echo "  unwire:       scripts/install-git-hooks.sh --remove"
echo "  status:       scripts/install-git-hooks.sh --status"
echo
echo "Sweeps land on parity/ios-<sha> branches. Nothing is merged for you."
