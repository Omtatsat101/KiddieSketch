# Personalizer — Architecture Notes

## Design principles

1. **Half theme, half connector.** UI lives in Shopify theme as a native section (Liquid + vanilla JS, no framework). All business logic lives in Cloudflare Worker + Supabase + Make.com. The theme section is thin — file upload + line-item property injection, nothing else.

2. **Data sovereignty.** Every customer-uploaded or AI-generated image goes to our Supabase storage bucket. No third-party CDNs, no image-gen SaaS storing customer data. Respects the hard rule set in `memory/feedback_data_sovereignty.md`.

3. **Multi-tenant from day one.** The `custom_art_submissions` table has `merchant_shop`, `brand_id`, `store_id` columns on every row. Cloudflare Worker accepts any `shop` parameter. When we make the SaaS public (SketchKit on the Shopify App Store), zero schema migration needed.

4. **Theme stays Shopify-managed.** KiddieSketch theme is edited in Shopify Admin / Sidekick. The files in this repo are reference artifacts — Riket uses Shopify CLI to pull the theme, copy files in, push a draft, preview, publish. We never migrate the KS theme to GitHub-as-source-of-truth (memory rule: `feedback_kiddiesketch_theme_hands_off.md`).

5. **Upload-only first, AI second.** Ships in 5 days, not 3 weeks. AI tab is scaffolded in the theme but disabled until the open-source model API is wired.

## Why these tech choices

| Choice | Why |
|---|---|
| Vanilla JS (no React/Vue) | The section runs inside every theme. Frameworks bloat the bundle and fight the host theme's runtime. 8 KB of plain JS does the job. |
| Cloudflare Worker (not Vercel/Lambda) | Cold-start is zero; cost at our scale is zero. Custom domain routing is a wrangler.toml entry. |
| Supabase Storage (not Cloudflare R2) | Data sovereignty — everything customer-related in one place. Simpler RLS story. Printify can fetch from any public URL, so R2 wouldn't add value. |
| Make.com (not a custom Node worker) | Riket already pays for Make, has the Shopify + Supabase connections wired. Order-fulfillment automation is exactly what Make does well. |
| Line-item properties (not metafields) | Line-item properties are native cart/checkout features — they survive order creation, show in admin, are readable by Make.com without extra queries. Metafields are better for product-level data. |
| Public-read Supabase bucket (not signed URLs) | Printify needs to fetch the PNG when fulfilling. Signed URLs add rotation complexity. Path uses a UUID, so URLs are unguessable. |

## Security posture

**What's protected:**
- CORS: Worker only accepts requests from allowlisted origins (kiddiesketch.com, .myshopify.com)
- File validation: MIME type, size cap, anti-polyglot (no SVG — no script exec)
- Client IP hashed before storage (never raw IP)
- RLS on `custom_art_submissions` — anon can insert (via Worker only), only service_role can read all, merchant-auth can read own rows
- Storage bucket write-restricted to service_role (customers must go through Worker)

**What's not (and is accepted for Phase 1):**
- No image content scanning (upload could be inappropriate content) — mitigated by Riket's manual review step before Printify push
- No rate limiting in Worker code — relies on Cloudflare dashboard rules (set after deploy)
- No merchant authentication (the `shop` param is declarative, not verified) — fine for Phase 1 where KS is the only caller, but MUST be fixed before the SaaS goes public

## Flow diagram (text)

```
1. Customer visits product page
2. Theme section loads, JS attaches to form[action*="/cart/add"]
3. Customer uploads a PNG (or drags in one)
4. JS:
   - Validates type + size client-side
   - Shows local preview
   - POSTs to https://api.kiddiesketchapp.com/upload-art (multipart)
5. Worker:
   - Validates CORS origin
   - Validates MIME + size server-side (never trust client)
   - Streams file into Supabase Storage at uploads/{shop}/{date}/{uuid}-{filename}
   - Inserts custom_art_submissions row with status='pending'
   - Fires optional Make.com review webhook
   - Returns {url, submission_id, filename}
6. JS receives URL, sets hidden form inputs with line-item properties
7. Customer clicks Add to Cart → form submits → cart line includes properties[_custom_art_url]
8. Customer checks out → Shopify creates order
9. Make.com Watch Orders (15-min poll) → iterator over line items → filter for _custom_art_url
10. Per matched item:
    - PATCH custom_art_submissions row with shopify_order_id
    - Gmail Riket the fulfillment instructions
    - Write event to HQ Event Log
11. Riket opens email, copies art URL + address to Printify, submits order
12. Printify fulfills + ships
13. (Future: Phase 1.5 replaces step 11 with direct Printify API POST)
```

## Capacity / cost

| Layer | Free tier / cost | Headroom |
|---|---|---|
| Cloudflare Worker | 100K req/day free | ≈ 3,000 uploads/day — we'll hit other bottlenecks first |
| Supabase | 8 GB storage, 5 GB egress/month free | ≈ 8,000 uploads at avg 1 MB each; pay as we grow |
| Make.com | 10K ops/month on Core plan | ≈ 1,000 orders/month at ~10 ops/order — refactor at that scale |
| Printify | no API limits worth worrying about at our scale | N/A |

**At 500 Mother's Day orders:** total infra cost still $0 incremental. Riket pays his existing Make subscription.

## Scale-out plan (when this IS a public SaaS)

- Supabase → bucket per merchant (`merchant-{shop}/`) for cleaner egress accounting
- Worker → add HMAC signature verification on inbound requests (theme supplies signed JWT from the app server)
- Replace Make.com polling with Shopify webhooks (instant) — same scenario flow, just a different trigger module
- Admin dashboard at app.kiddiesketchapp.com for merchants to review submissions + see fulfillment status
- Shopify Billing API to charge subscription tiers ($19/$49/$99)
- App Block conversion: convert the theme section to a Shopify Theme App Extension App Block so it installs automatically with the app — no CLI copying required per merchant
