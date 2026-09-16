#!/usr/bin/env bash
# One parity sweep: adapt a finished web commit into apps/ios, in the background.
#
# Called detached by .githooks/post-commit. Safe to run by hand:
#   scripts/ios-parity-sync.sh <sha>
#
# The founder's working tree is NEVER touched. Each sweep gets a throwaway git
# worktree outside the repo, commits to parity/ios-<short>, and leaves the
# branch behind to be read and merged — because a second Claude session owns
# apps/ios, and a background agent writing those files under it would clobber
# its file state.
set -uo pipefail

# git exports its own environment into hook processes — GIT_INDEX_FILE and
# GIT_DIR as RELATIVE paths, valid only in the repo that invoked the hook. We
# inherit them, and then `git worktree add` tries to open .git/index inside a
# directory that is not the one those paths were written for:
#
#   fatal: .git/index: index file open failed: Not a directory
#
# Every git command below has to run as if from a clean shell, so scrub them
# here rather than at each call site. Running this script by hand from a
# terminal never reproduced the failure, because a terminal has none of these
# set — only the real post-commit path does.
unset GIT_INDEX_FILE GIT_DIR GIT_WORK_TREE GIT_PREFIX GIT_COMMON_DIR \
      GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES \
      GIT_QUARANTINE_PATH GIT_REFLOG_ACTION GIT_INDEX_VERSION

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1

STATE="$ROOT/.parity"
WT_BASE="${PARITY_WORKTREE_BASE:-$HOME/reddy.sh/projects/.pattadar-parity}"
BUDGET="${PARITY_BUDGET_USD:-2}"
MODEL="${PARITY_MODEL:-opus}"
CONTRACT="docs/specs/2026-08-22-web-ios-parity-contract.md"

mkdir -p "$STATE/logs" "$WT_BASE"

# ── the lock ────────────────────────────────────────────────────────────
#
# mkdir is the atomic one. A stale lock from a killed sweep would otherwise
# wedge this permanently, so it carries its pid and is broken when that pid is
# gone — a wedged automation is worse than a duplicated one.
if ! mkdir "$STATE/lock" 2>/dev/null; then
  if [ -f "$STATE/lock/pid" ] && ! kill -0 "$(cat "$STATE/lock/pid")" 2>/dev/null; then
    echo "$(date -Iseconds) breaking stale lock" >&2
    rm -rf "$STATE/lock"
    mkdir "$STATE/lock" 2>/dev/null || exit 0
  else
    exit 0
  fi
fi
echo $$ > "$STATE/lock/pid"
trap 'rm -rf "$STATE/lock"' EXIT

note() { echo "$(date -Iseconds) $*"; }

notify() {
  command -v osascript >/dev/null 2>&1 || return 0
  osascript -e "display notification \"$2\" with title \"$1\"" >/dev/null 2>&1 || true
}

