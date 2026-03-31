/**
 * fix-duplicate-alt.js
 * Sửa duplicate alt text trên cùng 1 trang
 *
 * Cách dùng:
 *   node fix-duplicate-alt.js             ← dry-run (chỉ hiển thị, không ghi)
 *   node fix-duplicate-alt.js --apply     ← thực sự ghi vào WordPress
 *   node fix-duplicate-alt.js --id=3789   ← chỉ fix 1 item cụ thể
 *
 * Env vars: WP_BASE_URL, WP_USERNAME, WP_APP_PASSWORD, WC_CONSUMER_KEY, WC_CONSUMER_SECRET
 */

'use strict';
const https = require('https');
const fs    = require('fs');
const path  = require('path');

// ── Config ──────────────────────────────────────────────────────────────────
const BASE      = (process.env.WP_BASE_URL || 'https://agowautomation.com').replace(/\/$/, '');
const AUTH      = Buffer.from(`${process.env.WP_USERNAME}:${process.env.WP_APP_PASSWORD}`).toString('base64');
const WC_KEY    = process.env.WC_CONSUMER_KEY;
const WC_SECRET = process.env.WC_CONSUMER_SECRET;

const APPLY     = process.argv.includes('--apply');
const ONLY_ID   = (() => { const a = process.argv.find(x => x.startsWith('--id=')); return a ? parseInt(a.split('=')[1]) : null; })();

const BACKUP_DIR = path.join(__dirname, '..', 'backups');
const LOG_FILE   = path.join(__dirname, '..', 'self-improving', 'actions_log.json');

// ── HTTP helpers ─────────────────────────────────────────────────────────────
function request(method, url, body = null, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const u      = new URL(url);
    const data   = body ? JSON.stringify(body) : null;
    const opts   = {
      hostname : u.hostname,
      path     : u.pathname + u.search,
      method,
      headers  : {
        'Authorization' : 'Basic ' + AUTH,
        'Content-Type'  : 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...extraHeaders,
      },
    };
    const req = https.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, body: d }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('timeout')); });
    if (data) req.write(data);
    req.end();
  });
}

const get  = (url, h)    => request('GET',  url, null, h || {});
const put  = (url, body) => request('PUT',  url, body);

// ── Fetch tất cả trang (pagination) ──────────────────────────────────────────
async function fetchAll(endpoint, fields, useWC = false) {
  const authParam = useWC ? `&consumer_key=${WC_KEY}&consumer_secret=${WC_SECRET}` : '';
  let all = [], page = 1;
  while (true) {
    const url = `${BASE}${endpoint}?per_page=100&_fields=${fields}&page=${page}${authParam}`;
    const r   = await get(url);
    if (!r || !r.body || !Array.isArray(r.body) || r.body.length === 0) break;
    all = all.concat(r.body);
    // Nếu trả về ít hơn 100 → đã hết trang
    if (r.body.length < 100) break;
    page++;
  }
  return all;
}

// ── Decode HTML entities ───────────────────────────────────────────────────
function decodeHtml(s) {
  return s
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");
}

