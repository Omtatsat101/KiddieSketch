-- KiddieSketch Personalizer — Storage bucket setup
-- Bucket: ks-custom-art
-- Structure: uploads/{merchant_shop}/{yyyy-mm-dd}/{uuid}-{filename}
-- Public read (so Printify can fetch the PNG for print fulfillment).
-- Service-role write (Cloudflare Worker uploads on behalf of anon customers).
-- Data sovereignty: all files live in Supabase, never replicated to 3rd-party CDNs.

-- ============================================================
-- CREATE BUCKET
-- ============================================================
-- Run in Supabase SQL editor OR via supabase CLI: supabase storage bucket create ks-custom-art --public
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ks-custom-art',
  'ks-custom-art',
  true,                                    -- public read (Printify needs to fetch)
  10 * 1024 * 1024,                        -- 10 MB per file
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ============================================================
-- POLICIES — storage.objects table
-- ============================================================

-- Drop any existing matching policies to make this idempotent
DROP POLICY IF EXISTS "ks_custom_art_public_read"  ON storage.objects;
DROP POLICY IF EXISTS "ks_custom_art_service_write" ON storage.objects;
DROP POLICY IF EXISTS "ks_custom_art_anon_block"   ON storage.objects;

-- Public read: anyone can GET a file in this bucket by URL (required for Printify fetch).
-- The URL itself is unguessable (uuid in path), and we don't enumerate.
CREATE POLICY "ks_custom_art_public_read"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'ks-custom-art');

-- Service role (Cloudflare Worker): INSERT + UPDATE + DELETE.
CREATE POLICY "ks_custom_art_service_write"
  ON storage.objects
  FOR ALL
  TO service_role
  USING (bucket_id = 'ks-custom-art')
  WITH CHECK (bucket_id = 'ks-custom-art');

-- Block anon from direct writes — they must go through the Worker which has rate limiting,
-- validation, and hash-based abuse tracking.
CREATE POLICY "ks_custom_art_anon_block"
  ON storage.objects
  FOR INSERT
  TO anon
  WITH CHECK (bucket_id <> 'ks-custom-art');

-- ============================================================
-- CLEANUP FUNCTION — remove orphaned uploads (no order within 30 days)
-- ============================================================
-- Scheduled via pg_cron in Supabase: daily at 03:00 UTC
CREATE OR REPLACE FUNCTION public.purge_orphaned_custom_art()
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $$
DECLARE
  deleted_count integer := 0;
  rec           record;
BEGIN
  FOR rec IN
    SELECT id, art_storage_path
    FROM public.custom_art_submissions
    WHERE shopify_order_id IS NULL
      AND created_at < now() - interval '30 days'
  LOOP
    -- Remove the file from storage
    DELETE FROM storage.objects
    WHERE bucket_id = 'ks-custom-art'
      AND name = rec.art_storage_path;

    -- Mark the row (don't hard-delete so we keep analytics)
    UPDATE public.custom_art_submissions
    SET art_url = '',
        review_note = 'orphaned — purged after 30 days'
    WHERE id = rec.id;

    deleted_count := deleted_count + 1;
  END LOOP;

  RETURN deleted_count;
END;
$$;

COMMENT ON FUNCTION public.purge_orphaned_custom_art() IS
  'Deletes upload files from ks-custom-art storage when the submission was never tied to an order within 30 days. Safe to re-run.';

-- Schedule (requires pg_cron extension — enable in Supabase dashboard if not already):
--   SELECT cron.schedule('purge_orphaned_custom_art_daily', '0 3 * * *', $$SELECT public.purge_orphaned_custom_art();$$);
