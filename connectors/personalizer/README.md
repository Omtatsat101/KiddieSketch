# KiddieSketch Personalizer

**Status:** Phase 1 build complete (upload-only). Ready to deploy to staging.
**Target launch:** Mother's Day 2026 (May 11)
**Stores:** KiddieSketch first (dogfood), reusable across any Shopify store.

## What this does

Lets KiddieSketch customers:
1. Upload their kid's actual drawing on the product page
2. Preview it before adding to cart
3. Optionally add kid's name + message to Mum
4. Have the drawing printed on the product via Printify

**Phase 2 (post-launch):** AI sketch generation, using Riket's open-source model API.

## Architecture (half theme / half connector)

```
Customer browser
     │
     │ uploads sketch
     ▼
Shopify theme section (Liquid + vanilla JS)
  "Personalize this gift"
     │
     │ POST /upload-art
     ▼
Cloudflare Worker (api.kiddiesketchapp.com)
     │
     ├──► Supabase Storage (ks-custom-art bucket)
     │
     └──► Supabase Postgres (custom_art_submissions row)
     │
     │ returns art URL
     ▼
Shopify cart line-item properties
  _custom_art_url
  _kid_name
  _message_to_mum
     │
     │ order placed
     ▼
Make.com scenario (Shopify watchOrders)
     │
     ├──► Supabase PATCH (link order to submission)
     │
     └──► Gmail notification → Riket fulfills in Printify
         (Phase 1.5: direct Printify API push)
```

**Data sovereignty:** all art files + submission rows live in Supabase. No third-party storage. No data leaves our infra.

## Folder tree

```
connectors/personalizer/
├── README.md                                   # this file
├── theme/                                      # Shopify theme customizations
│   ├── sections/personalize-gift.liquid        # the section block
│   ├── snippets/                               # (reserved for future reusable bits)
│   └── assets/
│       ├── personalize-gift.js                 # vanilla JS, no framework
│       └── personalize-gift.css                # scoped styles
├── worker/                                     # Cloudflare Worker (API)
│   ├── src/index.js                            # /upload-art, /health, /generate-sketch (stub)
│   ├── wrangler.toml                           # deploy config
│   ├── package.json
│   └── .dev.vars.example                       # secret template (copy to .dev.vars)
├── supabase/                                   # schema + storage SQL
│   ├── migrations/001_custom_art_submissions.sql
│   └── storage/ks-custom-art-bucket.sql
├── make/                                       # Make.com scenario
│   ├── personalizer-fulfillment.md             # full design doc
│   └── phase1-minimal-scenario.json            # importable starter blueprint
└── docs/
    ├── PHASE1-DEPLOY-RUNBOOK.md                # step-by-step deploy
    ├── ARCHITECTURE.md                         # deeper architecture notes
    └── MORNING-REPORT.md                       # what Riket should do first
```

## Deploy order (see PHASE1-DEPLOY-RUNBOOK.md for full steps)

1. Supabase SQL → run migrations + create bucket (5 min)
2. Cloudflare Worker → set secrets, deploy to api.kiddiesketchapp.com (10 min)
3. Shopify theme → pull, drop section files in, push draft, preview (15 min)
4. Make.com → import scenario blueprint, bind connections (10 min)
5. End-to-end test with Riket's own kid-drawing upload (5 min)
6. Go live by adding section to Mother's Day product templates (5 min)

**Total deploy time:** ~45-60 minutes.

## What's explicitly NOT in Phase 1

- AI sketch generation (`/generate-sketch` returns 501 Not Implemented)
- Direct Printify API push on order (manual via Gmail notification instead — ~2 min per order)
- Merchant dashboard at app.kiddiesketchapp.com (Phase 2)
- Shopify Billing integration (Phase 2, when app becomes public SaaS)
- Per-merchant theming/branding of the section (Phase 2)
- Rate limiting in Worker code (relies on Cloudflare dashboard rules)
