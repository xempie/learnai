#!/usr/bin/env bash
# Post-deploy smoke test against the live site.
#
# Checks the things that were actually broken before this deploy: the site was
# a stale static bundle that still said "course", had no API, and served no
# database content. Each check prints PASS/FAIL and the script exits non-zero
# if any fail, so it works as a release gate.
#
#   ./scripts/verify-live.sh [base-url]

set -uo pipefail
BASE="${1:-https://learnai.data-corner.com.au}"
# Not mktemp: on Windows this repo is driven by Git Bash, whose /tmp is
# invisible to the native Python used below, so every parsed check silently
# reported zero. A path inside the repo is visible to both.
WORK=".audit/verify"
mkdir -p "$WORK"

pass=0
fail=0

check() {
  local label="$1" ok="$2" detail="${3:-}"
  if [ "$ok" = "1" ]; then
    printf '  \033[32mPASS\033[0m  %-46s %s\n' "$label" "$detail"
    pass=$((pass + 1))
  else
    printf '  \033[31mFAIL\033[0m  %-46s %s\n' "$label" "$detail"
    fail=$((fail + 1))
  fi
}

status() { curl -s -o "$2" -w '%{http_code}' --max-time 30 "$1"; }

echo "Verifying $BASE"
echo

# --- the API exists at all (it 404'd on the static bundle) ------------------
code=$(status "$BASE/api/v1/health" "$WORK/health.json")
check "GET /api/v1/health" "$([ "$code" = "200" ] && echo 1 || echo 0)" "HTTP $code"
grep -q '"status":"ok"' "$WORK/health.json" 2>/dev/null \
  && check "health reports database reachable" 1 \
  || check "health reports database reachable" 0 "$(head -c 80 "$WORK/health.json" 2>/dev/null)"

# --- content comes from the database ---------------------------------------
code=$(status "$BASE/api/v1/topics?limit=50" "$WORK/topics.json")
check "GET /api/v1/topics" "$([ "$code" = "200" ] && echo 1 || echo 0)" "HTTP $code"

count=$(python -c "
import json,sys
try:
    d=json.load(open(r'$WORK/topics.json',encoding='utf8'))
    print(len(d.get('data', d) if isinstance(d,dict) else d))
except Exception: print(0)
" 2>/dev/null || echo 0)
check "topics returned from the database" "$([ "${count:-0}" -gt 0 ] && echo 1 || echo 0)" "$count topics"

# --- the rename actually reached production --------------------------------
status "$BASE/" "$WORK/home.html" > /dev/null
courses=$(grep -oi 'course' "$WORK/home.html" 2>/dev/null | wc -l | tr -d ' ')
check "homepage says nothing about 'courses'" "$([ "${courses:-1}" -eq 0 ] && echo 1 || echo 0)" "$courses occurrences"

episodes=$(grep -oi 'episode' "$WORK/home.html" 2>/dev/null | wc -l | tr -d ' ')
check "homepage uses episodes" "$([ "${episodes:-0}" -gt 0 ] && echo 1 || echo 0)" "$episodes occurrences"

grep -q 'Become the person your team asks about AI' "$WORK/home.html" \
  && check "positive slogan is live" 1 \
  || check "positive slogan is live" 0

grep -qi "won't take your job" "$WORK/home.html" \
  && check "old negative slogan removed" 0 "still present" \
  || check "old negative slogan removed" 1

# --- key pages render -------------------------------------------------------
for path in /login /signup; do
  code=$(status "$BASE$path" "$WORK/page.html")
  check "GET $path" "$([ "$code" = "200" ] && echo 1 || echo 0)" "HTTP $code"
done

# /catalogue is behind auth, so a 307 to /login is the correct answer for a
# signed-out request - only a 404 or 5xx would mean the deploy is wrong.
code=$(status "$BASE/catalogue" "$WORK/page.html")
check "GET /catalogue (200 or auth redirect)" \
  "$([ "$code" = "200" ] || [ "$code" = "307" ] || [ "$code" = "302" ] && echo 1 || echo 0)" "HTTP $code"

# --- a write route is reachable (the static bundle allowed GET only) --------
code=$(curl -s -o "$WORK/post.json" -w '%{http_code}' --max-time 30 \
  -X POST -H 'Content-Type: application/json' -d '{}' "$BASE/api/v1/auth/login")
check "POST reaches the origin (not 403 from CDN)" \
  "$([ "$code" != "403" ] && [ "$code" != "405" ] && echo 1 || echo 0)" "HTTP $code"

echo
echo "  $pass passed, $fail failed"
[ "$fail" -eq 0 ]