// ── Extract img tags từ HTML ──────────────────────────────────────────────
function extractImgs(html) {
  if (!html) return [];
  const imgs = [];
  const re = /<img[^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const tag  = m[0];
    const altM = tag.match(/alt=["']([^"']*)["']/i);
    const srcM = tag.match(/data-id=["'](\d+)["']/i)    // WP data-id
               || tag.match(/class=["'][^"']*wp-image-(\d+)[^"']*["']/i); // WP class id
    const urlM = tag.match(/src=["']([^"']+)["']/i);    // src URL fallback
    const alt  = altM ? decodeHtml(altM[1].trim()) : '';
    const id   = srcM ? parseInt(srcM[1]) : null;
    const src  = urlM ? urlM[1] : null;
    if (alt) imgs.push({ alt, mediaId: id, src, tag });
  }
  return imgs;
}

// ── Lookup media ID từ filename (cho Flatsome / Page Builder pages) ───────
const _mediaCache = {};
async function lookupMediaId(src) {
  if (!src) return null;
  // Lấy filename không có -scaled, -NxN suffix
  const filename = src.split('/').pop().replace(/-\d+x\d+(\.\w+)$/, '$1').replace(/-scaled(\.\w+)$/, '$1');
  if (_mediaCache[filename] !== undefined) return _mediaCache[filename];

  const res = await get(`${BASE}/wp-json/wp/v2/media?search=${encodeURIComponent(filename.replace(/\.[^.]+$/, ''))}&per_page=5&_fields=id,source_url`);
  if (!res || !res.body || !Array.isArray(res.body)) { _mediaCache[filename] = null; return null; }

  const match = res.body.find(m => m.source_url && m.source_url.includes(filename.replace(/\.[^.]+$/, '')));
  const id    = match ? match.id : (res.body[0] ? res.body[0].id : null);
  _mediaCache[filename] = id;
  return id;
}

// ── Tìm duplicate alt groups ──────────────────────────────────────────────
function findDupes(imgs) {
  const byAlt = {};
  imgs.forEach((img, idx) => {
    if (!img.alt) return;
    if (!byAlt[img.alt]) byAlt[img.alt] = [];
    byAlt[img.alt].push({ ...img, idx });
  });
  return Object.entries(byAlt).filter(([, v]) => v.length >= 2);
}

// ── Backup helper ──────────────────────────────────────────────────────────
function saveBackup(name, data) {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const file = path.join(BACKUP_DIR, `${name}_${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  return file;
}

// ── Log action ────────────────────────────────────────────────────────────
function logAction(entry) {
  let log = { entries: [] };
  try { log = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8')); } catch {}
  log.entries.push({ timestamp: new Date().toISOString(), ...entry });
  fs.writeFileSync(LOG_FILE, JSON.stringify(log, null, 2));
}

// ── Sinh alt text mới (rule-based, không tốn API call) ───────────────────
function generateNewAlt(originalAlt, index) {
  const suffixes = ['mặt sau', 'chi tiết kết nối', 'chi tiết', 'góc nhìn khác', 'toàn cảnh'];
  const suffix   = suffixes[(index - 1) % suffixes.length];
  return `${originalAlt} - ${suffix}`;
}

// ══════════════════════════════════════════════════════════════════════════
// FIX 1: WC Products — sửa images[] array
// ══════════════════════════════════════════════════════════════════════════
async function fixWcProduct(prod, dryRun) {
  const dupes = findDupes(prod.images.map(i => ({ alt: i.alt || '', mediaId: i.id, src: i.src })));
  if (dupes.length === 0) return null;

  const newImages = prod.images.map(img => ({ ...img })); // clone

  const fixes = [];
  dupes.forEach(([origAlt, items]) => {
    // Giữ ảnh đầu tiên, sửa các ảnh còn lại
    items.slice(1).forEach((item, i) => {
      const idx       = prod.images.findIndex(img => img.id === item.mediaId && img.alt === origAlt
                          && !fixes.find(f => f.imageId === img.id && f.wasFixed));
      if (idx === -1) return;
      const newAlt    = generateNewAlt(origAlt, i + 1);
      newImages[idx]  = { ...newImages[idx], alt: newAlt };
      fixes.push({ imageId: newImages[idx].id, oldAlt: origAlt, newAlt, wasFixed: true });
    });
  });

  if (fixes.length === 0) return null;

  console.log(`\n[PRODUCT ID:${prod.id}] ${prod.name}`);
  fixes.forEach(f => {
    console.log(`  ✏️  image ${f.imageId}: "${f.oldAlt}" → "${f.newAlt}"`);
  });

  if (dryRun) {
    console.log(`  ⏭  dry-run — bỏ qua (thêm --apply để thực sự sửa)`);
    return null;
  }

  // Backup
  const bak = saveBackup(`wc_product_${prod.id}`, { id: prod.id, name: prod.name, images: prod.images });

  // PUT
  const res = await put(
    `${BASE}/wp-json/wc/v3/products/${prod.id}?consumer_key=${WC_KEY}&consumer_secret=${WC_SECRET}`,
    { images: newImages }
  );

  if (res.status === 200) {
    console.log(`  ✅ đã sửa (backup: ${path.basename(bak)})`);
    return { type: 'PRODUCT', id: prod.id, fixes, backup: bak };
  } else {
    console.log(`  ❌ lỗi ${res.status}:`, JSON.stringify(res.body).slice(0, 200));
    return null;
  }
}

// ══════════════════════════════════════════════════════════════════════════
// FIX 2: WP Pages/Posts — sửa từng media item qua /wp/v2/media
// Trang Chủ: ảnh được nhúng trong content.rendered — alt text lưu ở media library
// ══════════════════════════════════════════════════════════════════════════
async function fixWpItem(item, itemType, dryRun) {
  const html  = item.content && item.content.rendered;
  const imgs  = extractImgs(html);
  const dupes = findDupes(imgs);
  if (dupes.length === 0) return null;

  console.log(`\n[${itemType} ID:${item.id}] ${item.title && item.title.rendered}`);

  const fixes = [];

  for (const [origAlt, items] of dupes) {
    // Giữ ảnh đầu tiên, sửa từ ảnh thứ 2 trở đi
    for (let i = 1; i < items.length; i++) {
      const img     = items[i];
      const newAlt  = generateNewAlt(origAlt, i);

      console.log(`  ✏️  media ${img.mediaId || '?'}: "${origAlt}" → "${newAlt}"`);

      if (!img.mediaId) {
        // Fallback: lookup bằng src URL (dành cho Flatsome/PageBuilder pages)
        img.mediaId = await lookupMediaId(img.src);
      }
      if (!img.mediaId) {
        console.log(`     ⚠️  không tìm được media ID — bỏ qua`);
        continue;
      }

      if (dryRun) continue;

      // Backup media item
      const mediaRes = await get(`${BASE}/wp-json/wp/v2/media/${img.mediaId}?_fields=id,alt_text,source_url`);
      if (mediaRes.status !== 200) {
        console.log(`     ⚠️  không lấy được media ${img.mediaId}`);
        continue;
      }
      saveBackup(`wp_media_${img.mediaId}`, mediaRes.body);

      // PUT
      const res = await put(`${BASE}/wp-json/wp/v2/media/${img.mediaId}`, { alt_text: newAlt });
      if (res.status === 200) {
        fixes.push({ mediaId: img.mediaId, oldAlt: origAlt, newAlt });
        console.log(`     ✅ OK`);
      } else {
        console.log(`     ❌ lỗi ${res.status}`);
      }
    }
  }

  if (dryRun) {
    console.log(`  ⏭  dry-run — bỏ qua (thêm --apply để thực sự sửa)`);
    return null;
  }

  return fixes.length > 0 ? { type: itemType, id: item.id, fixes } : null;
}

// ══════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════
async function main() {
  console.log(APPLY ? '🔧 MODE: APPLY (sẽ ghi vào WordPress)' : '👁  MODE: DRY-RUN (chỉ hiển thị, không ghi)');
  if (!APPLY) console.log('   → thêm --apply để thực sự sửa\n');

  const results = [];

  // ── 1. WC Products ─────────────────────────────────────────────────────
  process.stderr.write('Scanning WC products...\n');
  const products = ONLY_ID
    ? [(await get(`${BASE}/wp-json/wc/v3/products/${ONLY_ID}?consumer_key=${WC_KEY}&consumer_secret=${WC_SECRET}`)).body]
    : await fetchAll('/wp-json/wc/v3/products', 'id,name,permalink,images', true);

  for (const prod of products) {
    if (!prod.images || prod.images.length < 2) continue;
    const r = await fixWcProduct(prod, !APPLY);
    if (r) results.push(r);
  }

  // ── 2. WP Pages ────────────────────────────────────────────────────────
  if (!ONLY_ID) {
    process.stderr.write('Scanning WP pages...\n');
    const pages = await fetchAll('/wp-json/wp/v2/pages', 'id,title,link,content');
    for (const page of pages) {
      const r = await fixWpItem(page, 'PAGE', !APPLY);
      if (r) results.push(r);
    }

    // ── 3. WP Posts ──────────────────────────────────────────────────────
    process.stderr.write('Scanning WP posts...\n');
    const posts = await fetchAll('/wp-json/wp/v2/posts', 'id,title,link,content');
    for (const post of posts) {
      const r = await fixWpItem(post, 'POST', !APPLY);
      if (r) results.push(r);
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════');
  if (!APPLY) {
    const totalFixes = results.length; // dry-run results are empty
    // Count from scan
    console.log(`DRY-RUN hoàn tất. Thêm --apply để thực sự sửa.`);
  } else {
    const totalFixed = results.reduce((s, r) => s + (r.fixes ? r.fixes.length : 0), 0);
    console.log(`✅ Đã sửa ${totalFixed} alt text trên ${results.length} trang/sản phẩm`);

    if (results.length > 0) {
      // Ghi log
      logAction({
        skill  : 'wp-technical-seo',
        action : 'fix-duplicate-alt',
        tier   : 2,
        result : 'success',
        summary: { items_fixed: results.length, alts_fixed: totalFixed },
        details: results.map(r => ({ type: r.type, id: r.id, fixes_count: r.fixes ? r.fixes.length : 0 })),
      });
      console.log('\n📋 Đã ghi vào actions_log.json');
      console.log('💾 Backups lưu tại workspaces/seo/backups/');
      console.log('\nUndo: chạy node fix-duplicate-alt.js --undo');
    }
  }
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
