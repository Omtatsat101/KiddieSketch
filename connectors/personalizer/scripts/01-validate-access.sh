#!/usr/bin/env bash
# 01-validate-access.sh
# Sanity-checks all required API access before any destructive script runs.
# Exits 0 if all green, non-zero on any failure.

set -euo pipefail

ENV_FILE="${ENV_FILE:-$HOME/OneDrive/Desktop/Organized/projects/API-KEYS.env}"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERR  API-KEYS.env not found at: $ENV_FILE" >&2
  exit 2
fi

kv() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d'=' -f2-; }

SHOP_DOMAIN="${SHOP_DOMAIN:-bfeb49-2.myshopify.com}"
KS_TOKEN=$(kv SHOPIFY_KS_ACCESS_TOKEN)
SB_URL=$(kv SUPABASE_URL)
SB_KEY=$(kv SUPABASE_SERVICE_ROLE_KEY)
CF_TOKEN=$(kv CLOUDFLARE_ACCOUNT_TOKEN)
CF_ACCT=$(kv CLOUDFLARE_ACCOUNT_ID)

PASS=0
FAIL=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "1" ]]; then
    echo "PASS $label"
    PASS=$((PASS+1))
  else
    echo "FAIL $label" >&2
    FAIL=$((FAIL+1))
  fi
}

echo "=== Preflight =================================================="

# ---- 1. Shopify Admin API token format ---------------------------------
if [[ "$KS_TOKEN" =~ ^shpat_ ]]; then
  # Good prefix; test against API
  HTTP=$(curl -sS --ssl-no-revoke -o /tmp/ks_shop.json -w '%{http_code}' \
    -H "X-Shopify-Access-Token: $KS_TOKEN" \
    "https://${SHOP_DOMAIN}/admin/api/2025-01/shop.json" || echo "000")
  [[ "$HTTP" == "200" ]] && check "Shopify Admin API ($SHOP_DOMAIN)" 1 \
    || { check "Shopify Admin API ($SHOP_DOMAIN)" 0; \
         echo "     HTTP=$HTTP body=$(head -c 200 /tmp/ks_shop.json)" >&2; }
elif [[ "$KS_TOKEN" =~ ^shpss_ ]]; then
  check "Shopify Admin API token format" 0
  cat >&2 <<'EOS'
     >>> Your SHOPIFY_KS_ACCESS_TOKEN starts with shpss_ which is a STOREFRONT
         API token, not an Admin API token. Admin tokens start with shpat_.
     FIX (2 minutes):
       1. Open https://admin.shopify.com/store/bfeb49-2/settings/apps
       2. Click the "Codex-API-Kiddiesketch" (or "Riket AI OS") custom app
       3. Go to API credentials tab
       4. Under "Admin API access token" click "Reveal token once" or "Install"
       5. Copy the shpat_... token
       6. Paste into projects/API-KEYS.env under SHOPIFY_KS_ACCESS_TOKEN
       7. Re-run this script
EOS
else
  check "Shopify Admin API token set" 0
fi

# ---- 2. Supabase reachability ------------------------------------------
HTTP=$(curl -sS --ssl-no-revoke -o /tmp/sb.txt -w '%{http_code}' \
  --max-time 8 \
  -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY" \
  "${SB_URL}/rest/v1/" || echo "000")
if [[ "$HTTP" == "200" ]]; then
  check "Supabase REST reachable" 1
elif [[ "$HTTP" == "000" ]]; then
  check "Supabase REST reachable" 0
  cat >&2 <<EOS
     >>> Supabase host ($SB_URL) did not resolve or timed out.
         Most likely cause: free-tier project is PAUSED (auto-pause after 7 days).
     FIX (1 minute):
       1. Open https://app.supabase.com
       2. Find the doxmbwizpsyqruyrmffs project
       3. Click "Restore project"
       4. Wait ~30 seconds for it to spin back up
       5. Re-run this script
EOS
else
  check "Supabase REST (HTTP $HTTP)" 0
fi

# ---- 3. Cloudflare account ---------------------------------------------
HTTP=$(curl -sS --ssl-no-revoke -o /tmp/cf.txt -w '%{http_code}' \
  -H "Authorization: Bearer $CF_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$CF_ACCT" || echo "000")
[[ "$HTTP" == "200" ]] && check "Cloudflare account API" 1 \
  || check "Cloudflare account API (HTTP $HTTP)" 0

# ---- 4. Cloudflare zone for kiddiesketchapp.com ------------------------
CF_ZONE_TOKEN=$(kv CLOUDFLARE_ZONE_TOKEN)
ZONE_RESP=$(curl -sS --ssl-no-revoke -H "Authorization: Bearer $CF_ZONE_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones?name=kiddiesketchapp.com" || echo "{}")
ZONE_COUNT=$(echo "$ZONE_RESP" | grep -o '"count":[0-9]*' | head -1 | cut -d: -f2 || echo "0")
if [[ "${ZONE_COUNT:-0}" -gt 0 ]]; then
  check "Cloudflare zone: kiddiesketchapp.com" 1
else
  check "Cloudflare zone: kiddiesketchapp.com NOT FOUND" 0
  cat >&2 <<'EOS'
     >>> kiddiesketchapp.com is not on Cloudflare yet. Worker route binding
         (api.kiddiesketchapp.com/*) will fail until the zone is added.
     FIX (10 min, one-time):
       1. Cloudflare dashboard → Add site → kiddiesketchapp.com → Free plan
       2. Copy the 2 Cloudflare nameservers shown
       3. Porkbun → domain list → kiddiesketchapp.com → NAMESERVERS → paste CF NS → save
       4. Wait ~5-30 min for propagation
       5. Re-run this script
EOS
fi

echo "================================================================"
echo "RESULT: $PASS passed, $FAIL failed"
[[ "$FAIL" == "0" ]] || exit 1
