# Phase 1 Deploy Runbook
**Target:** api.kiddiesketchapp.com + KiddieSketch theme section live, Make.com scenario active, end-to-end test pass
**Time budget:** 45-60 min
**Prereqs before starting:** coffee; `kiddiesketchapp.com` DNS pointed at Cloudflare (see Step 0 if not yet)

---

## Step 0 — Cloudflare DNS for kiddiesketchapp.com (one-time, 10 min)

If `kiddiesketchapp.com` isn't already on Cloudflare:

1. Sign in at [cloudflare.com](https://dash.cloudflare.com) with the LBA Group / Hari Om Tat Sat email
2. **Add Site** → enter `kiddiesketchapp.com` → free plan
3. Cloudflare shows 2 nameservers (e.g. `abel.ns.cloudflare.com` + `gail.ns.cloudflare.com`)
4. Log in to Porkbun → `kiddiesketchapp.com` → **Authoritative Nameservers** → paste the 2 Cloudflare NS → save
5. Wait 5-30 min for propagation (`dig ns kiddiesketchapp.com` should show cloudflare)
6. Back in Cloudflare, DNS tab → add A record: `api` → `100.64.0.1` (placeholder — the Worker overrides)
   - Actually with Workers routes, this A record can be anything; Cloudflare proxies through the Worker. Use `100::` AAAA if you prefer.
   - Proxy status: **Proxied (orange cloud)** — required for Worker routes.

## Step 1 — Supabase schema + bucket (5 min)

1. Open Supabase Dashboard → SQL Editor
2. Open `connectors/personalizer/supabase/migrations/001_custom_art_submissions.sql` → copy → paste → run
3. Open `connectors/personalizer/supabase/storage/ks-custom-art-bucket.sql` → copy → paste → run
4. Verify:
   - Storage → bucket `ks-custom-art` exists, public
   - Table editor → `custom_art_submissions` exists with columns matching schema
5. (Optional) Enable pg_cron extension → schedule the `purge_orphaned_custom_art` job (SQL at bottom of `ks-custom-art-bucket.sql`)

## Step 2 — Cloudflare Worker deploy (10 min)

```bash
cd connectors/personalizer/worker
npm install
npx wrangler login            # opens browser, sign in with Cloudflare account
npx wrangler secret put SUPABASE_URL               # paste from projects/API-KEYS.env
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY  # paste from projects/API-KEYS.env
npx wrangler secret put HASH_SALT                  # any random 32+ char string
# optional secrets:
# npx wrangler secret put MAKE_REVIEW_WEBHOOK_URL
# npx wrangler secret put SLACK_ALERTS_URL
npx wrangler deploy
```

Expected output: `Deployed ks-personalizer-api at https://ks-personalizer-api.<subdomain>.workers.dev`

**Bind to the custom domain:**
- The route in `wrangler.toml` is `api.kiddiesketchapp.com/*` — wrangler adds it on deploy if the zone is in your Cloudflare account.
- Quick smoke test: `curl https://api.kiddiesketchapp.com/health` → `{"ok":true,"ts":"..."}`

## Step 3 — Shopify theme section (15 min)

**DO NOT push directly to the live theme.** Use a draft theme first.

```bash
# From the KS repo
cd connectors/personalizer/theme
shopify theme pull --store kiddiesketch.myshopify.com --path ../_working-theme
```

Copy the files:
```bash
cp sections/personalize-gift.liquid      ../_working-theme/sections/
cp assets/personalize-gift.css           ../_working-theme/assets/
cp assets/personalize-gift.js            ../_working-theme/assets/
```

Push as a **new** theme (don't overwrite live):
```bash
cd ../_working-theme
shopify theme push --store kiddiesketch.myshopify.com --unpublished --json
```

Grab the preview URL from the output. Open it.

**Add the section to a product template:**
1. Shopify admin → Online Store → Themes → click the new draft → Customize
2. Navigate to a customizable Mother's Day product page (create a test product if none exist yet)
3. "Add section" → **Personalize This Gift**
4. Drag into position (recommend: under main product form, above product description)
5. Save
6. Preview as customer → upload a test PNG → confirm it uploads and shows in preview → confirm Add-to-Cart saves `properties[_custom_art_url]` (check cart drawer)

**When the draft looks good:**
- In Customize → click Publish → the section goes live
- Or use Shopify CLI: `shopify theme push --live`

## Step 4 — Make.com scenario (10 min)

1. Make.com → Scenarios → **Create a new scenario**
2. Top-right menu → Import Blueprint → upload `connectors/personalizer/make/phase1-minimal-scenario.json`
3. Open each module and bind the placeholder connections:
   - **Module 1 (Shopify Watch Orders):** select connection `KiddieSketch (8169522)` (5 scopes, working)
   - **Module 4 (Supabase PATCH):** no connection needed; fill `{{env.SUPABASE_URL}}` and `{{env.SUPABASE_SERVICE_ROLE_KEY}}` as actual values in the module (Make doesn't resolve `{{env.X}}` — either hardcode values or use a connection)
   - **Module 5 (Gmail):** select your Gmail connection (create one if needed)
   - **Module 6 (Supabase event_log):** same as module 4 — hardcode Supabase URL + key or use connection
4. Rename scenario: `KS | Personalizer Fulfillment (Phase 1 manual)`
5. Move to folder: `Kiddie Brands HQ` (ID 225842)
6. Schedule: every 15 min
7. **Activate scenario**

## Step 5 — End-to-end test (5 min)

1. Go to the KiddieSketch store → navigate to a test product with the Personalizer section
2. Upload a test PNG (any image — doesn't have to be real art)
3. Verify:
   - Preview shows in the section
   - Status changes to "Ready to add to cart!"
   - Cart drawer shows line item with hidden properties (`View cart` → inspect line item)
4. Complete a test order (use Shopify's Bogus Gateway in dev, or a real order with you as customer)
5. Wait up to 15 min for Make.com scenario to fire
6. Verify:
   - Supabase `custom_art_submissions` row now has `shopify_order_id` populated
   - You received the fulfillment email with the art URL
   - HQ Event Log has a `personalizer.fulfillment_notified` event

## Step 6 — Add to real Mother's Day products (5 min)

For each of the 12 Mother's Day products (once they exist in Shopify):
1. Customize theme → product page → Add section → Personalize This Gift
2. Save
3. Repeat for all 12

**Shortcut:** Shopify's product templates — create one template `product.personalized` with the section pre-added, then assign that template to all 12 products at once.

---

## Rollback / "panic" button

If anything misbehaves in production:

1. **Theme:** Shopify admin → Online Store → Themes → click the CURRENT LIVE theme → Actions → Make this the live theme (reverts to the previous theme)
2. **Worker:** `npx wrangler rollback` (reverts to previous version) or delete the route in Cloudflare dashboard
3. **Make.com scenario:** toggle off — stops the email notifications, no customer impact
4. **Supabase:** migrations are additive only — no rollback needed. Bucket can stay.

---

## Known gaps (Phase 1.5 / 2 work)

- No admin review UI — Riket reviews via Gmail + Supabase dashboard for now
- No direct Printify API push — manual fulfillment from the email
- No rate limiting beyond Cloudflare free-tier defaults
- No /generate-sketch endpoint (returns 501 until AI API is wired)
- Make.com connection `KiddieGo (kakgvp-nf)` still shows "Unsupported" — unrelated to this work, but flagged for cleanup after Mother's Day ships
- Cloudflare API key commented out in `projects/API-KEYS.env` — activate it before first Worker deploy
