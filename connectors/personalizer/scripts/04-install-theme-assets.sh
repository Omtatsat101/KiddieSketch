#!/usr/bin/env bash
# 04-install-theme-assets.sh
# Uploads the Personalizer theme assets INTO the live Shopify-managed theme
# without overwriting anything else. Hands-off theme rule respected: we only
# ADD new asset files, plus a new product template that opts in per product.
#
# What it uploads:
#   assets/personalize-gift.css   — scoped styles
#   assets/personalize-gift.js    — client upload widget
#   sections/personalize-gift.liquid — the section block
#   templates/product.personalized.json — new product template that renders
#                                        the default product sections PLUS
#                                        the personalize section
#
# The default `templates/product.json` is NOT touched. Existing products
# keep their current template; only the 12 Mother's Day products (created
# with template_suffix='personalized') use the new template.

set -euo pipefail

ENV_FILE="${ENV_FILE:-$HOME/OneDrive/Desktop/Organized/projects/API-KEYS.env}"
kv() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d'=' -f2-; }

SHOP_DOMAIN="${SHOP_DOMAIN:-bfeb49-2.myshopify.com}"
TOKEN=$(kv SHOPIFY_KS_ACCESS_TOKEN)
API_VER="2025-01"
AUTH="X-Shopify-Access-Token: $TOKEN"
BASE="https://${SHOP_DOMAIN}/admin/api/${API_VER}"

[[ "$TOKEN" =~ ^shpat_ ]] || { echo "ERR  SHOPIFY_KS_ACCESS_TOKEN must be shpat_ Admin API token" >&2; exit 2; }

HERE="$(cd "$(dirname "$0")/.." && pwd)"
LIQUID="${HERE}/theme/sections/personalize-gift.liquid"
CSS="${HERE}/theme/assets/personalize-gift.css"
JS="${HERE}/theme/assets/personalize-gift.js"

for f in "$LIQUID" "$CSS" "$JS"; do
  [[ -f "$f" ]] || { echo "ERR  missing file: $f" >&2; exit 2; }
done

# Step 1: find the MAIN theme (role = main)
echo "INFO  looking up main theme..."
MAIN_THEME_ID=$(curl -sS --ssl-no-revoke -H "$AUTH" "${BASE}/themes.json" \
  | python3 -c "import sys, json; d=json.load(sys.stdin); print(next((t['id'] for t in d['themes'] if t['role']=='main'), ''))")
[[ -n "$MAIN_THEME_ID" ]] || { echo "ERR  could not find main theme" >&2; exit 1; }
echo "INFO  main theme id=$MAIN_THEME_ID"

# Step 2: back up the current product.json + check if personalized template exists
echo "INFO  backing up current product.json..."
curl -sS --ssl-no-revoke -H "$AUTH" \
  "${BASE}/themes/${MAIN_THEME_ID}/assets.json?asset[key]=templates/product.json" \
  -o "/tmp/ks_theme_backup_product_json_$(date -u +%Y%m%dT%H%M%SZ).json" \
  && echo "INFO  backed up to /tmp/ks_theme_backup_product_json_*.json" \
  || echo "WARN  backup read failed (may be a .liquid template, not .json — continuing)"

# Step 3: upload the 3 asset files. We base64 the CSS/JS/Liquid since Admin
# API `asset` PUT accepts either `value` (text) or `attachment` (base64).
put_asset() {
  local key="$1" file="$2"
  local tmpjson
  tmpjson=$(mktemp)
  python3 - "$key" "$file" > "$tmpjson" <<'PY'
import json, sys, base64
key, path = sys.argv[1], sys.argv[2]
with open(path, 'rb') as f:
    data = f.read()
# Prefer text value; Shopify accepts text for .liquid/.css/.js
try:
    value = data.decode('utf-8')
    body = {'asset': {'key': key, 'value': value}}
except UnicodeDecodeError:
    body = {'asset': {'key': key, 'attachment': base64.b64encode(data).decode('ascii')}}
print(json.dumps(body))
PY
  local http
  http=$(curl -sS --ssl-no-revoke -o /tmp/asset_put.json -w '%{http_code}' \
    -X PUT -H "$AUTH" -H 'Content-Type: application/json' \
    --data-binary "@$tmpjson" \
    "${BASE}/themes/${MAIN_THEME_ID}/assets.json")
  rm -f "$tmpjson"
  [[ "$http" == "200" ]] \
    && echo "OK    uploaded $key" \
    || { echo "FAIL  $key HTTP=$http body=$(head -c 300 /tmp/asset_put.json)" >&2; return 1; }
}

echo "INFO  uploading theme assets..."
put_asset "assets/personalize-gift.css" "$CSS"
put_asset "assets/personalize-gift.js" "$JS"
put_asset "sections/personalize-gift.liquid" "$LIQUID"

# Step 4: create the personalized product template (only if not already there).
# The template references the 'main-product' default section + our new
# personalize-gift section. We piggyback on Shopify's OS 2.0 JSON templates.
TEMPLATE_BODY=$(cat <<'JSON'
{
  "name": "Product — Personalized",
  "sections": {
    "main": {
      "type": "main-product",
      "blocks": {},
      "block_order": []
    },
    "personalize": {
      "type": "personalize-gift",
      "settings": {}
    },
    "related-products": {
      "type": "related-products",
      "settings": {
        "heading": "You might also love",
        "products_to_show": 4,
        "columns_desktop": 4
      }
    }
  },
  "order": ["main", "personalize", "related-products"]
}
JSON
)

echo "INFO  writing templates/product.personalized.json..."
python3 - "$TEMPLATE_BODY" <<'PY' > /tmp/tpl_payload.json
import json, sys
tpl = sys.argv[1]
# validate JSON
json.loads(tpl)
print(json.dumps({'asset': {'key': 'templates/product.personalized.json', 'value': tpl}}))
PY
HTTP=$(curl -sS --ssl-no-revoke -o /tmp/tpl.json -w '%{http_code}' \
  -X PUT -H "$AUTH" -H 'Content-Type: application/json' \
  --data-binary "@/tmp/tpl_payload.json" \
  "${BASE}/themes/${MAIN_THEME_ID}/assets.json")
if [[ "$HTTP" == "200" ]]; then
  echo "OK    uploaded templates/product.personalized.json"
else
  echo "FAIL  template upload HTTP=$HTTP" >&2
  head -c 500 /tmp/tpl.json >&2; echo
  cat >&2 <<'NOTE'
  Note: if you see "unable to find section 'main-product'", your theme may
  use a different section name (e.g. 'product-template', 'product-form').
  Open the theme file 'templates/product.json' to see the correct name and
  patch the section 'type' in this script.
NOTE
  exit 1
fi

echo
echo "=== DONE =================================================="
echo "Theme id: $MAIN_THEME_ID"
echo "Files installed:"
echo "  - assets/personalize-gift.css"
echo "  - assets/personalize-gift.js"
echo "  - sections/personalize-gift.liquid"
echo "  - templates/product.personalized.json"
echo
echo "Products created with template_suffix=personalized will now render"
echo "the section automatically. Other products are untouched."
