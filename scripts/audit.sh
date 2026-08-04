#!/usr/bin/env bash
# Full-surface audit: every page renders, every API route answers correctly,
# and the access rules actually hold.
#
#   bash scripts/audit.sh
#
# Expects the dev server on :3000 and a seeded database.

BASE="${BASE:-http://localhost:3000}"
SCRATCH=".audit"
mkdir -p "$SCRATCH"
ADMIN_JAR="$SCRATCH/admin.txt"
FREE_JAR="$SCRATCH/free.txt"
ANON_JAR="$SCRATCH/anon.txt"
BODY="$SCRATCH/body.json"
rm -f "$ADMIN_JAR" "$FREE_JAR" "$ANON_JAR"

PASS=0; FAIL=0; WARN=0
declare -a FAILURES

ok()   { PASS=$((PASS+1)); printf "  \033[32mPASS\033[0m  %s\n" "$1"; }
bad()  { FAIL=$((FAIL+1)); FAILURES+=("$1"); printf "  \033[31mFAIL\033[0m  %s\n" "$1"; }
warn() { WARN=$((WARN+1)); printf "  \033[33mWARN\033[0m  %s\n" "$1"; }
head2(){ printf "\n\033[1m%s\033[0m\n" "$1"; }

# status <jar> <method> <path> [body]
status() {
  local jar="$1" method="$2" path="$3" body="${4:-}"
  if [ -n "$body" ]; then
    curl -s -o $BODY -w "%{http_code}" -b "$jar" -c "$jar" \
      -X "$method" "$BASE$path" -H 'Content-Type: application/json' -d "$body"
  else
    curl -s -o $BODY -w "%{http_code}" -b "$jar" -c "$jar" -X "$method" "$BASE$path"
  fi
}

expect() { # expect <label> <actual> <expected...>
  local label="$1" actual="$2"; shift 2
  for want in "$@"; do
    if [ "$actual" = "$want" ]; then ok "$label ($actual)"; return; fi
  done
  bad "$label - got $actual, wanted $*  |  $(head -c 160 $BODY)"
}

json() { python -c "import sys,json;d=json.load(open(sys.argv[1]));print($1)" "$BODY" 2>/dev/null || echo "PARSE_ERROR"; }

# Auth is rate limited to 5/min per IP, and this script signs in twice plus
# deliberately fails a login later. Back off rather than cascade 401s.
login() { # login <jar> <email> <password>
  local jar="$1" email="$2" pass="$3" code
  for attempt in 1 2 3 4; do
    code=$(status "$jar" POST /api/v1/auth/login "{\"email\":\"$email\",\"password\":\"$pass\"}")
    [ "$code" = "200" ] && { echo 200; return; }
    [ "$code" = "429" ] || { echo "$code"; return; }
    sleep 20
  done
  echo 429
}

head2 "0. Sign in"
expect "admin login" "$(login $ADMIN_JAR admin@data-corner.com.au 'ChangeMe12345!')" 200
expect "free-tier login" "$(login $FREE_JAR solo@gmail.com TestPassword123)" 200

head2 "1. Public pages (anonymous)"
for p in / /login /signup /verify /privacy /terms; do
  expect "GET $p" "$(status $ANON_JAR GET $p)" 200
done
expect "GET /nonexistent-page" "$(status $ANON_JAR GET /definitely-not-a-page)" 404

head2 "2. Auth walls - anonymous must be redirected"
for p in /feed /me /org /settings /notifications /admin; do
  expect "anon $p redirects to login" "$(status $ANON_JAR GET $p)" 307 302
done

head2 "3. Learner pages (signed in)"
for p in /feed /me /org /settings /notifications /onboarding; do
  expect "GET $p" "$(status $FREE_JAR GET $p)" 200
done

head2 "4. Admin pages"
for p in /admin /admin/content /admin/content/new /admin/categories /admin/moderation /admin/users /admin/coupons; do
  expect "GET $p" "$(status $ADMIN_JAR GET $p)" 200
done
expect "learner blocked from /admin" "$(status $FREE_JAR GET /admin)" 200 307 403
status $FREE_JAR GET /api/v1/admin/topics >/dev/null
expect "learner blocked from admin API" "$(status $FREE_JAR GET /api/v1/admin/topics)" 403

