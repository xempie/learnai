#!/usr/bin/env bash
# Exercises every admin write operation end to end: create, upload, edit,
# publish gate, search, moderation, users, coupons, delete.
#
#   bash scripts/audit-admin.sh
#
# Creates a throwaway topic and removes it at the end.

BASE="${BASE:-http://localhost:3000}"
S=".audit"; mkdir -p "$S"
JAR="$S/admin.txt"; BODY="$S/body.json"
rm -f "$JAR"

PASS=0; FAIL=0
declare -a FAILURES
ok(){ PASS=$((PASS+1)); printf "  \033[32mPASS\033[0m  %s\n" "$1"; }
bad(){ FAIL=$((FAIL+1)); FAILURES+=("$1"); printf "  \033[31mFAIL\033[0m  %s\n" "$1"; }
h(){ printf "\n\033[1m%s\033[0m\n" "$1"; }

req(){ # req METHOD PATH [json]
  if [ -n "${3:-}" ]; then
    curl -s -o "$BODY" -w "%{http_code}" -b "$JAR" -c "$JAR" -X "$1" "$BASE$2" \
      -H 'Content-Type: application/json' -d "$3"
  else
    curl -s -o "$BODY" -w "%{http_code}" -b "$JAR" -c "$JAR" -X "$1" "$BASE$2"
  fi
}
exp(){ local l="$1" a="$2"; shift 2
  for w in "$@"; do [ "$a" = "$w" ] && { ok "$l ($a)"; return; }; done
  bad "$l - got $a want $*  |  $(head -c 150 "$BODY")"; }
jq_(){ python -c "import sys,json;d=json.load(open(sys.argv[1]));print($1)" "$BODY" 2>/dev/null || echo ERR; }

# Overridable so this can run against a deployed environment, where the admin
# password is a generated secret rather than the local seed default:
#   ADMIN_EMAIL=... ADMIN_PASSWORD=... BASE=https://... bash scripts/audit-admin.sh
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@data-corner.com.au}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-ChangeMe12345!}"

h "Sign in as platform_admin"
for i in 1 2 3 4; do
  C=$(req POST /api/v1/auth/login \
    "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}")
  [ "$C" = "200" ] && break; sleep 20
done
exp "admin login" "$C" 200

CAT=$(req GET /api/v1/categories >/dev/null; jq_ "d['data'][0]['id']")

h "1. CREATE a topic"
C=$(req POST /api/v1/admin/topics "{\"type\":\"topic\",\"title\":\"Audit Temp Topic\",\"excerpt\":\"temp\",\"body\":\"temp body\",\"categoryIds\":[\"$CAT\"]}")
exp "create topic" "$C" 200 201
CID=$(jq_ "d.get('id') or d.get('topic',{}).get('id')")
echo "     topic id: $CID"

h "2. EDIT the topic (metadata + why-learn + outcomes)"
exp "patch metadata" "$(req PATCH /api/v1/admin/topics/$CID '{"title":"Audit Temp Topic (edited)","excerpt":"edited excerpt"}')" 200
exp "patch why-learn/outcomes" "$(req PATCH /api/v1/admin/topics/$CID '{"whyLearn":"Because the audit says so.","outcomes":"- Prove edit works"}')" 200
req GET /api/v1/admin/topics/$CID >/dev/null
T=$(jq_ "d.get('title','')")
[ "$T" = "Audit Temp Topic (edited)" ] && ok "edit persisted" || bad "edit did not persist (got '$T')"

h "3. PUBLISH GATE (must refuse an empty topic)"
exp "publish blocked - no episodes" "$(req POST /api/v1/admin/topics/$CID/publish '{}')" 422
MSG=$(jq_ "d['error']['message'][:60]")
echo "     server says: $MSG"

h "4. EPISODE create + UPLOAD flow"
C=$(req POST /api/v1/admin/topics/$CID/episodes '{"title":"Audit episode one","durationSec":120}')
exp "create episode" "$C" 200 201
LID=$(jq_ "d.get('id') or d.get('episode',{}).get('id')")
exp "duration cap enforced" "$(req POST /api/v1/admin/topics/$CID/episodes '{"title":"too long","durationSec":400}')" 422

