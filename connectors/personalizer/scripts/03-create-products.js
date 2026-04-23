#!/usr/bin/env node
/*
 * 03-create-products.js
 *
 * Creates 12 Mother's Day POD products in KiddieSketch via Shopify Admin API.
 * Per-product optimized copy drawn from PER-PRODUCT-PUBLISH-PACK.md.
 * Idempotent: if a product with the same handle already exists, updates it.
 *
 * Usage:
 *   node 03-create-products.js
 *
 * Exits 0 on full success; non-zero with summary on any failure.
 * Safe to re-run — uses handle lookups to avoid duplicates.
 */

import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import os from 'node:os';

// ---- Load env (no extra deps) ------------------------------------------
const ENV_FILE = process.env.ENV_FILE
  || path.join(os.homedir(), 'OneDrive', 'Desktop', 'Organized', 'projects', 'API-KEYS.env');

function loadEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) {
    console.error(`ERR  env file not found: ${file}`);
    process.exit(2);
  }
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}
const env = loadEnv(ENV_FILE);
const SHOP = process.env.SHOP_DOMAIN || 'bfeb49-2.myshopify.com';
const TOKEN = env.SHOPIFY_KS_ACCESS_TOKEN;
const API_VER = '2025-01';

if (!/^shpat_/.test(TOKEN)) {
  console.error('ERR  SHOPIFY_KS_ACCESS_TOKEN must be a shpat_ Admin API token. Got:', TOKEN?.slice(0, 8));
  process.exit(2);
}

