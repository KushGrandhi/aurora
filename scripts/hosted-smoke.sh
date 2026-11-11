#!/usr/bin/env bash
# Usage: scripts/hosted-smoke.sh <base-url> <invite>
# Checks a hosted aurora: a key mints, /mcp lists tools, a render returns a /v/ link that answers 200, no key is 401.
set -u
BASE="${1:-}"; INVITE="${2:-}"
[ -n "$BASE" ] && [ -n "$INVITE" ] || { echo "usage: $0 <base-url> <invite>" >&2; exit 2; }
BASE="${BASE%/}"
CURL=(curl -sS --max-time 20)
[ -n "${AURORA_SMOKE_INSECURE:-}" ] && CURL+=(-k)
fail() { echo "FAIL: $*" >&2; exit 1; }
ok() { echo "ok: $*"; }
field() { # field <json> <name>: a top-level string value
  if command -v jq >/dev/null 2>&1; then printf '%s' "$1" | jq -r --arg k "$2" '.[$k] // empty'
  else printf '%s' "$1" | sed -n 's/.*"'"$2"'" *: *"\([^"]*\)".*/\1/p'; fi
}
# MCP response: a JSON body or an SSE stream; print the JSON of the first data line
mcp_json() { if grep -q '^data:' <<<"$1"; then grep '^data:' <<<"$1" | head -1 | sed 's/^data: *//'; else printf '%s' "$1"; fi; }
mcp() { # mcp <key> <json-rpc body>
  "${CURL[@]}" -X POST "$BASE/mcp" -H "Authorization: Bearer $1" -H 'Content-Type: application/json' \
    -H 'Accept: application/json, text/event-stream' -d "$2"
}

minted=$("${CURL[@]}" -X POST "$BASE/api/keys" -H 'Content-Type: application/json' -d "{\"invite\":\"$INVITE\"}") || fail "could not reach $BASE/api/keys"
KEY=$(field "$minted" key)
[ -n "$KEY" ] || fail "no key minted (wrong invite?): $minted"
ok "key minted"

code=$("${CURL[@]}" -o /dev/null -w '%{http_code}' -X POST "$BASE/mcp" -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' -d '{}')
[ "$code" = 401 ] || fail "/mcp without a key answered $code, expected 401"
ok "no key is 401"

tools=$(mcp_json "$(mcp "$KEY" '{"jsonrpc":"2.0","id":1,"method":"tools/list"}')")
for t in render patch status; do grep -q "\"$t\"" <<<"$tools" || fail "tools/list lacks $t: $tools"; done
ok "/mcp lists tools"

view='{"v":2,"id":"smoke","title":"Smoke","sections":[{"id":"s","layout":"grid","items":[{"id":"t","c":{"type":"text","md":"hello"}}]}]}'
body="{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"render\",\"arguments\":{\"view\":$view}}}"
res=$(mcp_json "$(mcp "$KEY" "$body")")
link=$(printf '%s' "$res" | grep -Eo 'https?://[^" \\]*/v/[a-z0-9]{16}_[0-9a-f]{32}' | head -1)
[ -n "$link" ] || fail "render returned no /v/ link: $res"
ok "render returned a share link"

# The link's origin is the configured public URL; fetch it through the base we were given
path="/v/${link##*/v/}"
code=$("${CURL[@]}" -o /dev/null -w '%{http_code}' "$BASE$path")
[ "$code" = 200 ] || fail "$path answered $code, expected 200"
ok "share link answers 200"
echo "smoke passed"