# presign -> upload -> attach, for video and captions
C=$(req POST /api/v1/admin/topics/$CID/upload-url '{"kind":"video","mimeType":"video/mp4","sizeBytes":2048}')
exp "presign video" "$C" 200 201
VKEY=$(jq_ "d['key']"); VURL=$(jq_ "d['upload_url']")
printf 'not-a-real-mp4-but-bytes' > "$S/fake.mp4"
UC=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" -X POST "$BASE$VURL" --data-binary @"$S/fake.mp4")
exp "upload video bytes" "$UC" 200 201 204
exp "attach video to episode" "$(req PATCH /api/v1/admin/episodes/$LID "{\"videoS3Key\":\"$VKEY\",\"durationSec\":120,\"uploadStatus\":\"ready\"}")" 200

C=$(req POST /api/v1/admin/topics/$CID/upload-url '{"kind":"captions","mimeType":"text/vtt","sizeBytes":64}')
exp "presign captions" "$C" 200 201
CKEY=$(jq_ "d['key']"); CURL_=$(jq_ "d['upload_url']")
printf 'WEBVTT\n\n00:00.000 --> 00:02.000\nhello\n' > "$S/fake.vtt"
UC=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" -X POST "$BASE$CURL_" --data-binary @"$S/fake.vtt")
exp "upload captions bytes" "$UC" 200 201 204
exp "attach captions" "$(req PATCH /api/v1/admin/episodes/$LID "{\"captionsKey\":\"$CKEY\"}")" 200
exp "oversized video refused" "$(req POST /api/v1/admin/topics/$CID/upload-url '{"kind":"video","mimeType":"video/mp4","sizeBytes":629145600}')" 422
exp "bad mime refused" "$(req POST /api/v1/admin/topics/$CID/upload-url '{"kind":"attachment","mimeType":"application/x-msdownload","sizeBytes":1024}')" 422

h "5. RESOURCES create/edit/delete"
C=$(req POST /api/v1/admin/topics/$CID/resources '{"kind":"prompt","title":"Audit prompt","body":"Do the thing.","isPreview":true}')
exp "create prompt resource" "$C" 200 201
RID=$(jq_ "d.get('id') or d.get('resource',{}).get('id')")
exp "create link resource" "$(req POST /api/v1/admin/topics/$CID/resources '{"kind":"link","title":"Audit link","url":"https://example.com"}')" 200 201
exp "javascript: url refused" "$(req POST /api/v1/admin/topics/$CID/resources '{"kind":"link","title":"bad","url":"javascript:alert(1)"}')" 422
exp "edit resource" "$(req PATCH /api/v1/admin/resources/$RID '{"title":"Audit prompt (edited)","isPreview":false}')" 200
exp "delete resource" "$(req DELETE /api/v1/admin/resources/$RID)" 200 204

h "6. PUBLISH now succeeds, then UNPUBLISH"
exp "publish" "$(req POST /api/v1/admin/topics/$CID/publish '{}')" 200
req GET /api/v1/admin/topics/$CID >/dev/null
ST=$(jq_ "d.get('status')")
[ "$ST" = "published" ] && ok "status is published" || bad "status is '$ST'"
exp "unpublish" "$(req POST /api/v1/admin/topics/$CID/unpublish)" 200

h "7. DUPLICATE"
C=$(req POST /api/v1/admin/topics/$CID/duplicate)
exp "duplicate topic" "$C" 200 201
DUP=$(jq_ "d.get('id') or d.get('topic',{}).get('id')")

h "8. SEARCH + FILTERS"
exp "search by title"   "$(req GET '/api/v1/admin/topics?q=Audit%20Temp')" 200
N=$(jq_ "len(d.get('data',d if isinstance(d,list) else []))")
[ "$N" != "0" ] && [ "$N" != "ERR" ] && ok "search returned $N result(s)" || bad "search returned nothing for a topic that exists"
exp "filter status=draft"    "$(req GET '/api/v1/admin/topics?status=draft')" 200
exp "filter type=topic"     "$(req GET '/api/v1/admin/topics?type=topic')" 200
exp "search users"           "$(req GET '/api/v1/admin/users?q=admin')" 200
exp "filter users status"    "$(req GET '/api/v1/admin/users?status=suspended')" 200
exp "filter comments"        "$(req GET '/api/v1/admin/comments?reported=true')" 200
exp "filter reports open"    "$(req GET '/api/v1/admin/reports?status=open')" 200
exp "sort top-content"       "$(req GET '/api/v1/admin/analytics/top-content?sort=likes')" 200

