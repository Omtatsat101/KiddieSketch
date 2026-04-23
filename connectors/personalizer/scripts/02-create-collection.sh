#!/usr/bin/env bash
# 02-create-collection.sh
# Creates the "Made with Love — Mother's Day" custom collection in KiddieSketch.
# Idempotent: if a collection with handle "mothers-day-2026" already exists,
# it updates that collection's body/meta instead of creating a duplicate.

set -euo pipefail

ENV_FILE="${ENV_FILE:-$HOME/OneDrive/Desktop/Organized/projects/API-KEYS.env}"
kv() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d'=' -f2-; }

SHOP_DOMAIN="${SHOP_DOMAIN:-bfeb49-2.myshopify.com}"
TOKEN=$(kv SHOPIFY_KS_ACCESS_TOKEN)
API_VER="2025-01"
HANDLE="mothers-day-2026"

if [[ ! "$TOKEN" =~ ^shpat_ ]]; then
  echo "ERR  SHOPIFY_KS_ACCESS_TOKEN is not a shpat_ Admin API token. Run 01-validate-access.sh first." >&2
  exit 2
fi

AUTH="X-Shopify-Access-Token: $TOKEN"
BASE="https://${SHOP_DOMAIN}/admin/api/${API_VER}"

# 1. Look up existing collection by handle
EXISTING_ID=$(curl -sS --ssl-no-revoke -H "$AUTH" \
  "${BASE}/custom_collections.json?handle=${HANDLE}" \
  | python3 -c "import sys, json; d = json.load(sys.stdin); arr = d.get('custom_collections', []); print(arr[0]['id'] if arr else '')" \
  2>/dev/null || echo "")

BODY_HTML='<h2>The best gifts come from the heart.</h2>
<p>Our "Made with Love" collection features sketch-style designs that look like your little one drew them just for Mum or Grandma. 12 pieces — mugs, canvases, totes, tees, aprons, posters and bundles.</p>
<p>Every item is printed on demand in Australia. No overstock, no waste, just one gift-ready package shipped fast.</p>
<p><strong>Free AU shipping. 30-day returns. Order by April 28 for guaranteed Mother'"'"'s Day delivery (May 11).</strong></p>'

PAYLOAD=$(python3 -c "
import json
obj = {
  'custom_collection': {
    'title': 'Made with Love — Mother\u2019s Day',
    'handle': 'mothers-day-2026',
    'body_html': '''$BODY_HTML''',
    'published': True,
    'sort_order': 'best-selling',
    'metafields_global_title_tag': 'Mother\u2019s Day Gifts 2026 | Kid-Drawn Mum & Grandma Gifts | KiddieSketch',
    'metafields_global_description_tag': 'Shop the KiddieSketch Mother\u2019s Day collection — sketch-style gifts that look like your kid drew them. Mugs, canvases, totes, tees, aprons, posters, bundles. Free AU shipping. Order by April 28.'
  }
}
print(json.dumps(obj))
")

if [[ -n "$EXISTING_ID" ]]; then
  echo "INFO Updating existing collection id=$EXISTING_ID (handle=$HANDLE)"
  HTTP=$(curl -sS --ssl-no-revoke -o /tmp/coll.json -w '%{http_code}' \
    -X PUT -H "$AUTH" -H 'Content-Type: application/json' \
    -d "$PAYLOAD" \
    "${BASE}/custom_collections/${EXISTING_ID}.json")
  [[ "$HTTP" == "200" ]] || { echo "FAIL PUT HTTP=$HTTP body=$(head -c 500 /tmp/coll.json)" >&2; exit 1; }
  COLLECTION_ID="$EXISTING_ID"
else
  echo "INFO Creating new collection (handle=$HANDLE)"
  HTTP=$(curl -sS --ssl-no-revoke -o /tmp/coll.json -w '%{http_code}' \
    -X POST -H "$AUTH" -H 'Content-Type: application/json' \
    -d "$PAYLOAD" \
    "${BASE}/custom_collections.json")
  [[ "$HTTP" == "201" ]] || { echo "FAIL POST HTTP=$HTTP body=$(head -c 500 /tmp/coll.json)" >&2; exit 1; }
  COLLECTION_ID=$(python3 -c "import json, sys; print(json.load(open('/tmp/coll.json'))['custom_collection']['id'])")
fi

echo "DONE Collection id=$COLLECTION_ID handle=$HANDLE"
echo "$COLLECTION_ID" > /tmp/ks_mothers_day_collection_id.txt
echo "     (id saved to /tmp/ks_mothers_day_collection_id.txt for next scripts)"
