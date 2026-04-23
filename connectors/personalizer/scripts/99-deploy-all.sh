#!/usr/bin/env bash
# 99-deploy-all.sh
# Orchestrator: runs the personalizer deploy end-to-end.
# Idempotent — safe to re-run after fixing a failure.
#
# Usage:
#   bash 99-deploy-all.sh
#
# Env overrides (optional):
#   ENV_FILE=/path/to/API-KEYS.env
#   SHOP_DOMAIN=bfeb49-2.myshopify.com
#
# Exits non-zero on any step failure — fix the blocker and re-run.

set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"

banner() {
  echo
  echo "================================================================"
  echo "  $1"
  echo "================================================================"
}

banner "Step 1/5 — Validate access"
bash "$HERE/01-validate-access.sh"

banner "Step 2/5 — Create Mother's Day collection"
bash "$HERE/02-create-collection.sh"

banner "Step 3/5 — Create 12 POD products"
node "$HERE/03-create-products.js"

banner "Step 4/5 — Install theme assets + personalized template"
bash "$HERE/04-install-theme-assets.sh"

banner "Step 5/5 — Place fake draft order (end-to-end test)"
bash "$HERE/05-place-draft-order.sh"

banner "ALL DONE \u2014 next manual checks"
cat <<'EOS'
  1. Open the store admin:
     https://admin.shopify.com/store/bfeb49-2/products
     Confirm the 12 Mother's Day products are there in DRAFT status.

  2. Preview one product (click any of the 12 \u2192 "View" button):
     Confirm the "Personalize this gift" section renders on the product page.
     (The section should appear below the main product info.)

  3. Inspect the draft order (url printed by step 5):
     Confirm line-item properties show (art URL, kid name, message).

  4. When satisfied, promote products from Draft \u2192 Active one by one:
     admin \u2192 each product \u2192 right sidebar \u2192 "Active" \u2192 Save.
     (Promoting per-product is intentional \u2014 respects the
     "no bulk file import" rule and keeps the theme hands-off.)

  5. Delete the test draft order:
     admin \u2192 Draft orders \u2192 the one tagged "personalizer-test" \u2192 Delete.
EOS