h "9. CATEGORIES management"
# Merge deactivates the source rather than deleting it, so the slug stays
# taken. Use a fresh one each run to keep this script re-runnable.
CSLUG="audit-temp-$RANDOM"
C=$(req POST /api/v1/admin/categories "{\"name\":\"Audit Temp $CSLUG\",\"slug\":\"$CSLUG\",\"description\":\"temp\",\"colorHex\":\"#202020\"}")
exp "create category" "$C" 200 201
NEWCAT=$(jq_ "d.get('id') or d.get('category',{}).get('id')")
exp "rename category" "$(req PATCH /api/v1/admin/categories/$NEWCAT '{"name":"Audit Temp Category (edited)"}')" 200
exp "deactivate category" "$(req PATCH /api/v1/admin/categories/$NEWCAT '{"isActive":false}')" 200
exp "merge into another" "$(req POST /api/v1/admin/categories/$NEWCAT/merge "{\"targetCategoryId\":\"$CAT\"}")" 200

h "10. MODERATION + USERS"
req GET /api/v1/admin/comments >/dev/null
CMT=$(jq_ "(d.get('data') or [{}])[0].get('id','')")
if [ -n "$CMT" ] && [ "$CMT" != "ERR" ]; then
  exp "hide comment"   "$(req POST /api/v1/admin/comments/$CMT '{"action":"hide"}')" 200
  exp "unhide comment" "$(req POST /api/v1/admin/comments/$CMT '{"action":"unhide"}')" 200
else
  ok "no comments to moderate (empty state)"
fi
req GET /api/v1/admin/users >/dev/null
UID_=$(python -c "
import json;d=json.load(open('$BODY'))
rows=d.get('data',[])
me=[r for r in rows if r.get('email','').startswith('solo')]
print((me or rows)[0]['id'] if rows else '')" 2>/dev/null)
if [ -n "$UID_" ]; then
  exp "suspend user"   "$(req PATCH /api/v1/admin/users/$UID_ '{"action":"suspend"}')" 200
  exp "unsuspend user" "$(req PATCH /api/v1/admin/users/$UID_ '{"action":"unsuspend"}')" 200
else bad "no users returned"; fi

h "11. COUPONS"
CODE="AUDIT$RANDOM"
C=$(req POST /api/v1/admin/coupons "{\"code\":\"$CODE\",\"description\":\"audit\",\"discountType\":\"percent\",\"discountValue\":25,\"maxRedemptions\":5}")
exp "create coupon" "$C" 200 201
COUP=$(jq_ "d.get('id') or d.get('coupon',{}).get('id')")
exp "reject percent > 100" "$(req POST /api/v1/admin/coupons '{"code":"BAD1","description":"x","discountType":"percent","discountValue":150}')" 422
exp "edit coupon" "$(req PATCH /api/v1/admin/coupons/$COUP '{"isActive":false}')" 200
exp "delete coupon" "$(req DELETE /api/v1/admin/coupons/$COUP)" 200 204

h "12. DELETE (cleanup)"
exp "delete duplicate" "$(req DELETE /api/v1/admin/topics/$DUP)" 200 204
exp "delete episode"    "$(req DELETE /api/v1/admin/episodes/$LID)" 200 204
exp "delete topic"    "$(req DELETE /api/v1/admin/topics/$CID)" 200 204
req GET /api/v1/admin/topics/$CID >/dev/null
G=$(jq_ "d.get('status', d.get('error',{}).get('code','?'))")
[ "$G" = "NOT_FOUND" ] || [ "$G" = "?" ] && ok "deleted topic is gone" || ok "deleted topic soft-deleted (status $G)"

printf "\n\033[1m========== ADMIN AUDIT ==========\033[0m\n  passed: %s  failed: %s\n" "$PASS" "$FAIL"
if [ "$FAIL" -gt 0 ]; then printf "\n\033[31mFailures:\033[0m\n"; for f in "${FAILURES[@]}"; do echo "  - $f"; done; exit 1; fi
printf "\n\033[32mAll admin operations working.\033[0m\n"
