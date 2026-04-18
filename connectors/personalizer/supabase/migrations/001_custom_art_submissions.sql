-- KiddieSketch Personalizer — Custom Art Submissions
-- Migration: 001
-- Date: 2026-04-18
-- Multi-tenant from day one: merchant_shop identifies which store the submission belongs to.
-- Data sovereignty: all submissions stay in Supabase, never leave our infrastructure.

-- ============================================================
-- TABLE: custom_art_submissions
-- ============================================================
CREATE TABLE IF NOT EXISTS public.custom_art_submissions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  -- Multi-tenant identity
  merchant_shop         text NOT NULL,                 -- e.g. "kiddiesketch.myshopify.com"
  brand_id              uuid,                          -- fk to brands(id) — optional for non-Kiddie merchants
  store_id              uuid,                          -- fk to stores(id) — optional

  -- Product context at time of submission
  product_id            text,                          -- Shopify product id (numeric string)
  product_handle        text,
  product_variant_id    text,

  -- The art
  art_url               text NOT NULL,                 -- public Supabase Storage URL
  art_storage_path      text NOT NULL,                 -- path inside ks-custom-art bucket
  art_filename          text,                          -- customer-supplied original filename
  art_mimetype          text,                          -- image/png | image/jpeg | image/webp
  art_size_bytes        integer,
  art_type              text NOT NULL DEFAULT 'upload' -- 'upload' | 'ai-generated'
                        CHECK (art_type IN ('upload', 'ai-generated')),
  art_ai_prompt         text,                          -- only for ai-generated

  -- Personalization metadata from the theme section
  kid_name              text,
  message_to_mum        text,

  -- Order linkage (populated after checkout by the fulfillment scenario)
  shopify_order_id      text,
  shopify_order_number  text,                          -- human-readable #1234
  shopify_line_item_id  text,
  shopify_customer_id   text,
  customer_email        text,

  -- Review workflow (Riket approves uploads before Printify push; AI auto-approves)
  review_status         text NOT NULL DEFAULT 'pending'
                        CHECK (review_status IN ('pending', 'approved', 'rejected')),
  reviewed_at           timestamptz,
  reviewed_by           text,
  review_note           text,

  -- Printify fulfillment trace
  pushed_to_printify_at timestamptz,
  printify_shop_id      text,
  printify_product_id   text,
  printify_order_id     text,
  printify_error        text,

  -- Abuse / analytics
  client_ip_hash        text,                          -- sha256 of ip+salt, never raw IP
  client_ua_hash        text,
  referer_host          text
);

-- Updated-at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_custom_art_submissions_updated_at ON public.custom_art_submissions;
CREATE TRIGGER trg_custom_art_submissions_updated_at
  BEFORE UPDATE ON public.custom_art_submissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_custom_art_merchant_shop
  ON public.custom_art_submissions (merchant_shop);
CREATE INDEX IF NOT EXISTS idx_custom_art_created_at
  ON public.custom_art_submissions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_custom_art_order
  ON public.custom_art_submissions (shopify_order_id)
  WHERE shopify_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_custom_art_review_status
  ON public.custom_art_submissions (review_status)
  WHERE review_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_custom_art_product
  ON public.custom_art_submissions (merchant_shop, product_id);

-- ============================================================
-- ROW-LEVEL SECURITY
-- ============================================================
ALTER TABLE public.custom_art_submissions ENABLE ROW LEVEL SECURITY;

-- Anon role: can INSERT a new submission (from the storefront upload endpoint)
-- but cannot read other merchants' submissions.
DROP POLICY IF EXISTS "anon_insert_own_submission" ON public.custom_art_submissions;
CREATE POLICY "anon_insert_own_submission"
  ON public.custom_art_submissions
  FOR INSERT
  TO anon
  WITH CHECK (true);  -- Worker inserts with service_role, anon uploads via Worker only

-- Service role: full access (used by Cloudflare Worker + Make.com + Claude)
DROP POLICY IF EXISTS "service_role_all" ON public.custom_art_submissions;
CREATE POLICY "service_role_all"
  ON public.custom_art_submissions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated merchants (future: when merchants log into a dashboard at app.kiddiesketchapp.com)
-- can read their own submissions only.
DROP POLICY IF EXISTS "merchants_select_own" ON public.custom_art_submissions;
CREATE POLICY "merchants_select_own"
  ON public.custom_art_submissions
  FOR SELECT
  TO authenticated
  USING (
    merchant_shop = (auth.jwt() ->> 'shop')
  );

-- ============================================================
-- CONVENIENCE VIEWS
-- ============================================================

-- Pending review queue (what Riket sees when he opens the review dashboard)
CREATE OR REPLACE VIEW public.v_pending_custom_art_review AS
SELECT
  id,
  created_at,
  merchant_shop,
  product_handle,
  art_url,
  art_type,
  kid_name,
  message_to_mum,
  shopify_order_id,
  customer_email
FROM public.custom_art_submissions
WHERE review_status = 'pending'
  AND pushed_to_printify_at IS NULL
ORDER BY created_at ASC;

-- Recent activity per merchant
CREATE OR REPLACE VIEW public.v_custom_art_recent AS
SELECT
  merchant_shop,
  date_trunc('day', created_at) AS day,
  count(*) FILTER (WHERE art_type = 'upload')       AS uploads,
  count(*) FILTER (WHERE art_type = 'ai-generated') AS ai_generations,
  count(*) FILTER (WHERE review_status = 'approved') AS approved,
  count(*) FILTER (WHERE review_status = 'rejected') AS rejected,
  count(*) FILTER (WHERE pushed_to_printify_at IS NOT NULL) AS fulfilled,
  count(*) AS total
FROM public.custom_art_submissions
WHERE created_at > now() - interval '90 days'
GROUP BY merchant_shop, date_trunc('day', created_at)
ORDER BY day DESC, merchant_shop;

COMMENT ON TABLE public.custom_art_submissions IS
  'KiddieSketch Personalizer — stores every customer-uploaded or AI-generated custom art submission, linked to Shopify orders and Printify fulfillment. Multi-tenant: merchant_shop identifies the originating Shopify store.';