// ---- Tiny Shopify client -----------------------------------------------
function ks(method, pathRel, body) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      host: SHOP,
      path: `/admin/api/${API_VER}${pathRel}`,
      method,
      headers: {
        'X-Shopify-Access-Token': TOKEN,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 20000
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        let json = null;
        try { json = data ? JSON.parse(data) : null; } catch { /* keep raw */ }
        resolve({ status: res.statusCode, body: json, raw: data });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function throttle(ms) { return new Promise(r => setTimeout(r, ms)); }

// ---- 12 products (per-product optimized, drawn from PER-PRODUCT-PUBLISH-PACK.md) ----
const PRODUCTS = [
  {
    handle: 'best-mum-ever-sketch-mug',
    title: 'Best Mum Ever Sketch Mug — Mother\u2019s Day Gift from the Kids',
    price: '29.99',
    compare: '44.99',
    seoTitle: 'Best Mum Ever Sketch Mug | Mother\u2019s Day Gift from Kids | KiddieSketch',
    metaDesc: 'A kid-drawn "Best Mum Ever" ceramic mug Mum will actually use every day. 11oz, dishwasher-safe. Free AU shipping. Order by Apr 28 for Mother\u2019s Day.',
    tags: ['mothers-day','mum-gift','best-mum','mug','ceramic-mug','mothers-day-2026','kiddiesketch-original','made-with-love','pod','for-mum','australia','aud','gift','kids-drawing','personalizable'],
    bodyHtml: `<p><strong>The mug Mum will actually reach for every morning.</strong></p>
<p>Our "Best Mum Ever" sketch mug looks like your little one drew it themselves — wobbly lines, a giant red heart, and the three words every Mum secretly wants written about her.</p>
<h4>Why Mums love it</h4>
<ul><li>Hand-drawn sketch style — feels personal, not mass-produced</li><li>Holds her full morning coffee (11oz / 325ml)</li><li>Dishwasher & microwave safe — survives real life</li><li>Arrives gift-ready for Mother\u2019s Day</li></ul>
<h4>Product details</h4>
<ul><li>11oz / 325ml ceramic mug</li><li>Glossy white finish, full-wrap print</li><li>Dishwasher and microwave safe</li><li>Printed on demand in Australia — low-waste, no overstock</li></ul>
<h4>Shipping</h4>
<p>Free AU shipping. Printed and dispatched within 2–4 business days. <strong>Order by April 28 for guaranteed Mother\u2019s Day delivery (May 11).</strong></p>
<p><em>Part of our "Made with Love" Mother\u2019s Day collection — gifts that look like your kid drew them. Because the best ones always do.</em></p>`,
    productType: 'Mother\u2019s Day Gift',
    template: 'product.personalized'
  },
  {
    handle: 'i-love-you-mum-canvas-print',
    title: 'I Love You Mum Canvas Print 8x10 — Kid-Drawn Mother\u2019s Day Gift',
    price: '39.99', compare: '59.99',
    seoTitle: 'I Love You Mum Canvas Print 8x10 | Mother\u2019s Day Wall Art | KiddieSketch',
    metaDesc: 'Sketch-style "I Love You Mum" canvas print that looks like your child drew it. Gallery-wrap 8x10. Free AU shipping. Order by Apr 28 for Mother\u2019s Day.',
    tags: ['mothers-day','mum-gift','canvas-print','wall-art','i-love-you-mum','mothers-day-2026','kiddiesketch-original','made-with-love','pod','for-mum','australia','aud','gift','kids-drawing','home-decor','personalizable'],
    bodyHtml: `<p><strong>A piece of wall art that stops her in her tracks every time she walks past it.</strong></p>
<p>This gallery-wrapped canvas features a sketch-style "I Love You Mum" design — stick-figure family, wobbly heart, a little sun in the corner. The kind of drawing you'd find stuck to the fridge, but now it's on her wall, framed forever.</p>
<h4>Details</h4>
<ul><li>8" x 10" (20cm x 25cm)</li><li>Gallery-wrapped canvas on wooden frame</li><li>Hang-ready with pre-installed hardware</li><li>Printed on demand in Australia</li></ul>
<h4>Shipping</h4>
<p>Free AU shipping. Printed and dispatched within 3–5 business days. <strong>Order by April 28 for Mother\u2019s Day delivery.</strong></p>`,
    productType: 'Mother\u2019s Day Gift',
    template: 'product.personalized'
  },
  {
    handle: 'mum-and-me-tote-bag',
    title: 'Mum + Me Tote Bag — Kid-Drawn Mother\u2019s Day Gift',
    price: '34.99', compare: '49.99',
    seoTitle: 'Mum + Me Tote Bag | Cotton Mother\u2019s Day Gift | KiddieSketch',
    metaDesc: 'Sketch-style "Mum + Me" cotton tote Mum can actually carry to school pickup. 100% cotton, reinforced handles. Order by Apr 28 for Mother\u2019s Day.',
    tags: ['mothers-day','mum-gift','tote-bag','cotton-tote','mum-and-me','mothers-day-2026','kiddiesketch-original','made-with-love','pod','for-mum','australia','aud','gift','kids-drawing','eco-bag','personalizable'],
    bodyHtml: `<p><strong>The school-pickup bag that says "my kid loves me" without her saying a word.</strong></p>
<p>A 100% cotton tote printed with a sketch-style "Mum + Me" design — two stick figures holding hands, a wobbly sun, hearts floating around them.</p>
<h4>Details</h4>
<ul><li>38cm x 42cm, 10cm gusset</li><li>100% natural cotton, 250 gsm</li><li>Reinforced long handles (68cm)</li><li>Machine washable, cold wash recommended</li></ul>
<p>Free AU shipping. <strong>Order by April 28 for Mother\u2019s Day delivery.</strong></p>`,
    productType: 'Mother\u2019s Day Gift', template: 'product.personalized'
  },
  {
    handle: 'super-mum-kids-drawing-tee',
    title: 'Super Mum Tee — Kid-Drawn Mother\u2019s Day T-Shirt',
    price: '34.99', compare: '49.99',
    seoTitle: 'Super Mum T-Shirt | Kid-Drawn Mother\u2019s Day Tee | KiddieSketch',
    metaDesc: 'Unisex cotton "Super Mum" tee with sketch-style cape drawing. Soft, pre-shrunk, made to wear. Order by Apr 28 for Mother\u2019s Day delivery.',
    tags: ['mothers-day','mum-gift','t-shirt','tee','super-mum','mothers-day-2026','kiddiesketch-original','made-with-love','pod','for-mum','australia','aud','gift','kids-drawing','apparel','personalizable'],
    bodyHtml: `<p><strong>Because she actually is a superhero — and now there's proof.</strong></p>
<p>Soft unisex cotton tee featuring a kid's-drawing-style "Super Mum" — stick figure, flowing cape, speech bubble with "MY MUM."</p>
<h4>Details</h4>
<ul><li>100% ring-spun cotton, 180 gsm</li><li>Unisex fit — runs true to size</li><li>Sizes S / M / L / XL / 2XL</li><li>Colours: classic white, heather grey, soft pink</li></ul>
<p>Free AU shipping. <strong>Order by April 28 for Mother\u2019s Day.</strong></p>`,
    productType: 'Mother\u2019s Day Gift', template: 'product.personalized'
  },
  {
    handle: 'my-mum-is-the-best-poster-a3',
    title: 'My Mum is the Best Poster A3 — Kid-Drawn Mother\u2019s Day Print',
    price: '24.99', compare: '39.99',
    seoTitle: 'My Mum is the Best Poster A3 | Mother\u2019s Day Wall Print | KiddieSketch',
    metaDesc: 'Budget-friendly kid-drawn "My Mum is the Best" poster print, A3. Premium matte paper, frames sold separately. Order by Apr 28 for Mother\u2019s Day.',
    tags: ['mothers-day','mum-gift','poster','a3-print','wall-art','mothers-day-2026','kiddiesketch-original','made-with-love','pod','for-mum','australia','aud','gift','kids-drawing','budget-gift','personalizable'],
    bodyHtml: `<p><strong>The gift from the kids that actually looks good on the wall.</strong></p>
<p>A3 poster print featuring a sketch-style "My Mum is the Best" design — stick-figure mum, big heart, a few wobbly stars. Premium matte paper that shows the pencil texture.</p>
<h4>Details</h4>
<ul><li>A3 (29.7cm x 42cm / 11.7" x 16.5")</li><li>200gsm premium matte paper</li><li>Fade-resistant archival inks</li><li>Frame not included — fits Kmart/IKEA A3 frames</li></ul>
<p>Free AU shipping in a rigid flat-mailer. <strong>Order by April 28 for Mother\u2019s Day.</strong></p>`,
    productType: 'Mother\u2019s Day Gift', template: 'product.personalized'
  },
  {
    handle: 'mums-helper-apron',
    title: 'Mum\u2019s Helper Apron — Kid-Drawn Mother\u2019s Day Kitchen Gift',
    price: '34.99', compare: '49.99',
    seoTitle: 'Mum\u2019s Helper Apron | Kid-Drawn Mother\u2019s Day Kitchen Gift | KiddieSketch',
    metaDesc: 'Sketch-style "Mum\u2019s Helper" cotton apron — adjustable neck, 2 pockets. Perfect Mother\u2019s Day kitchen gift. Order by Apr 28 for delivery.',
    tags: ['mothers-day','mum-gift','apron','kitchen-gift','mums-helper','mothers-day-2026','kiddiesketch-original','made-with-love','pod','for-mum','australia','aud','gift','kids-drawing','cooking','personalizable'],
    bodyHtml: `<p><strong>The apron that makes Sunday pancakes a little more fun.</strong></p>
<p>Full-length cotton apron with a sketch-style "Mum\u2019s Helper" design — kid stirring a mixing bowl, flour flying, one star eye.</p>
<h4>Details</h4>
<ul><li>One size fits most adults (adjustable)</li><li>100% cotton, 240 gsm</li><li>Machine washable, cold wash</li><li>Natural cream with print</li></ul>
<p>Free AU shipping. <strong>Order by April 28 for Mother\u2019s Day.</strong></p>`,
    productType: 'Mother\u2019s Day Gift', template: 'product.personalized'
  },
  {
    handle: 'worlds-best-grandma-sketch-mug',
    title: 'World\u2019s Best Grandma Sketch Mug — Mother\u2019s Day Gift for Nana',
    price: '29.99', compare: '44.99',
    seoTitle: 'World\u2019s Best Grandma Mug | Mother\u2019s Day Gift for Nana | KiddieSketch',
    metaDesc: 'Kid-drawn "World\u2019s Best Grandma" 11oz ceramic mug. Dishwasher-safe, gift-ready. Order by Apr 28 for Mother\u2019s Day delivery in AU.',
    tags: ['mothers-day','grandma-gift','nana-gift','mug','ceramic-mug','worlds-best-grandma','mothers-day-2026','kiddiesketch-original','made-with-love','pod','for-grandma','australia','aud','gift','kids-drawing','personalizable'],
    bodyHtml: `<p><strong>Because Nana takes her tea seriously — and the grandkids think she\u2019s the best.</strong></p>
<p>Our "World\u2019s Best Grandma" sketch mug features a kid-drawn crown, a big heart, and the title Nana quietly knows is true.</p>
<h4>Details</h4>
<ul><li>11oz / 325ml glossy white ceramic mug</li><li>Full-wrap print, fade-resistant</li><li>Dishwasher and microwave safe</li></ul>
<p>Free AU shipping. <strong>Order by April 28 for Mother\u2019s Day delivery.</strong></p>`,
    productType: 'Mother\u2019s Day Gift', template: 'product.personalized'
  },
  {
    handle: 'grandma-and-me-canvas-print',
    title: 'Grandma & Me Canvas Print 8x10 — Kid-Drawn Mother\u2019s Day Gift',
    price: '39.99', compare: '59.99',
    seoTitle: 'Grandma & Me Canvas Print 8x10 | Mother\u2019s Day Nana Gift | KiddieSketch',
    metaDesc: 'Sketch-style "Grandma & Me" gallery-wrapped canvas, 8x10. Kid-drawn family scene. Free AU shipping. Order by Apr 28 for Mother\u2019s Day.',
    tags: ['mothers-day','grandma-gift','nana-gift','canvas-print','wall-art','grandma-and-me','mothers-day-2026','kiddiesketch-original','made-with-love','pod','for-grandma','australia','aud','gift','kids-drawing','home-decor','personalizable'],
    bodyHtml: `<p><strong>The canvas that goes straight onto the mantelpiece.</strong></p>
<p>Gallery-wrapped 8x10 canvas with a sketch-style "Grandma & Me" design — two stick figures holding hands, a wobbly sun, a row of flowers.</p>
<h4>Details</h4>
<ul><li>8" x 10" (20cm x 25cm)</li><li>Gallery-wrapped canvas on wooden frame</li><li>Pre-installed hardware for hanging</li></ul>
<p>Free AU shipping. <strong>Order by April 28 for Mother\u2019s Day delivery.</strong></p>`,
    productType: 'Mother\u2019s Day Gift', template: 'product.personalized'
  },
  {
    handle: 'nanas-kitchen-apron',
    title: 'Nana\u2019s Kitchen Apron — Kid-Drawn Mother\u2019s Day Gift for Grandma',
    price: '34.99', compare: '49.99',
    seoTitle: 'Nana\u2019s Kitchen Apron | Mother\u2019s Day Grandma Kitchen Gift | KiddieSketch',
    metaDesc: 'Sketch-style "Nana\u2019s Kitchen" cotton apron for the grandma who feeds everyone. Adjustable neck, 2 pockets. Order by Apr 28 for Mother\u2019s Day.',
    tags: ['mothers-day','grandma-gift','nana-gift','apron','kitchen-gift','nanas-kitchen','mothers-day-2026','kiddiesketch-original','made-with-love','pod','for-grandma','australia','aud','gift','kids-drawing','cooking','personalizable'],
    bodyHtml: `<p><strong>For the Nana whose kitchen always smells like something good.</strong></p>
<p>Full-length cotton apron with a kid-drawn "Nana\u2019s Kitchen" design — rolling pin, a tiny pie, a love-heart over the stove.</p>
<p>Free AU shipping. <strong>Order by April 28 for Mother\u2019s Day.</strong></p>`,
    productType: 'Mother\u2019s Day Gift', template: 'product.personalized'
  },
  {
    handle: 'i-love-my-grandma-poster-a3',
    title: 'I Love My Grandma Poster A3 — Kid-Drawn Mother\u2019s Day Print',
    price: '24.99', compare: '39.99',
    seoTitle: 'I Love My Grandma Poster A3 | Mother\u2019s Day Nana Wall Print | KiddieSketch',
    metaDesc: 'Kid-drawn "I Love My Grandma" A3 poster — premium matte, fits Kmart/IKEA A3 frames. Order by Apr 28 for Mother\u2019s Day.',
    tags: ['mothers-day','grandma-gift','nana-gift','poster','a3-print','wall-art','mothers-day-2026','kiddiesketch-original','made-with-love','pod','for-grandma','australia','aud','gift','kids-drawing','budget-gift','personalizable'],
    bodyHtml: `<p><strong>The gift from the grandkids that ends up on her wall.</strong></p>
<p>A3 poster print with a sketch-style "I Love My Grandma" design — stick-figure grandma, a giant pink heart, a small sun. Premium matte paper, ships flat in a rigid mailer.</p>
<p>Free AU shipping. <strong>Order by April 28 for Mother\u2019s Day.</strong></p>`,
    productType: 'Mother\u2019s Day Gift', template: 'product.personalized'
  },
  {
    handle: 'mums-day-bundle',
    title: 'Mum\u2019s Day Bundle — Mug + Canvas + Tote (Kid-Drawn Mother\u2019s Day Gift Set)',
    price: '89.99', compare: '134.97',
    seoTitle: 'Mum\u2019s Day Bundle | Mother\u2019s Day Gift Set (Save $44) | KiddieSketch',
    metaDesc: '3-piece Mother\u2019s Day bundle: Best Mum Ever mug + I Love You Mum canvas + Mum + Me tote. Save $44. Order by Apr 28 for delivery.',
    tags: ['mothers-day','mum-gift','gift-bundle','bundle','gift-set','value-pack','mothers-day-2026','kiddiesketch-original','made-with-love','pod','for-mum','australia','aud','gift','kids-drawing','best-seller','personalizable'],
    bodyHtml: `<p><strong>The full "Made with Love" Mum\u2019s Day set — three gifts, one price, $44.98 off.</strong></p>
<h4>What\u2019s in the bundle</h4>
<ul><li>Best Mum Ever Sketch Mug (11oz ceramic) — normally $29.99</li><li>I Love You Mum Canvas Print (8x10 gallery-wrap) — normally $39.99</li><li>Mum + Me Tote Bag (cotton, reinforced handles) — normally $34.99</li></ul>
<p><strong>Bundle total value: $134.97. You pay $89.99. Save $44.98.</strong></p>
<p>Free AU shipping. <strong>Order by April 28 for guaranteed Mother\u2019s Day delivery.</strong></p>`,
    productType: 'Mother\u2019s Day Gift', template: 'product.personalized'
  },
  {
    handle: 'grandmas-day-bundle',
    title: 'Grandma\u2019s Day Bundle — Mug + Canvas + Apron (Kid-Drawn Mother\u2019s Day Gift Set)',
    price: '89.99', compare: '134.97',
    seoTitle: 'Grandma\u2019s Day Bundle | Mother\u2019s Day Nana Gift Set (Save $44) | KiddieSketch',
    metaDesc: '3-piece grandma bundle: World\u2019s Best Grandma mug + Grandma & Me canvas + Nana\u2019s Kitchen apron. Save $44. Order by Apr 28.',
    tags: ['mothers-day','grandma-gift','nana-gift','gift-bundle','bundle','gift-set','value-pack','mothers-day-2026','kiddiesketch-original','made-with-love','pod','for-grandma','australia','aud','gift','kids-drawing','best-seller','personalizable'],
    bodyHtml: `<p><strong>Three gifts for Nana, one price, $44.98 off.</strong></p>
<h4>What\u2019s in the bundle</h4>
<ul><li>World\u2019s Best Grandma Sketch Mug (11oz ceramic) — normally $29.99</li><li>Grandma & Me Canvas Print (8x10 gallery-wrap) — normally $39.99</li><li>Nana\u2019s Kitchen Apron (cotton, 2 pockets) — normally $34.99</li></ul>
<p><strong>Bundle total value: $134.97. You pay $89.99. Save $44.98.</strong></p>
<p>Free AU shipping. <strong>Order by April 28 for Mother\u2019s Day delivery.</strong></p>`,
    productType: 'Mother\u2019s Day Gift', template: 'product.personalized'
  }
];

function productPayload(p) {
  return {
    product: {
      title: p.title,
      handle: p.handle,
      body_html: p.bodyHtml,
      vendor: 'KiddieSketch',
      product_type: p.productType,
      tags: p.tags.join(', '),
      status: 'draft', // review before publishing — the "hands-off KS theme" rule
      template_suffix: 'personalized',
      variants: [
        {
          price: p.price,
          compare_at_price: p.compare,
          inventory_management: null, // POD: Shopify doesn't track inventory
          inventory_policy: 'continue',
          fulfillment_service: 'manual',
          requires_shipping: true,
          taxable: true
        }
      ],
      metafields: [
        { namespace: 'global', key: 'title_tag', value: p.seoTitle, type: 'single_line_text_field' },
        { namespace: 'global', key: 'description_tag', value: p.metaDesc, type: 'single_line_text_field' }
      ]
    }
  };
}

async function findByHandle(handle) {
  const r = await ks('GET', `/products.json?handle=${encodeURIComponent(handle)}&fields=id,handle,title`);
  if (r.status !== 200) throw new Error(`lookup handle=${handle} HTTP ${r.status}: ${r.raw.slice(0, 200)}`);
  return (r.body.products || [])[0] || null;
}

async function upsert(p) {
  const existing = await findByHandle(p.handle);
  if (existing) {
    console.log(`INFO  updating product id=${existing.id} handle=${p.handle}`);
    const payload = productPayload(p);
    payload.product.id = existing.id;
    const r = await ks('PUT', `/products/${existing.id}.json`, payload);
    if (r.status !== 200) throw new Error(`PUT id=${existing.id} HTTP ${r.status}: ${r.raw.slice(0, 300)}`);
    return { id: existing.id, action: 'updated' };
  } else {
    console.log(`INFO  creating product handle=${p.handle}`);
    const r = await ks('POST', `/products.json`, productPayload(p));
    if (r.status !== 201) throw new Error(`POST HTTP ${r.status}: ${r.raw.slice(0, 300)}`);
    return { id: r.body.product.id, action: 'created' };
  }
}

async function addToCollection(productId, collectionId) {
  const r = await ks('POST', '/collects.json', { collect: { product_id: productId, collection_id: collectionId } });
  // 201 on new collect, 422 if already exists — both OK
  if (r.status !== 201 && r.status !== 422) {
    throw new Error(`collects POST HTTP ${r.status}: ${r.raw.slice(0, 300)}`);
  }
}

// ---- Main --------------------------------------------------------------
(async () => {
  // Load collection id from step 2 output
  let collectionId = null;
  try {
    collectionId = Number(fs.readFileSync('/tmp/ks_mothers_day_collection_id.txt', 'utf8').trim());
  } catch {
    console.error('WARN  /tmp/ks_mothers_day_collection_id.txt not found — run 02-create-collection.sh first, or products won\'t be added to the collection.');
  }

  const results = { ok: [], fail: [] };
  const ids = [];

  for (const p of PRODUCTS) {
    try {
      const r = await upsert(p);
      ids.push({ handle: p.handle, id: r.id, action: r.action });
      console.log(`OK    ${r.action} id=${r.id} handle=${p.handle}`);
      if (collectionId) {
        await addToCollection(r.id, collectionId);
        console.log(`      \u2514 added to collection ${collectionId}`);
      }
      results.ok.push({ handle: p.handle, id: r.id, action: r.action });
    } catch (e) {
      console.error(`FAIL  handle=${p.handle} \u2014 ${e.message}`);
      results.fail.push({ handle: p.handle, error: e.message });
    }
    await throttle(600); // Shopify REST rate limit: 2/sec on standard plans
  }

  fs.writeFileSync('/tmp/ks_product_ids.json', JSON.stringify(ids, null, 2));
  console.log('\n=== RESULT ===');
  console.log(`OK   ${results.ok.length}`);
  console.log(`FAIL ${results.fail.length}`);
  if (results.fail.length) {
    console.log('\nFailures:');
    results.fail.forEach(f => console.log(`  - ${f.handle}: ${f.error}`));
    process.exit(1);
  }
  console.log('\n(id map saved to /tmp/ks_product_ids.json for next scripts)');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
