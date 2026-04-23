#!/usr/bin/env bash
# 05-place-draft-order.sh
# Places a FAKE (draft) order on KiddieSketch with custom art properties,
# to verify the personalizer flow end-to-end WITHOUT charging a real card.
#
# What this proves:
#   1. Shopify accepts line-item properties with _custom_art_url
#   2. The order admin shows the properties
#   3. Make.com scenarios can read them (once we wire the scenario up)
#
# What this does NOT do:
#   - Charge a real card (draft orders aren't paid)
#   - Actually push to Printify (that's a separate step once we have a Printify key)

set -euo pipefail

ENV_FILE="${ENV_FILE:-$HOME/OneDrive/Desktop/Organized/projects/API-KEYS.env}"
kv() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d'=' -f2-; }

SHOP_DOMAIN="${SHOP_DOMAIN:-bfeb49-2.myshopify.com}"
TOKEN=$(kv SHOPIFY_KS_ACCESS_TOKEN)
API_VER="2025-01"
AUTH="X-Shopify-Access-Token: $TOKEN"
BASE="https://${SHOP_DOMAIN}/admin/api/${API_VER}"

[[ "$TOKEN" =~ ^shpat_ ]] || { echo "ERR  need shpat_ token" >&2; exit 2; }

# Grab the first Mother's Day product id from step 3's output
PRODUCT_ID=""
if [[ -f /tmp/ks_product_ids.json ]]; then
  PRODUCT_ID=$(python3 -c "import json; d=json.load(open('/tmp/ks_product_ids.json')); print(d[0]['id']) if d else ''" || true)
fi
if [[ -z "$PRODUCT_ID" ]]; then
  echo "WARN  no product id in /tmp/ks_product_ids.json — looking up by handle 'best-mum-ever-sketch-mug'..."
  PRODUCT_ID=$(curl -sS --ssl-no-revoke -H "$AUTH" \
    "${BASE}/products.json?handle=best-mum-ever-sketch-mug&fields=id,variants" \
    | python3 -c "import sys, json; p=json.load(sys.stdin).get('products',[]); print(p[0]['id']) if p else ''" || true)
fi
[[ -n "$PRODUCT_ID" ]] || { echo "ERR  no Mother's Day product found — run 03-create-products.js first" >&2; exit 1; }

# Get the first variant id of that product
VARIANT_ID=$(curl -sS --ssl-no-revoke -H "$AUTH" \
  "${BASE}/products/${PRODUCT_ID}.json?fields=variants" \
  | python3 -c "import sys, json; print(json.load(sys.stdin)['product']['variants'][0]['id'])")

echo "INFO  creating draft order: product=$PRODUCT_ID variant=$VARIANT_ID"

# Use a known-public test image URL as the fake "custom art". When the real
# flow runs, this URL comes from the /upload-art Worker and points to Supabase.
FAKE_ART_URL="https://placehold.co/2400x2400/FFD93D/FF6B9D/png?text=Best+Mum+Ever%0A%E2%9D%A4%EF%B8%8F"

PAYLOAD=$(python3 - <<PY
import json
o = {
  "draft_order": {
    "line_items": [
      {
        "variant_id": $VARIANT_ID,
        "quantity": 1,
        "properties": [
          {"name": "_custom_art_url",      "value": "$FAKE_ART_URL"},
          {"name": "_custom_art_filename", "value": "test-kid-sketch.png"},
          {"name": "_custom_art_type",     "value": "upload"},
          {"name": "_kid_name",            "value": "Sophie"},
          {"name": "_message_to_mum",      "value": "You're the best mum ever!"}
        ]
      }
    ],
    "customer": {"email": "riketpatel+ks-personalizer-test@hariomtatsatinvestments.com"},
    "shipping_address": {
      "first_name": "Riket",
      "last_name":  "Test",
      "address1":   "1 Test Street",
      "city":       "Sydney",
      "province":   "New South Wales",
      "province_code": "NSW",
      "country":    "Australia",
      "country_code": "AU",
      "zip":        "2000",
      "phone":      "+61400000000"
    },
    "tags": "personalizer-test, mothers-day-2026, do-not-fulfill",
    "note": "AUTOMATED TEST — do not fulfill. Created by 05-place-draft-order.sh to verify custom art line-item properties flow through to orders. Delete this draft after inspection."
  }
}
print(json.dumps(o))
PY
)

HTTP=$(curl -sS --ssl-no-revoke -o /tmp/draft.json -w '%{http_code}' \
  -X POST -H "$AUTH" -H 'Content-Type: application/json' \
  -d "$PAYLOAD" \
  "${BASE}/draft_orders.json")

if [[ "$HTTP" != "201" ]]; then
  echo "FAIL  draft order HTTP=$HTTP" >&2
  head -c 600 /tmp/draft.json >&2; echo
  exit 1
fi

DRAFT_ID=$(python3 -c "import json; print(json.load(open('/tmp/draft.json'))['draft_order']['id'])")
DRAFT_NAME=$(python3 -c "import json; print(json.load(open('/tmp/draft.json'))['draft_order']['name'])")

echo "OK    draft order created: id=$DRAFT_ID name=$DRAFT_NAME"
echo
echo "Inspect it here:"
echo "  https://admin.shopify.com/store/bfeb49-2/draft_orders/$DRAFT_ID"
echo
echo "What to verify in the admin:"
echo "  \u2713 Line item shows \"Best Mum Ever Sketch Mug\""
echo "  \u2713 Properties section shows _custom_art_url, _kid_name, _message_to_mum"
echo "  \u2713 Tag 'personalizer-test' is set"
echo
echo "When done inspecting, delete the draft:"
echo "  curl -X DELETE -H \"\$AUTH\" \"${BASE}/draft_orders/$DRAFT_ID.json\""
