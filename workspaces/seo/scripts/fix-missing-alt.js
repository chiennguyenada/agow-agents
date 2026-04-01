/**
 * fix-missing-alt.js
 * Tự động thêm alt text cho ảnh đang thiếu trên posts và pages.
 * WC products: dùng WC API riêng (product image endpoint).
 *
 * Tier 2 — Notify-then-do: fix trước, ghi log, admin có thể undo.
 *
 * Cách dùng (trong container):
 *   node fix-missing-alt.js           # dry-run
 *   node fix-missing-alt.js --apply   # thực thi
 *
 * Required env: WP_BASE_URL, WP_USERNAME, WP_APP_PASSWORD
 * Optional env: WC_CONSUMER_KEY, WC_CONSUMER_SECRET  (để fix WC products)
 *               WP_BRAND_NAME  (fallback alt text khi filename generic, default: tên domain)
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { config, wpPut, wcRequest, fetchAll } = require('./wp-client');

const DRY_RUN    = !process.argv.includes('--apply');
const BACKUP_DIR = path.join(__dirname, '..', 'backups');
// Fallback brand name: từ env var hoặc tự suy ra từ domain
const BRAND_NAME = process.env.WP_BRAND_NAME
  || new URL(config.BASE_URL).hostname.replace(/^www\./, '').split('.')[0];

if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

// ── Extract ảnh thiếu alt từ HTML (trả về [{src, mediaId, alt}]) ──────────────
function extractMissingAlts(html) {
  if (!html) return [];
  const missing = [];
  const re = /<img[^>]+>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const tag  = m[0];
    const srcM = tag.match(/src=["']([^"']+)["']/i);
    const altM = tag.match(/alt=["']([^"']*)["']/i);
    const idM  = tag.match(/class=["'][^"']*wp-image-(\d+)[^"']*["']/i)
              || tag.match(/data-id=["'](\d+)["']/i);
    const src  = srcM ? srcM[1].trim() : '';
    const alt  = altM ? altM[1].trim() : null;
    if (src && (alt === null || alt === '')) {
      missing.push({ src, mediaId: idM ? parseInt(idM[1]) : null, originalTag: tag });
    }
  }
  return missing;
}

// ── Tạo alt text từ URL/filename ──────────────────────────────────────────────
// seenAlts: Map để track alt đã dùng trong cùng 1 trang → tránh duplicate (LESSON-003)
function generateAlt(src, pageTitle, seenAlts) {
  const filename = src.split('/').pop().split('?')[0];
  const name = filename
    .replace(/\.(jpg|jpeg|png|gif|webp|svg|avif)$/i, '')
    .replace(/-\d+x\d+$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\d{4,}\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const isGeneric = !name || name.length < 5 || /^(img|image|photo|banner|slider|srv|pic|bg|logo)\s*\d*$/i.test(name);
  let base = isGeneric
    ? (pageTitle ? pageTitle.replace(/&#\d+;|&amp;/g, '').trim() : BRAND_NAME)
    : (name.charAt(0).toUpperCase() + name.slice(1).toLowerCase());
  base = base.substring(0, 55);

  // Tránh duplicate trong cùng 1 trang (LESSON-003)
  if (!seenAlts) return base;
  let alt = base;
  let idx = 2;
  while (seenAlts.has(alt.toLowerCase())) {
    alt = `${base} ${idx}`;
    idx++;
  }
  seenAlts.add(alt.toLowerCase());
  return alt;
}

// ── Patch HTML: thay alt="" → alt="generated" bằng string replace ─────────────
function patchHtml(html, mediaId, src, newAlt) {
  // Escape special regex chars trong src
  const escapedSrc = src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let patched = html;

  // Case 1: có alt="" hoặc alt='' (rỗng)
  const re1 = new RegExp(`(<img[^>]*src=["']${escapedSrc}["'][^>]*)alt=["']["']`, 'i');
  if (re1.test(patched)) {
    patched = patched.replace(re1, `$1alt="${newAlt}"`);
    return patched;
  }

  // Case 2: không có alt attribute — thêm vào trước >
  const re2 = new RegExp(`(<img[^>]*src=["']${escapedSrc}["'][^>]*?)(\\s*/?>)`, 'i');
  if (re2.test(patched)) {
    patched = patched.replace(re2, `$1 alt="${newAlt}"$2`);
    return patched;
  }

  // Case 3: mediaId match — tìm bằng wp-image class
  if (mediaId) {
    const re3 = new RegExp(`(<img[^>]*class=["'][^"']*wp-image-${mediaId}[^"']*["'][^>]*)alt=["']["']`, 'i');
    if (re3.test(patched)) {
      patched = patched.replace(re3, `$1alt="${newAlt}"`);
      return patched;
    }
    const re4 = new RegExp(`(<img[^>]*class=["'][^"']*wp-image-${mediaId}[^"']*["'][^>]*?)(\\s*/?>)`, 'i');
    if (re4.test(patched)) {
      patched = patched.replace(re4, `$1 alt="${newAlt}"$2`);
      return patched;
    }
  }

  return patched; // không tìm thấy → trả nguyên
}

// ── Xử lý 1 post/page ─────────────────────────────────────────────────────────
async function fixPostOrPage(item, type) {
  const endpoint = type === 'POST' ? 'posts' : 'pages';
  const imgs     = extractMissingAlts(item.content?.rendered);
  if (!imgs.length) return { fixed: 0 };

  let content = item.content.raw; // raw content để PATCH
  if (!content) {
    // Nếu không có raw, fallback sang rendered (less ideal)
    content = item.content.rendered;
  }

  const title = item.title?.rendered || '';
  const fixes  = [];
  const seenAlts = new Set(); // LESSON-003: tránh duplicate alt trong cùng 1 trang

  for (const img of imgs) {
    const newAlt = generateAlt(img.src, title, seenAlts);
    fixes.push({ src: img.src, mediaId: img.mediaId, newAlt });

    if (!DRY_RUN) {
      // Fix trong WP Media Library nếu có mediaId
      if (img.mediaId) {
        const mediaRes = await wpPut(
          `/wp-json/wp/v2/media/${img.mediaId}`,
          { alt_text: newAlt }
        );
        if (mediaRes && mediaRes.status === 200) {
          process.stderr.write(`  ✅ Media ${img.mediaId} alt="${newAlt}"\n`);
        } else {
          process.stderr.write(`  ⚠️  Media ${img.mediaId} update failed (${mediaRes?.status})\n`);
        }
      }

      // Patch content HTML
      content = patchHtml(content, img.mediaId, img.src, newAlt);
    }
  }

  if (DRY_RUN) {
    console.log(`[DRY-RUN] [${type} ID:${item.id}] ${title}`);
    fixes.forEach(f => console.log(`  → alt="${f.newAlt}" (src: ...${f.src.split('/').pop()})`));
    return { fixed: 0, dryFixes: fixes.length };
  }

  // Backup trước khi ghi
  const backup = {
    type, id: item.id, title,
    timestamp: new Date().toISOString(),
    originalContent: item.content.raw || item.content.rendered,
    fixes,
  };
  fs.writeFileSync(
    path.join(BACKUP_DIR, `missing-alt-backup-${type.toLowerCase()}-${item.id}-${Date.now()}.json`),
    JSON.stringify(backup, null, 2)
  );

  // PATCH post/page content
  const patchRes = await wpPut(
    `/wp-json/wp/v2/${endpoint}/${item.id}`,
    { content }
  );

  if (patchRes && patchRes.status === 200) {
    console.log(`✅ [${type} ID:${item.id}] ${title} — đã sửa ${imgs.length} ảnh`);
    return { fixed: imgs.length };
  } else {
    console.log(`❌ [${type} ID:${item.id}] ${title} — PATCH failed (status: ${patchRes?.status})`);
    return { fixed: 0 };
  }
}

// ── MAIN ───────────────────────────────────────────────────────────────────────
async function main() {
  if (DRY_RUN) {
    console.log('=== DRY-RUN MODE (dùng --apply để thực thi) ===\n');
  } else {
    console.log('=== APPLYING FIXES — Tier 2 (backup trước khi sửa) ===\n');
  }

  let totalFixed  = 0;
  let totalDryFix = 0;

  // 1. POSTS
  process.stderr.write('Scanning posts...\n');
  const posts = await fetchAll('/wp-json/wp/v2/posts', 'id,title,link,content');
  for (const post of posts) {
    if (!extractMissingAlts(post.content?.rendered).length) continue;
    const r = await fixPostOrPage(post, 'POST');
    totalFixed  += r.fixed || 0;
    totalDryFix += r.dryFixes || 0;
  }

  // 2. PAGES
  process.stderr.write('Scanning pages...\n');
  const pages = await fetchAll('/wp-json/wp/v2/pages', 'id,title,link,content');
  for (const page of pages) {
    if (!extractMissingAlts(page.content?.rendered).length) continue;
    const r = await fixPostOrPage(page, 'PAGE');
    totalFixed  += r.fixed || 0;
    totalDryFix += r.dryFixes || 0;
  }

  // 3. WC PRODUCTS — dùng WC API để patch image alt
  process.stderr.write('Scanning WC products...\n');
  const wc    = await fetchAll('/wp-json/wc/v3/products', 'id,name,permalink,images', true);
  let wcFixed = 0;
  for (const prod of wc) {
    if (!prod.images || !prod.images.length) continue;
    const missing = prod.images.filter(img => !img.alt || img.alt.trim() === '');
    if (!missing.length) continue;

    if (DRY_RUN) {
      console.log(`[DRY-RUN] [PRODUCT ID:${prod.id}] ${prod.name}`);
      const seenAlts = new Set();
      missing.forEach(img => {
        const newAlt = generateAlt(img.src, prod.name, seenAlts);
        console.log(`  → alt="${newAlt}" (img.id=${img.id})`);
      });
      totalDryFix += missing.length;
      continue;
    }

    // Backup
    fs.writeFileSync(
      path.join(BACKUP_DIR, `missing-alt-backup-product-${prod.id}-${Date.now()}.json`),
      JSON.stringify({ id: prod.id, name: prod.name, originalImages: prod.images, timestamp: new Date().toISOString() }, null, 2)
    );

    // Patch images array
    const seenAlts = new Set();
    const updatedImages = prod.images.map(img => {
      if (!img.alt || img.alt.trim() === '') {
        return { ...img, alt: generateAlt(img.src, prod.name, seenAlts) };
      }
      return img;
    });

    const patchRes = await wcRequest(
      'PUT',
      `/wp-json/wc/v3/products/${prod.id}`,
      { images: updatedImages }
    );

    if (patchRes && patchRes.status === 200) {
      console.log(`✅ [PRODUCT ID:${prod.id}] ${prod.name} — đã sửa ${missing.length} ảnh`);
      wcFixed += missing.length;
    } else {
      console.log(`❌ [PRODUCT ID:${prod.id}] ${prod.name} — failed (${patchRes?.status})`);
    }
  }
  totalFixed += wcFixed;

  // ── SUMMARY ─────────────────────────────────────────────────────────────────
  console.log('');
  if (DRY_RUN) {
    console.log(`📋 Dry-run complete: ${totalDryFix} ảnh sẽ được sửa. Chạy với --apply để thực thi.`);
  } else {
    console.log(`✅ Done: ${totalFixed} ảnh đã được thêm alt text.`);
    console.log(`📁 Backups: ${BACKUP_DIR}`);
    console.log('⚠️  Nhớ purge LiteSpeed cache sau khi sửa!');
  }
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
