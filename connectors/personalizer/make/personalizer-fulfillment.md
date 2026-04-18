# Make.com Scenario — KS Personalizer Fulfillment

**Purpose:** When a KiddieSketch order includes a line item with `_custom_art_url` in properties, push the custom art to Printify so the order fulfills with the customer's actual drawing (not stock artwork).

**Trigger:** Shopify — Watch Orders (or webhook)
**Team:** 2081617 (Kiddie Brands HQ)
**Folder:** Kiddie Brands HQ (225842)
**Connection reuse:** KiddieSketch (8169522, 5 scopes — working)

---

## Scenario modules (in order)

### 1. Shopify → Watch Orders
- **Connection:** KiddieSketch (8169522)
- **Status:** Created orders
- **Interval:** 15 minutes (production) or webhook instant
- **Limit:** 20 per run

### 2. Iterator (over `line_items`)
- Input: `{{1.line_items}}`
- Output: one bundle per line item

### 3. Router — Filter: line item has custom art
- **Filter name:** `Has custom art`
- **Condition:** `{{2.properties._custom_art_url}}` — Exists: yes
- Continue only if the line item has `_custom_art_url` set.

### 4. Supabase → PATCH `custom_art_submissions` row
- **URL:** `{SUPABASE_URL}/rest/v1/custom_art_submissions?art_url=eq.{{encodeURL(2.properties._custom_art_url)}}`
- **Method:** PATCH
- **Headers:**
  - `Authorization: Bearer {SUPABASE_SERVICE_ROLE_KEY}`
  - `apikey: {SUPABASE_SERVICE_ROLE_KEY}`
  - `Content-Type: application/json`
  - `Prefer: return=representation`
- **Body:**
  ```json
  {
    "shopify_order_id": "{{1.id}}",
    "shopify_order_number": "{{1.name}}",
    "shopify_line_item_id": "{{2.id}}",
    "shopify_customer_id": "{{1.customer.id}}",
    "customer_email": "{{1.email}}"
  }
  ```

### 5. Router — Review gate
- **Branch A — art_type = "ai-generated":** go straight to Printify push (auto-approve)
- **Branch B — art_type = "upload":** go to Email (Riket) → pause for review

### 6a. Branch A — Printify → Create Order
- **Connection:** Printify
- **Shop:** KiddieSketch store ID
- **Body:**
  ```json
  {
    "external_id": "KS-{{1.name}}-{{2.id}}",
    "label": "KS #{{1.name}} — custom art",
    "line_items": [
      {
        "product_id": "{{kiddiesketch_map.printify_product_id_for(2.product_id)}}",
        "variant_id": "{{kiddiesketch_map.variant(2.variant_id)}}",
        "quantity": {{2.quantity}},
        "print_areas": {
          "front": "{{2.properties._custom_art_url}}"
        }
      }
    ],
    "shipping_method": 1,
    "send_shipping_notification": true,
    "address_to": {
      "first_name": "{{1.shipping_address.first_name}}",
      "last_name":  "{{1.shipping_address.last_name}}",
      "email":      "{{1.email}}",
      "phone":      "{{1.shipping_address.phone}}",
      "country":    "{{1.shipping_address.country_code}}",
      "region":     "{{1.shipping_address.province_code}}",
      "address1":   "{{1.shipping_address.address1}}",
      "address2":   "{{1.shipping_address.address2}}",
      "city":       "{{1.shipping_address.city}}",
      "zip":        "{{1.shipping_address.zip}}"
    }
  }
  ```
- **Needs a product-id mapping lookup** — see `product-map.json` in this folder (Phase 1 uses hardcoded Printify blueprint/variant ids per Mother's Day SKU).

### 6b. Branch B — Gmail → Send review email to Riket
- **To:** riketpatel@hariomtatsatinvestments.com
- **Subject:** `[KS Review] Custom art on order #{{1.name}} — {{1.email}}`
- **Body:**
  ```
  New customer-uploaded sketch for order #{{1.name}}.

  Art URL: {{2.properties._custom_art_url}}
  Kid's name: {{2.properties._kid_name}}
  Message: {{2.properties._message_to_mum}}
  Product: {{2.title}}
  Customer: {{1.email}}

  Review + approve: https://api.kiddiesketchapp.com/admin/review/{{submission_id}}
  (30-second check — click Approve to push to Printify, Reject to issue a refund.)
  ```
- **Important:** hold this branch with a `Sleep` module or manual resume until Riket clicks Approve. (For Phase 1 launch, Riket reviews in Supabase dashboard directly; one-click admin link comes Phase 1.5.)

### 7. Supabase → PATCH submission with Printify outcome
- Update `pushed_to_printify_at`, `printify_order_id`, `printify_product_id`, `review_status` = 'approved'.

### 8. HQ Event Log write
- Reuse existing datastore `88461` (HQ Event Log) pattern
- Log: `event_type = "personalizer.fulfilled"`, brand = KS, store = KS

---

## Scenario diagram

```
Shopify (watchOrders)
      │
      ▼
Iterator (line_items)
      │
      ▼
Filter: has _custom_art_url
      │
      ▼
Supabase PATCH (link order)
      │
      ▼
  Router (art_type)
    ┌──────────────┬──────────────┐
    │              │              │
  upload         ai-generated
    │              │
    ▼              ▼
Email Riket    Printify Create
  (review)        Order
    │              │
    ▼              │
  (manual         │
  approve)        │
    │              │
    ▼              ▼
 Printify Create Order
    │              │
    └──────┬───────┘
           ▼
Supabase PATCH (printify_order_id, pushed_at)
           │
           ▼
HQ Event Log write
```

---

## Phase 1 simplification

For Mother's Day launch, we can ship a **simpler version** first:

1. Shopify Watch Orders (KS)
2. Iterator over line items
3. Filter: has custom art URL
4. Gmail → Send Riket a fulfillment email with:
   - Order number
   - Customer address
   - The art URL
   - The product handle
   - Plain-English instructions Riket follows manually in Printify dashboard (takes 2 min per order)
5. Supabase PATCH to mark the submission tied to the order

This cuts the Printify API integration out of the critical path. Riket creates each Printify order manually for the first ~10-20 orders, builds the product-variant mapping table along the way, then we flip the switch to full automation in Phase 1.5 (1-2 weeks post-launch).

**Why start simple:** Mother's Day is 3 weeks out. Manual Printify order entry at 10-20 orders = 20-40 min of Riket's time across the entire launch. Full Printify API integration requires 12 product-variant mappings that don't exist yet (products haven't been created). Ship manual fulfillment first, automate after.

---

## Files to create in this folder (post-launch)

- `product-map.json` — Printify product/variant IDs per KS SKU, once products are created
- `scenario-blueprint.json` — exported scenario JSON (Make.com → Export) for re-import
- `webhook-setup.md` — how to switch from 15-min polling to Shopify webhooks for lower latency