# ── one sweep ───────────────────────────────────────────────────────────
sweep() {
  local sha="$1"
  local short subject wt branch log report
  short="$(git rev-parse --short "$sha")" || return 1
  subject="$(git log -1 --format=%s "$sha")"
  branch="parity/ios-$short"
  wt="$WT_BASE/$short"
  log="$STATE/logs/$short.log"
  report="docs/parity/$short.md"

  if git show-ref --verify --quiet "refs/heads/$branch"; then
    note "$short already swept ($branch exists) — skipping"
    return 0
  fi

  note "sweeping $short — $subject"
  rm -rf "$wt"
  git worktree add --quiet -b "$branch" "$wt" "$sha" || { note "worktree add failed"; return 1; }

  # verify.sh installs onto the founder's PHYSICAL iPhone. The brief forbids
  # running it and --disallowedTools fences the obvious spellings, but a
  # pattern match against a shell string is a guess, and this is a phone. So
  # the capability is removed from the throwaway worktree outright, and put
  # back before staging so the sweep's commit never shows it deleted.
  rm -f "$wt/apps/ios/verify.sh"

  # The checker is tooling, not part of the commit under test. A commit made
  # before it was written has no copy of it in its tree, so carry the current
  # one in — otherwise every sweep of an older commit runs with no findings at
  # all and silently looks like a clean one.
  for tool in scripts/parity-check.ts scripts/parity-map.json; do
    cp "$ROOT/$tool" "$wt/$tool" 2>/dev/null || true
  done

  # The mechanical findings go INTO the prompt: the agent starts from drift
  # that has already been located rather than re-deriving it from the diff.
  local findings
  findings="$(cd "$wt" && bun run scripts/parity-check.ts "$sha" --json 2>&1 | head -400)"

  # ...and out again, so a carried-in tool never lands in the sweep's commit.
  (cd "$wt" && git checkout -- scripts/parity-check.ts scripts/parity-map.json 2>/dev/null; \
   git clean -q -f scripts/parity-check.ts scripts/parity-map.json 2>/dev/null) || true

  local prompt
  prompt="$(cat <<PROMPT
Adapt this finished web commit into the native iOS app.

Commit: $short — $subject

Read .kiro/skills/sync-ios/SKILL.md first, then read $CONTRACT. The canonical
skill and contract define the workflow, twin map, three bands (ADAPT / NOTE /
IGNORE), five triage buckets, write boundary, and report order. They win over
anything you infer from the diff. Read apps/ios/design.md before touching
anything visual.

scripts/parity-check.ts has already found the mechanical drift for this commit:

$findings

Files changed:
$(git show --stat --format= "$sha" | head -80)

Diff (adapt/note paths only, truncated):
$(git show --format= "$sha" -- packages/core services/api services/gateway apps/web/src design.md | head -1500)

Do the work, then write $report using the report shape in the canonical skill.
Run: cd apps/ios/PattadarKit && swift test
The wrapper cleans `.swiftpm` and `.build` after the authoritative test gate.

Most apps/web/src/w360/** diffs correctly produce NO Swift — they sit on the
Query.web namespace iOS does not read. An empty sweep with a stated reason is a
good outcome. Never invent a screen, a table or a schema change: file it as
NEEDS-FOUNDER. Never run apps/ios/verify.sh.
PROMPT
)"

  # The prompt goes in on STDIN, never as a positional argument.
  #
  # --allowedTools and --disallowedTools are variadic, so a trailing positional
  # is swallowed into whichever list came last: the whole brief was parsed as
  # deny rules ("Permission deny rule \"the\" matches no known tool") and the
  # run died in three seconds. Stdin also sidesteps the argv size limit, which
  # a 1500-line diff would eventually hit.
  (
    cd "$wt" || exit 1
    printf '%s' "$prompt" | PATTADAR_PARITY=1 claude -p \
      --model "$MODEL" \
      --permission-mode acceptEdits \
      --max-budget-usd "$BUDGET" \
      --allowedTools Read Grep Glob Edit Write \
        "Bash(bun run scripts/parity-check.ts *)" \
        "Bash(bun run scripts/emit-vectors.ts)" \
        "Bash(bun run scripts/emit-vectors.ts *)" \
        "Bash(swift test)" "Bash(swift test *)" "Bash(cd *)" \
      --disallowedTools "Bash(xcodebuild*)" "Bash(xcrun*)" "Bash(terraform*)" \
        "Bash(aws*)" "Bash(git*)" "Bash(rm*)" "Bash(curl*)" "Bash(ssh*)" \
        WebFetch WebSearch
  ) > "$log" 2>&1
  local rc=$?
  note "agent exited $rc — log: $log"

  # ── the gate ──────────────────────────────────────────────────────────
  #
  # Authoritative, whatever the agent reported about itself. Package tests
  # only: no Xcode project, no simulator, no device. verify.sh installs onto a
  # physical iPhone and stays the founder's to run.
  local tests="not run"
  if [ -d "$wt/apps/ios/PattadarKit" ]; then
    if (cd "$wt/apps/ios/PattadarKit" && swift test) > "$STATE/logs/$short.swift-test.log" 2>&1; then
      tests="pass"
    else
      tests="FAIL"
    fi
    rm -rf "$wt/apps/ios/PattadarKit/.swiftpm" "$wt/apps/ios/PattadarKit/.build"
  fi
  note "swift test: $tests"

  # ── land it ───────────────────────────────────────────────────────────
  #
  # verify.sh goes back before anything is staged, so the sweep's commit is
  # about apps/ios and not about a file this script removed for safety.
  git -C "$wt" checkout -- apps/ios/verify.sh 2>/dev/null || true

  local changed
  changed="$(cd "$wt" && git status --porcelain -- apps/ios packages/core/vectors scripts/emit-vectors.ts docs/parity)"
  if [ -z "$changed" ]; then
    note "$short — nothing to adapt"
    git worktree remove --force "$wt" 2>/dev/null
    git branch -D "$branch" >/dev/null 2>&1
    printf '{"sha":"%s","subject":%s,"result":"no-change","tests":"%s"}\n' \
      "$short" "$(printf '%s' "$subject" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')" "$tests" \
      >> "$STATE/ledger.jsonl"
    notify "iOS parity — $short" "Nothing to adapt. $subject"
    return 0
  fi

  (
    cd "$wt" || exit 1
    export PATTADAR_PARITY=1
    git add -A apps/ios packages/core/vectors scripts/emit-vectors.ts docs/parity
    git commit --quiet -m "chore(ios): parity sweep for $short — $subject" \
      -m "Adapted from $sha by scripts/ios-parity-sync.sh. swift test: $tests." \
      -m "Not reviewed by a human. See docs/parity/$short.md."
  ) >> "$log" 2>&1

  git worktree remove --force "$wt" 2>/dev/null
  printf '{"sha":"%s","subject":%s,"result":"branch","branch":"%s","tests":"%s"}\n' \
    "$short" "$(printf '%s' "$subject" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')" "$branch" "$tests" \
    >> "$STATE/ledger.jsonl"

  note "landed on $branch (swift test: $tests)"
  note "  read:  git log -p $branch -- apps/ios docs/parity"
  note "  take:  git merge --no-ff $branch"
  note "  drop:  git branch -D $branch"
  notify "iOS parity — $short ($tests)" "$branch is ready. $subject"
}

# ── drain ───────────────────────────────────────────────────────────────
#
# A burst of commits queues; each is swept on its own diff. Coalescing them
# would silently drop whatever only the middle commit changed.
drain() {
  local guard=0 next
  while [ -s "$STATE/queue" ] && [ $guard -lt 20 ]; do
    guard=$((guard + 1))
    next="$(head -1 "$STATE/queue")"
    tail -n +2 "$STATE/queue" > "$STATE/queue.tmp" && mv "$STATE/queue.tmp" "$STATE/queue"
    [ -n "$next" ] && sweep "$next"
  done
  rm -f "$STATE/queue"
}

# ── watch ───────────────────────────────────────────────────────────────
#
# The post-commit hook is the normal trigger and needs no daemon. This mode is
# for the other two cases: catching up on commits made before the hook was
# armed, and running on a machine where you would rather not install a hook at
# all. It polls rather than watching the filesystem — a commit every few
# minutes does not justify an fswatch dependency, and polling git is cheap.
#
#   scripts/ios-parity-sync.sh --watch &
#
# Idempotent by construction: a commit whose parity/ios-<sha> branch already
# exists is skipped, so restarting the watcher never re-sweeps or double-spends.
watch_loop() {
  local interval="${PARITY_WATCH_INTERVAL:-60}"
  local scanned="" sha short
  note "watching for web commits every ${interval}s (ctrl-c to stop)"
  while :; do
    if [ -f "$STATE/OFF" ]; then
      sleep "$interval"; continue
    fi
    # Newest first, bounded: a cold start on a long history should catch up on
    # recent work, not sweep the entire repo and spend a fortune doing it.
    for sha in $(git log -n "${PARITY_WATCH_DEPTH:-20}" --format=%H); do
      short="$(git rev-parse --short "$sha")"
      case " $scanned " in *" $short "*) continue ;; esac
      scanned="$scanned $short"
      git show-ref --verify --quiet "refs/heads/parity/ios-$short" && continue
      grep -q "\"$short\"" "$STATE/ledger.jsonl" 2>/dev/null && continue
      if git show --name-only --format= "$sha" | grep -qE \
        '^(packages/(core|tokens)/|services/(api|gateway)/|apps/web/src/|apps/web-next/|design\.md$)'; then
        sweep "$sha"
        drain
      fi
    done
    sleep "$interval"
  done
}

if [ "${1:-}" = "--watch" ]; then
  watch_loop
else
  sweep "${1:-HEAD}"
  drain
fi
