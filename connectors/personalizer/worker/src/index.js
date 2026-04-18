/*
 * KiddieSketch Personalizer API — Cloudflare Worker
 * Deploy to: api.kiddiesketchapp.com (staging) → api.kiddiesketch.app (production)
 *
 * Endpoints:
 *   POST   /upload-art      — Phase 1: customer-uploaded sketch
 *   POST   /generate-sketch — Phase 2 (stubbed, 501)
 *   GET    /health          — liveness
 *
 * Data sovereignty: all customer art goes to OUR Supabase bucket. No third-party storage.
 */

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const BUCKET = 'ks-custom-art';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return corsResponse(origin, env);
    }

    try {
      switch (`${request.method} ${url.pathname}`) {
        case 'GET /health':
          return json({ ok: true, ts: new Date().toISOString() }, 200, origin, env);

        case 'POST /upload-art':
          return await handleUploadArt(request, env, origin, ctx);

        case 'POST /generate-sketch':
          return json(
            { error: "AI generation launches post-Mother's Day. Use /upload-art for now." },
            501,
            origin,
            env
          );

        default:
          return json({ error: 'Not found', path: url.pathname }, 404, origin, env);
      }
    } catch (err) {
      console.error('[worker] unhandled', err && err.stack || err);
      return json({ error: 'Server error' }, 500, origin, env);
    }
  }
};

// ------------------------------------------------------------------
// Handlers
// ------------------------------------------------------------------

async function handleUploadArt(request, env, origin, ctx) {
  if (!isAllowedOrigin(origin, env)) {
    return json({ error: 'Origin not allowed' }, 403, origin, env);
  }

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return json({ error: 'Expected multipart/form-data body' }, 400, origin, env);
  }

  const file = formData.get('file');
  const shop = (formData.get('shop') || '').toString().trim();
  const productId = (formData.get('product_id') || '').toString().trim();
  const productHandle = (formData.get('product_handle') || '').toString().trim();

  if (!file || typeof file === 'string') {
    return json({ error: 'Missing file' }, 400, origin, env);
  }
  if (!shop) {
    return json({ error: 'Missing shop' }, 400, origin, env);
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return json({ error: 'Unsupported file type. Use PNG, JPG, or WEBP.' }, 415, origin, env);
  }
  if (file.size <= 0 || file.size > MAX_BYTES) {
    return json({ error: 'File too large (max 10 MB).' }, 413, origin, env);
  }

  // Basic abuse tracking — hash IP so we never store raw IPs
  const clientIp = request.headers.get('CF-Connecting-IP') || '';
  const ua = request.headers.get('User-Agent') || '';
  const ipHash = await sha256(clientIp + '|' + (env.HASH_SALT || 'ks-dev'));
  const uaHash = await sha256(ua + '|' + (env.HASH_SALT || 'ks-dev'));
  const refererHost = safeRefererHost(request.headers.get('Referer'));

  // Storage path: uploads/<shop>/<yyyy-mm-dd>/<uuid>-<filename>
  const uuid = crypto.randomUUID();
  const today = new Date().toISOString().slice(0, 10);
  const safeName = sanitizeFilename(file.name || 'sketch.png');
  const storagePath = `uploads/${shop}/${today}/${uuid}-${safeName}`;

  // Stream the file into Supabase Storage
  const uploadRes = await fetch(
    `${env.SUPABASE_URL}/storage/v1/object/${BUCKET}/${storagePath}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': file.type,
        'x-upsert': 'true',
        'Cache-Control': 'public, max-age=31536000, immutable'
      },
      body: file.stream()
    }
  );

  if (!uploadRes.ok) {
    const text = await uploadRes.text();
    console.error('[worker] supabase upload failed', uploadRes.status, text);
    return json({ error: 'Upload failed. Please try again.' }, 502, origin, env);
  }

  // Public URL (bucket is public-read; path is uuid-guarded)
  const publicUrl = `${env.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`;

  // Insert submission row via PostgREST
  const submissionId = crypto.randomUUID();
  const row = {
    id: submissionId,
    merchant_shop: shop,
    product_id: productId || null,
    product_handle: productHandle || null,
    art_url: publicUrl,
    art_storage_path: storagePath,
    art_filename: safeName,
    art_mimetype: file.type,
    art_size_bytes: file.size,
    art_type: 'upload',
    review_status: 'pending',
    client_ip_hash: ipHash,
    client_ua_hash: uaHash,
    referer_host: refererHost
  };

  const insertRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/custom_art_submissions`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify(row)
    }
  );

  if (!insertRes.ok) {
    const text = await insertRes.text();
    console.error('[worker] supabase insert failed', insertRes.status, text);
    // Don't fail the customer — we have the file, the DB record can be backfilled.
    // But log loudly.
    ctx.waitUntil(notifyInsertFailure(env, { submissionId, shop, storagePath, error: text }));
  }

  // Fire a review-queue webhook (Make.com) so Riket gets a notification in near-real-time.
  if (env.MAKE_REVIEW_WEBHOOK_URL) {
    ctx.waitUntil(
      fetch(env.MAKE_REVIEW_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'custom_art_submitted',
          submission_id: submissionId,
          merchant_shop: shop,
          product_handle: productHandle,
          art_url: publicUrl,
          created_at: new Date().toISOString()
        })
      }).catch((e) => console.error('[worker] make webhook failed', e))
    );
  }

  return json(
    {
      ok: true,
      submission_id: submissionId,
      url: publicUrl,
      filename: safeName,
      storage_path: storagePath
    },
    200,
    origin,
    env
  );
}

async function notifyInsertFailure(env, payload) {
  if (!env.SLACK_ALERTS_URL) return;
  try {
    await fetch(env.SLACK_ALERTS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `:warning: KS Personalizer Worker — Supabase insert failed\n${JSON.stringify(payload, null, 2)}`
      })
    });
  } catch (e) {
    console.error('[worker] slack alert failed', e);
  }
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function json(payload, status, origin, env) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  };
  applyCors(headers, origin, env);
  return new Response(JSON.stringify(payload), { status, headers });
}

function corsResponse(origin, env) {
  const headers = {
    'Access-Control-Max-Age': '86400'
  };
  applyCors(headers, origin, env);
  return new Response(null, { status: 204, headers });
}

function applyCors(headers, origin, env) {
  if (isAllowedOrigin(origin, env)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Vary'] = 'Origin';
    headers['Access-Control-Allow-Methods'] = 'POST, GET, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type';
  }
}

function isAllowedOrigin(origin, env) {
  if (!origin) return false;
  const list = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!list.length) return true; // permissive in dev when unset
  return list.includes(origin);
}

function sanitizeFilename(name) {
  // Keep extension; replace anything non-alnum/dash/underscore/dot with underscore; cap length.
  const cleaned = String(name).replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_');
  return cleaned.slice(0, 80) || 'sketch.png';
}

function safeRefererHost(referer) {
  if (!referer) return null;
  try {
    return new URL(referer).host;
  } catch {
    return null;
  }
}

async function sha256(input) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}
