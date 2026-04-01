/**
 * verify-alt-fix.js
 * Quét toàn bộ site: tìm tất cả ảnh còn thiếu hoặc trùng alt text.
 * Dùng để kiểm tra sau khi chạy fix-missing-alt.js hoặc fix-duplicate-alt.js.
 *
 * Cách dùng: node verify-alt-fix.js
 *   Exit code 0 = tất cả OK
 *   Exit code 1 = có issues
 *
 * Required env: WP_BASE_URL, WP_USERNAME, WP_APP_PASSWORD
 * Optional env: WC_CONSUMER_KEY, WC_CONSUMER_SECRET
 */

'use strict';

const { wpGet, fetchAll } = require('./wp-client');

async function main() {
  let pass = 0, fail = 0;
  const issues = [];

  // ── 1. Scan toàn bộ Media Library ─────────────────────────────────────────
  console.log('Scanning media library...');
  const media = await fetchAll('/wp-json/wp/v2/media', 'id,alt_text,source_url,media_type');
  const images = media.filter(m => m.media_type === 'image' || /\.(jpg|jpeg|png|gif|webp|svg|avif)$/i.test(m.source_url || ''));

  let mediaFail = 0;
  for (const m of images) {
    const empty = !m.alt_text || m.alt_text.trim() === '';
    if (empty) {
      const fn = (m.source_url || '').split('/').pop().substring(0, 50);
      issues.push(`MISSING_ALT  Media ${m.id} [${fn}]`);
      fail++;
      mediaFail++;
    } else {
      pass++;
    }
  }
  console.log(`  Media library: ${images.length} images, ${mediaFail} missing alt`);

  // ── 2. Scan <img> tags trong posts/pages HTML content ─────────────────────
  console.log('Scanning posts and pages content...');
  const posts = await fetchAll('/wp-json/wp/v2/posts', 'id,title,content');
  const pages = await fetchAll('/wp-json/wp/v2/pages', 'id,title,content');
  const allContent = [
    ...posts.map(p => ({ ...p, type: 'post' })),
    ...pages.map(p => ({ ...p, type: 'page' })),
  ];

  let contentFail = 0;
  for (const item of allContent) {
    const html    = item.content?.rendered || '';
    const title   = item.title?.rendered || '?';
    const imgTags = [...html.matchAll(/<img[^>]+>/gi)].map(m => m[0]);
    const seenAlts = new Map(); // alt → count (để detect duplicates)

    for (const tag of imgTags) {
      const alt = (tag.match(/alt=["']([^"']*)["']/) || [])[1];
      const src = ((tag.match(/src=["']([^"']*)["']/) || [])[1] || '').split('/').pop().substring(0, 40);

      if (alt === undefined || alt === null) {
        issues.push(`MISSING_ALT  ${item.type.toUpperCase()} ${item.id} "${title.substring(0,30)}" img[${src}] — no alt attr`);
        fail++; contentFail++;
      } else if (alt.trim() === '') {
        issues.push(`EMPTY_ALT    ${item.type.toUpperCase()} ${item.id} "${title.substring(0,30)}" img[${src}] — alt=""`);
        fail++; contentFail++;
      } else {
        const key = alt.trim().toLowerCase();
        seenAlts.set(key, (seenAlts.get(key) || 0) + 1);
        pass++;
      }
    }

    // Duplicate check trong cùng 1 trang
    for (const [altKey, count] of seenAlts.entries()) {
      if (count > 1) {
        issues.push(`DUPLICATE_ALT ${item.type.toUpperCase()} ${item.id} "${title.substring(0,30)}" — "${altKey}" x${count}`);
        fail++;
      }
    }
  }
  console.log(`  Posts/pages content: ${contentFail} issues found`);

  // ── 3. WC products (optional — skip nếu không có WC credentials) ──────────
  const wc = await fetchAll('/wp-json/wc/v3/products', 'id,name,images', true);
  if (wc.length > 0) {
    console.log('Scanning WC products...');
    let wcFail = 0;
    for (const prod of wc) {
      if (!prod.images || !prod.images.length) continue;
      const seenAlts = new Map();
      for (const img of prod.images) {
        const empty = !img.alt || img.alt.trim() === '';
        const fn = (img.src || '').split('/').pop().substring(0, 40);
        if (empty) {
          issues.push(`MISSING_ALT  PRODUCT ${prod.id} "${prod.name.substring(0,30)}" img[${fn}]`);
          fail++; wcFail++;
        } else {
          const key = img.alt.trim().toLowerCase();
          seenAlts.set(key, (seenAlts.get(key) || 0) + 1);
          pass++;
        }
      }
      for (const [altKey, count] of seenAlts.entries()) {
        if (count > 1) {
          issues.push(`DUPLICATE_ALT PRODUCT ${prod.id} "${prod.name.substring(0,30)}" — "${altKey}" x${count}`);
          fail++;
        }
      }
    }
    console.log(`  WC products: ${wcFail} missing alt`);
  } else {
    console.log('  WC products: skipped (no WC credentials or 0 products)');
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(55));
  const total = pass + fail;
  if (fail === 0) {
    console.log(`RESULT: ${pass}/${total} PASS ✅  All images have alt text!`);
  } else {
    console.log(`RESULT: ${pass}/${total} PASS — ❌ ${fail} issues:\n`);
    issues.forEach(i => console.log('  ' + i));
    console.log(`\n→ Chạy fix-missing-alt.js --apply để sửa tự động`);
    process.exit(1);
  }
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
