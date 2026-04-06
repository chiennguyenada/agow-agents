#!/usr/bin/env node
/**
 * fix-hotline.js  (2026-04-06)
 * Scan và replace số hotline cũ → mới trong description của:
 *   - WC Products (description/long_desc)
 *   - WP Pages (content)
 *   - WP Posts (content)
 *   - WC Categories (description)
 *
 * Thiết kế config-driven: số điện thoại cũ/mới có thể override qua CLI.
 *
 * Cách dùng:
 *   node fix-hotline.js                           # dry-run: scan tất cả
 *   node fix-hotline.js --apply                   # replace và ghi lên site
 *   node fix-hotline.js --id=123                  # chỉ xử lý 1 item (tất cả types)
 *   node fix-hotline.js --type=product            # chỉ 1 loại (product|page|post|category)
 *   node fix-hotline.js --apply --type=product    # apply chỉ products
 *   node fix-hotline.js --old="028 6670 9931" --new="0934 795 982"  # override số
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { wcRequest, wpGet, wpPut, fetchAll } = require('./wp-client');

// ── CLI args ──────────────────────────────────────────────────────────────────
const ARGS     = process.argv.slice(2).join(' ');
const DRY_RUN  = !process.argv.includes('--apply');
const ONLY_ID  = (() => { const m = ARGS.match(/--id=(\d+)/);     return m ? +m[1] : null; })();
const ONLY_TYPE= (() => { const m = ARGS.match(/--type=(\w+)/);   return m ? m[1] : null; })();
const OLD_PHONE= (() => { const m = ARGS.match(/--old="([^"]+)"/); return m ? m[1] : '028 6670 9931'; })();
const NEW_PHONE= (() => { const m = ARGS.match(/--new="([^"]+)"/); return m ? m[1] : '0934 795 982'; })();

const BACKUP_DIR = path.join(__dirname, '..', 'backups');
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

// ── Build flexible regex: match số kể cả dạng 028.6670.9931 / 028-6670-9931 ──
function buildPhoneRegex(phone) {
  // Lấy toàn bộ chữ số, sau đó cho phép [\s\-\.]* giữa từng chữ số
  const digits  = phone.replace(/\D/g, '');
  const pattern = digits.split('').join('[\\s\\-\\.]*');
  return new RegExp(pattern, 'g');
}

const OLD_REGEX = buildPhoneRegex(OLD_PHONE);

// ── Đếm số lần xuất hiện ────────────────────────────────────────────────────
function countOccurrences(text) {
  OLD_REGEX.lastIndex = 0; // reset global regex
  return (text.match(buildPhoneRegex(OLD_PHONE)) || []).length;
}

// ── Replace hotline trong raw HTML/text ────────────────────────────────────
function replaceHotline(raw) {
  return raw.replace(buildPhoneRegex(OLD_PHONE), NEW_PHONE);
}

// ── Strip HTML (để detect) ───────────────────────────────────────────────────
const stripHtml = h => (h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

// ── Log context: hiển thị đoạn xung quanh số điện thoại ─────────────────────
function getContext(raw, maxLen = 80) {
  const plain = stripHtml(raw);
  const idx   = plain.search(buildPhoneRegex(OLD_PHONE));
  if (idx === -1) return '';
  const start = Math.max(0, idx - 30);
  const end   = Math.min(plain.length, idx + OLD_PHONE.length + 30);
  return '...' + plain.slice(start, end).replace(/\s+/g, ' ') + '...';
}

// ── Process một item (bất kỳ type) ────────────────────────────────────────
async function processItem({ id, name, url, rawContent, type, writeBack }) {
  if (!rawContent) return { skipped: true };

  const plain       = stripHtml(rawContent);
  const occurrences = countOccurrences(plain);
  if (occurrences === 0) return { skipped: true };

  const newContent  = replaceHotline(rawContent);
  const ctx         = getContext(rawContent);

  if (DRY_RUN) {
    console.log(`🔧 [${id}] (${type}) "${(name||'').slice(0,55)}" — ${occurrences} chỗ`);
    if (url) console.log(`   URL: ${url}`);
    console.log(`   Context: "${ctx}"`);
    console.log(`   → thay bằng: "${NEW_PHONE}"`);
    console.log('');
    return { id, type, found: true, occurrences };
  }

  // Backup
  const backup = {
    id, type, name, url, occurrences,
    oldPhone: OLD_PHONE, newPhone: NEW_PHONE,
    origContentSlice: rawContent.slice(0, 1000),
    timestamp: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(BACKUP_DIR, `hotline-backup-${type}-${id}-${Date.now()}.json`),
    JSON.stringify(backup, null, 2)
  );

  // Write
  try {
    const res = await writeBack(newContent);
    if (res && res.ok) {
      console.log(`✅ [${id}] (${type}) "${(name||'').slice(0,55)}" — ${occurrences} chỗ replaced`);
      return { id, type, fixed: true, occurrences };
    } else {
      const hint = res?.status === 403 ? ' (kiểm tra credentials)' : ` status=${res?.status}`;
      console.log(`❌ [${id}] (${type}) "${(name||'').slice(0,55)}"${hint}`);
      return { id, type, error: true };
    }
  } catch(e) {
    console.log(`❌ [${id}] (${type}) exception: ${e.message}`);
    return { id, type, error: true };
  }
}

// ── Fetch WP content với context=edit để lấy raw (không bị filtered) ────────
async function wpGetRaw(endpoint) {
  const sep = endpoint.includes('?') ? '&' : '?';
  return wpGet(endpoint + sep + 'context=edit');
}

// ── SCAN: WC Products ────────────────────────────────────────────────────────
async function scanProducts(stats) {
  process.stderr.write('Fetching WC products...\n');
  const products = await fetchAll('/wp-json/wc/v3/products', 'id,name,permalink,description', true);
  const filtered = ONLY_ID ? products.filter(p => p.id === ONLY_ID) : products;
  process.stderr.write(`  ${filtered.length} products\n`);

  for (const p of filtered) {
    const r = await processItem({
      id:         p.id,
      name:       p.name,
      url:        p.permalink,
      rawContent: p.description,
      type:       'product',
      writeBack:  (newDesc) => wcRequest('PUT', `/wp-json/wc/v3/products/${p.id}`, { description: newDesc }),
    });
    if (r.skipped)  stats.product.skipped++;
    else if (r.found || r.fixed) { stats.product.found++; stats.total.found++; if (r.fixed) { stats.product.fixed++; stats.total.fixed++; } }
    else if (r.error) { stats.product.errors++; stats.total.errors++; }
  }
}

// ── SCAN: WP Pages ────────────────────────────────────────────────────────────
async function scanPages(stats) {
  process.stderr.write('Fetching WP pages...\n');
  const pages = await fetchAll('/wp-json/wp/v2/pages', 'id,title,link,content,status');
  const all   = pages.filter(p => p.status === 'publish' || p.status === 'draft');
  const filtered = ONLY_ID ? all.filter(p => p.id === ONLY_ID) : all;
  process.stderr.write(`  ${filtered.length} pages\n`);

  for (const p of filtered) {
    // content.raw khi fetch với context=edit; fallback to content.rendered
    let rawContent = p.content?.raw || p.content?.rendered || '';
    // Nếu chưa có raw, fetch lại với context=edit
    if (!p.content?.raw && rawContent) {
      const res = await wpGetRaw(`/wp-json/wp/v2/pages/${p.id}?_fields=content`);
      rawContent = res.body?.content?.raw || rawContent;
    }

    const r = await processItem({
      id:         p.id,
      name:       p.title?.rendered || p.title?.raw || '',
      url:        p.link,
      rawContent,
      type:       'page',
      writeBack:  (newContent) => wpPut(`/wp-json/wp/v2/pages/${p.id}`, { content: newContent }),
    });
    if (r.skipped)  stats.page.skipped++;
    else if (r.found || r.fixed) { stats.page.found++; stats.total.found++; if (r.fixed) { stats.page.fixed++; stats.total.fixed++; } }
    else if (r.error) { stats.page.errors++; stats.total.errors++; }
  }
}

// ── SCAN: WP Posts ───────────────────────────────────────────────────────────
async function scanPosts(stats) {
  process.stderr.write('Fetching WP posts...\n');
  const posts = await fetchAll('/wp-json/wp/v2/posts', 'id,title,link,content,status');
  const all   = posts.filter(p => p.status === 'publish' || p.status === 'draft');
  const filtered = ONLY_ID ? all.filter(p => p.id === ONLY_ID) : all;
  process.stderr.write(`  ${filtered.length} posts\n`);

  for (const p of filtered) {
    let rawContent = p.content?.raw || p.content?.rendered || '';
    if (!p.content?.raw && rawContent) {
      const res = await wpGetRaw(`/wp-json/wp/v2/posts/${p.id}?_fields=content`);
      rawContent = res.body?.content?.raw || rawContent;
    }

    const r = await processItem({
      id:         p.id,
      name:       p.title?.rendered || p.title?.raw || '',
      url:        p.link,
      rawContent,
      type:       'post',
      writeBack:  (newContent) => wpPut(`/wp-json/wp/v2/posts/${p.id}`, { content: newContent }),
    });
    if (r.skipped)  stats.post.skipped++;
    else if (r.found || r.fixed) { stats.post.found++; stats.total.found++; if (r.fixed) { stats.post.fixed++; stats.total.fixed++; } }
    else if (r.error) { stats.post.errors++; stats.total.errors++; }
  }
}

// ── SCAN: WC Categories ──────────────────────────────────────────────────────
async function scanCategories(stats) {
  process.stderr.write('Fetching WC categories...\n');
  const cats = await fetchAll('/wp-json/wc/v3/products/categories', 'id,name,link,description', true);
  const filtered = ONLY_ID ? cats.filter(c => c.id === ONLY_ID) : cats;
  process.stderr.write(`  ${filtered.length} categories\n`);

  for (const c of filtered) {
    const r = await processItem({
      id:         c.id,
      name:       c.name,
      url:        c.link,
      rawContent: c.description,
      type:       'category',
      writeBack:  (newDesc) => wcRequest('PUT', `/wp-json/wc/v3/products/categories/${c.id}`, { description: newDesc }),
    });
    if (r.skipped)  stats.category.skipped++;
    else if (r.found || r.fixed) { stats.category.found++; stats.total.found++; if (r.fixed) { stats.category.fixed++; stats.total.fixed++; } }
    else if (r.error) { stats.category.errors++; stats.total.errors++; }
  }
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(DRY_RUN
    ? `=== DRY-RUN: Scan hotline "${OLD_PHONE}" → "${NEW_PHONE}" ===`
    : `=== APPLY: Replace "${OLD_PHONE}" → "${NEW_PHONE}" ===`);
  if (ONLY_ID)   console.log(`   Chỉ xử lý ID: ${ONLY_ID}`);
  if (ONLY_TYPE) console.log(`   Chỉ loại: ${ONLY_TYPE}`);
  console.log('');

  const makeTypeStat = () => ({ found: 0, fixed: 0, skipped: 0, errors: 0 });
  const stats = {
    product:  makeTypeStat(),
    page:     makeTypeStat(),
    post:     makeTypeStat(),
    category: makeTypeStat(),
    total:    { found: 0, fixed: 0, errors: 0 },
  };

  const runAll  = !ONLY_TYPE;
  const runType = (t) => runAll || ONLY_TYPE === t;

  if (runType('product'))  await scanProducts(stats);
  if (runType('page'))     await scanPages(stats);
  if (runType('post'))     await scanPosts(stats);
  if (runType('category')) await scanCategories(stats);

  // Summary
  console.log('═'.repeat(60));
  if (DRY_RUN) {
    console.log(`📋 Dry-run complete:`);
    console.log(`   Products:   ${stats.product.found} có hotline cũ`);
    console.log(`   Pages:      ${stats.page.found} có hotline cũ`);
    console.log(`   Posts:      ${stats.post.found} có hotline cũ`);
    console.log(`   Categories: ${stats.category.found} có hotline cũ`);
    console.log(`   ─────────────────────────────`);
    console.log(`   Tổng cộng:  ${stats.total.found} item cần thay`);
    if (stats.total.found > 0) {
      console.log(`\n→ Chạy --apply để replace`);
      if (ONLY_TYPE) console.log(`   (hoặc thêm --type để chỉ fix 1 loại)`);
    } else {
      console.log(`\n✅ Không tìm thấy hotline cũ "${OLD_PHONE}"!`);
    }
  } else {
    console.log(`✅ Đã thay: ${stats.total.fixed} item`);
    if (stats.total.errors) console.log(`❌ Lỗi: ${stats.total.errors} item`);
    if (stats.total.fixed > 0) {
      console.log(`\n→ Nhớ purge cache: node khoa.js purge-cache`);
    }
  }
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