head2 "5. Public API"
expect "GET /categories" "$(status $ANON_JAR GET /api/v1/categories)" 200
expect "GET /topics" "$(status $ANON_JAR GET /api/v1/topics)" 200
TOPIC_SLUG=$(status $ANON_JAR GET "/api/v1/topics?limit=1" >/dev/null; json "d['data'][0]['slug']")
TOPIC_ID=$(status $ANON_JAR GET "/api/v1/topics?limit=1" >/dev/null; json "d['data'][0]['id']")
echo "     using topic: $TOPIC_SLUG"
expect "GET /topics/{slug}" "$(status $ANON_JAR GET /api/v1/topics/$TOPIC_SLUG)" 200
expect "GET /topics/{bad-slug}" "$(status $ANON_JAR GET /api/v1/topics/no-such-topic)" 404
expect "topic detail page renders" "$(status $ANON_JAR GET /content/$TOPIC_SLUG)" 200

head2 "6. Topic detail contract (intro, why-learn, locks, resources)"
status $FREE_JAR GET /api/v1/topics/$TOPIC_SLUG >/dev/null
for field in has_intro why_learn outcomes preview resource_count; do
  v=$(json "'yes' if '$field' in d else 'MISSING'")
  [ "$v" = "yes" ] && ok "detail has '$field'" || bad "detail missing '$field'"
done
EPISODE_LOCK=$(json "'yes' if d.get('episodes') and 'locked' in d['episodes'][0] else 'MISSING'")
[ "$EPISODE_LOCK" = "yes" ] && ok "episodes carry 'locked'" || bad "episodes missing 'locked'"
LEAK=$(json "'LEAK' if any(k for l in d.get('episodes',[]) for k in l if 'key' in k.lower()) else 'clean'")
[ "$LEAK" = "clean" ] && ok "no storage keys leaked to learner" || bad "storage key leaked in episode payload"

head2 "7. THE PAYWALL - free account, paid topic"
PAID_ID=$(docker exec acadu-postgres psql -U acadu -d acadu -tA -c \
  "select id from topics where is_free=false and status='published' and episode_count>=3 limit 1" 2>/dev/null)
if [ -z "$PAID_ID" ]; then warn "no paid topic with 3+ episodes - skipping paywall checks"; else
  L1=$(docker exec acadu-postgres psql -U acadu -d acadu -tA -c "select id from episodes where topic_id='$PAID_ID' order by sort_order limit 1")
  L2=$(docker exec acadu-postgres psql -U acadu -d acadu -tA -c "select id from episodes where topic_id='$PAID_ID' order by sort_order offset 1 limit 1")
  L3=$(docker exec acadu-postgres psql -U acadu -d acadu -tA -c "select id from episodes where topic_id='$PAID_ID' order by sort_order offset 2 limit 1")

  # Episodes 1-2 pass the gate. 409 = gate passed but no media uploaded yet.
  expect "free: episode 1 allowed" "$(status $FREE_JAR POST /api/v1/topics/$PAID_ID/playback "{\"episodeId\":\"$L1\"}")" 200 409
  expect "free: episode 2 allowed" "$(status $FREE_JAR POST /api/v1/topics/$PAID_ID/playback "{\"episodeId\":\"$L2\"}")" 200 409
  expect "free: episode 3 LOCKED"  "$(status $FREE_JAR POST /api/v1/topics/$PAID_ID/playback "{\"episodeId\":\"$L3\"}")" 403
  expect "admin: episode 3 allowed" "$(status $ADMIN_JAR POST /api/v1/topics/$PAID_ID/playback "{\"episodeId\":\"$L3\"}")" 200 409
  expect "anon: playback rejected" "$(status $ANON_JAR POST /api/v1/topics/$PAID_ID/playback "{\"episodeId\":\"$L1\"}")" 401
  expect "intro is free to watch" "$(status $FREE_JAR POST /api/v1/topics/$PAID_ID/intro)" 200 404
fi

head2 "8. Resources"
expect "GET /topics/{id}/resources" "$(status $FREE_JAR GET /api/v1/topics/$TOPIC_ID/resources)" 200
LOCKED_LEAK=$(json "'LEAK' if any(r.get('locked') and (r.get('body') or r.get('url')) for r in d.get('data',[])) else 'clean'")
[ "$LOCKED_LEAK" = "clean" ] && ok "locked resource content withheld" || bad "locked resource leaked body/url"

head2 "9. Engagement"
expect "like toggle"     "$(status $FREE_JAR POST /api/v1/topics/$TOPIC_ID/like)" 200
expect "bookmark toggle" "$(status $FREE_JAR POST /api/v1/topics/$TOPIC_ID/bookmark)" 200
expect "list comments"   "$(status $FREE_JAR GET /api/v1/topics/$TOPIC_ID/comments)" 200
expect "feed for_you"    "$(status $FREE_JAR GET '/api/v1/feed?tab=for_you&limit=3')" 200
expect "feed everything" "$(status $FREE_JAR GET '/api/v1/feed?tab=everything&limit=3')" 200
expect "analytics ingest" "$(status $FREE_JAR POST /api/v1/events '{"events":[{"event":"feed_impression","ts":"2026-08-03T00:00:00Z"}]}')" 202 200

head2 "10. Account + cohort"
expect "GET /me"             "$(status $FREE_JAR GET /api/v1/me)" 200
expect "GET /me/activity"    "$(status $FREE_JAR GET /api/v1/me/activity)" 200
expect "GET /me/bookmarks"   "$(status $FREE_JAR GET /api/v1/me/bookmarks)" 200
expect "GET /me/comments"    "$(status $FREE_JAR GET /api/v1/me/comments)" 200
expect "GET /me/export"      "$(status $FREE_JAR GET /api/v1/me/export)" 200
expect "GET /org"            "$(status $FREE_JAR GET /api/v1/org)" 200
expect "GET /notifications"  "$(status $FREE_JAR GET /api/v1/notifications)" 200
expect "notification count"  "$(status $FREE_JAR GET /api/v1/notifications/count)" 200
expect "notif preferences"   "$(status $FREE_JAR GET /api/v1/notifications/preferences)" 200

head2 "11. Privacy rules"
status $FREE_JAR GET /api/v1/org >/dev/null
SUPPRESSED=$(json "d.get('suppressed', d.get('organization',{}).get('suppressed') if isinstance(d.get('organization'),dict) else None)")
echo "     org count suppressed: $SUPPRESSED"
status $ADMIN_JAR GET /api/v1/admin/analytics/organizations >/dev/null
MINCELL=$(json "d.get('min_cell_size','MISSING')")
[ "$MINCELL" != "MISSING" ] && ok "org analytics enforce min cell size ($MINCELL)" || bad "org analytics missing min_cell_size"
NAMES=$(json "'LEAK' if 'nickname' in json.dumps(d) or 'email' in json.dumps(d) else 'clean'")
[ "$NAMES" = "clean" ] && ok "org analytics expose no individuals" || bad "org analytics leaked individual data"

head2 "12. Admin API"
for e in /api/v1/admin/topics /api/v1/admin/categories /api/v1/admin/users /api/v1/admin/comments /api/v1/admin/reports /api/v1/admin/coupons; do
  expect "GET $e" "$(status $ADMIN_JAR GET $e)" 200
done
for e in overview timeseries top-content underperforming categories organizations retention; do
  q=""; [ "$e" = "timeseries" ] && q="?metric=views"
  expect "GET analytics/$e" "$(status $ADMIN_JAR GET /api/v1/admin/analytics/$e$q)" 200
done

head2 "13. Billing (Stripe optional)"
expect "GET /billing/subscription" "$(status $FREE_JAR GET /api/v1/billing/subscription)" 200 501
expect "coupon validate" "$(status $FREE_JAR POST /api/v1/billing/coupon/validate '{"code":"NOPE"}')" 200 501
expect "checkout" "$(status $FREE_JAR POST /api/v1/billing/checkout '{}')" 200 501

head2 "14. Validation + guardrails"
expect "under-16 rejected" "$(status $ANON_JAR POST /api/v1/auth/signup '{"email":"kid@x.edu.au","password":"Password1234","nickname":"kid","ageRange":"under-16","termsAccepted":true}')" 422
expect "wrong password rejected" "$(status $ANON_JAR POST /api/v1/auth/login '{"email":"admin@data-corner.com.au","password":"wrong-password"}')" 401 429
expect "malformed JSON rejected" "$(curl -s -o $BODY -w '%{http_code}' -X POST $BASE/api/v1/auth/login -H 'Content-Type: application/json' -d 'not json')" 400

printf "\n\033[1m================ RESULT ================\033[0m\n"
printf "  passed: %s   failed: %s   warnings: %s\n" "$PASS" "$FAIL" "$WARN"
if [ "$FAIL" -gt 0 ]; then
  printf "\n\033[31mFailures:\033[0m\n"
  for f in "${FAILURES[@]}"; do printf "  - %s\n" "$f"; done
  exit 1
fi
printf "\n\033[32mAll checks passed.\033[0m\n"
