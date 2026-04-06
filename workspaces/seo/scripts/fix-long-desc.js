/**
 * fix-long-desc.js  v2  (2026-04-02)
 * Strip noise thật sự khỏi WooCommerce product long_description (description field).
 *
 * KHÔNG xóa (data sheet, trang X) / (manual, trang X) —
 * đây là E-E-A-T signal, chứng minh nội dung lấy từ tài liệu kỹ thuật chính hãng.
 *
 * Chỉ xóa noise thật:
 *   - Metadata header block: "Mã sản phẩm: X Thương hiệu: B&R Xuất xứ: Áo"
 *   - Standalone heading labels: "Đặc tính nổi bật", "Thông số kỹ thuật"
 *   - Hotline / SĐT / Email cụ thể của công ty
 *
 * Cách dùng:
 *   node fix-long-desc.js              # dry-run tất cả
 *   node fix-long-desc.js --apply      # apply tất cả
 *   node fix-long-desc.js --id=5277    # test 1 product (dry-run)
 *   node fix-long-desc.js --id=5277 --apply
 *
 * Safety: không bao giờ lưu nếu long_desc sau fix < 200 chars (flag needsReview)
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { wcRequest, fetchAll } = require('./wp-client');

const DRY_RUN = !process.argv.includes('--apply');
const ONLY_ID = (() => { const m = process.argv.join(' ').match(/--id=(\d+)/); return m ? parseInt(m[1]) : null; })();

const MIN_SAFE_LEN = 200;   // không save nếu sau clean < 200c
const BACKUP_DIR   = path.join(__dirname, '..', 'backups');
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

// ── Strip HTML tags (để check độ dài plain text) ──────────────────────────────
function stripHtml(h) {
  if (!h) return '';
  return h
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#\d+;/g, ' ').replace(/&\w+;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

// ── Strip noise khỏi HTML long_description (giữ nguyên HTML tags) ─────────────
// Thao tác trên raw HTML để không làm vỡ structure.
// GIỮ NGUYÊN: (data sheet, trang X), (manual, trang X) — E-E-A-T signals.
function cleanLongDescHtml(rawHtml) {
  if (!rawHtml) return rawHtml;
  let h = rawHtml;

  // 1. Metadata block (thường nằm trong <li> hoặc <p>):
  //    "Mã sản phẩm: X20SLX910" / "Mã số sản phẩm: ..."
  //    Xóa cả dòng/phần tử chứa pattern này
  h = h.replace(/<li[^>]*>\s*Mã\s+(số\s+)?sản\s+phẩm\s*:\s*[^<]*<\/li>/gi, '');
  h = h.replace(/<li[^>]*>\s*Thương\s+hiệu\s*:\s*[^<]*<\/li>/gi, '');
  h = h.replace(/<li[^>]*>\s*Xuất\s+xứ\s*:\s*[^<]*<\/li>/gi, '');
  h = h.replace(/<p[^>]*>\s*Mã\s+(số\s+)?sản\s+phẩm\s*:\s*[^<]*<\/p>/gi, '');
  h = h.replace(/<p[^>]*>\s*Thương\s+hiệu\s*:\s*[^<]*<\/p>/gi, '');
  h = h.replace(/<p[^>]*>\s*Xuất\s+xứ\s*:\s*[^<]*<\/p>/gi, '');

  // 2. Inline metadata còn sót (không trong <li>/<p> riêng):
  //    "Mã sản phẩm: X20SLX910 Thương hiệu: B&R Automation Xuất xứ: Áo"
  h = h.replace(/Mã\s+(số\s+)?sản\s+phẩm\s*:\s*[\w.\-]+\s*/gi, '');
  h = h.replace(/Thương\s+hiệu\s*:\s*[^\n<.]+[.\n]?\s*/gi, '');
  h = h.replace(/Xuất\s+xứ\s*:\s*[^\n<.]+[.\n]?\s*/gi, '');

  // 3. Standalone heading labels trong <p> hoặc <strong>/<b> riêng:
  //    "Đặc tính nổi bật:" / "Đặc điểm ưu việt:" / "Thông số kỹ thuật:"
  h = h.replace(/<p[^>]*>\s*<strong>\s*(Đặc\s+tính\s+nổi\s+(trội|bật)|Đặc\s+điểm\s+(ưu\s+việt|nổi\s+bật)|Thông\s+số\s+kỹ\s+thuật|Tính\s+năng\s+nổi\s+bật)\s*:?\s*<\/strong>\s*<\/p>/gi, '');
  h = h.replace(/<p[^>]*>\s*(Đặc\s+tính\s+nổi\s+(trội|bật)|Đặc\s+điểm\s+(ưu\s+việt|nổi\s+bật)|Thông\s+số\s+kỹ\s+thuật)\s*:?\s*<\/p>/gi, '');

  // 4. Hotline / SĐT / Email cụ thể
  h = h.replace(/\s*(?:hotline|điện\s*thoại|tel|đt)\s*:?\s*[\d\s\-\.\(\)]{7,18}/gi, ' ');
  h = h.replace(/\b028\s*6670\s*9931\b/g, '');
  h = h.replace(/\s*[Ee]mail\s*:\s*\S+@\S+/g, '');

  // 5. Xóa <ul>/<ol> rỗng còn lại sau khi strip <li>
  h = h.replace(/<ul[^>]*>\s*<\/ul>/gi, '');
  h = h.replace(/<ol[^>]*>\s*<\/ol>/gi, '');

  // 6. Xóa khoảng trắng thừa giữa các tags
  h = h.replace(/(\s*\n\s*){3,}/g, '\n\n').trim();

  return h;
}

// ── Kiểm tra có noise không ────────────────────────────────────────────────────
// KHÔNG coi (manual, trang X) hay (data sheet, trang X) là noise.
function hasNoise(rawHtml) {
  const text = stripHtml(rawHtml);
  return /Mã\s+(số\s+)?sản\s+phẩm\s*:/i.test(text)  ||
         /Thương\s+hiệu\s*:/i.test(text)              ||
         /Xuất\s+xứ\s*:/i.test(text)                  ||
         /(?:hotline|điện\s*thoại|tel|đt)\s*:?\s*[\d\s\-]{7,}/i.test(text) ||
         /028\s*6670\s*9931/.test(text);
}

// ── Process 1 product ─────────────────────────────────────────────────────────
async function processProduct(product) {
  const id      = product.id;
  const name    = stripHtml(product.name || '');
  const url     = product.permalink || '';
  const origHtml = product.description || '';

  // Bỏ qua sản phẩm không có long_desc
  if (!origHtml || origHtml.trim() === '') return { skipped: true };

  // Bỏ qua nếu không có noise
  if (!hasNoise(origHtml)) return { skipped: true };

  const cleanedHtml  = cleanLongDescHtml(origHtml);
  const cleanedText  = stripHtml(cleanedHtml);
  const origText     = stripHtml(origHtml);

  // Safety: nếu sau clean quá ngắn → flag, không apply
  const needsManual = cleanedText.length < MIN_SAFE_LEN;

  if (DRY_RUN) {
    console.log(`🔧 [${id}] "${name.slice(0, 60)}" — orig:${origText.length}c → clean:${cleanedText.length}c`);
    console.log(`   URL: ${url}`);
    // Hiển thị diff nhỏ: những gì bị xóa
    const removed = origText.replace(cleanedText, '').slice(0, 100).trim();
    if (removed) console.log(`   Đã xóa: "${removed}…"`);
    if (needsManual) console.log(`   ⚠️  Cần review — sau clean chỉ còn ${cleanedText.length}c (<${MIN_SAFE_LEN}c)`);
    console.log('');
    return { id, name, origLen: origText.length, cleanedLen: cleanedText.length, needsManual };
  }

  // Apply nếu không có safety issue
  if (needsManual) {
    console.log(`⚠️  SKIP [${id}] "${name.slice(0, 55)}" — sau clean chỉ còn ${cleanedText.length}c, cần review`);
    return { id, skippedSafe: true, needsReview: true };
  }

  // Backup
  const backup = { id, name, url, origLen: origText.length, cleanedLen: cleanedText.length, origHtml: origHtml.slice(0, 500), timestamp: new Date().toISOString() };
  fs.writeFileSync(
    path.join(BACKUP_DIR, `long-desc-backup-${id}-${Date.now()}.json`),
    JSON.stringify(backup, null, 2)
  );

  // Write via WC REST API
  const res = await wcRequest('PUT', `/wp-json/wc/v3/products/${id}`, {
    description: cleanedHtml,
  });

  if (res && res.ok) {
    console.log(`✅ [${id}] "${name.slice(0, 55)}" (${origText.length}c → ${cleanedText.length}c)`);
    return { id, fixed: true };
  } else {
    const hint = res?.status === 403 ? ' — kiểm tra WC API credentials' : ` status=${res?.status}`;
    console.log(`❌ [${id}] "${name.slice(0, 55)}"${hint}`);
    return { id, error: true };
  }
}

// ── MAIN ───────────────────────────────────────────────────────────────────────
async function main() {
  console.log(DRY_RUN
    ? '=== DRY-RUN: Scan long_description noise (--apply để ghi) ==='
    : '=== APPLY: Cleaning long_descriptions ===');
  if (ONLY_ID) console.log(`   Chỉ xử lý ID: ${ONLY_ID}`);
  console.log(`   Strip: metadata block + standalone headings + phone/email`);

  process.stderr.write('Fetching WC products...\n');
  const products = await fetchAll(
    '/wp-json/wc/v3/products',
    'id,name,permalink,description',
    true
  );

  const filtered = ONLY_ID ? products.filter(p => p.id === ONLY_ID) : products;
  if (!filtered.length) { console.log('Không tìm thấy sản phẩm.'); return; }

  const stats = { found: 0, skipped: 0, skippedSafe: 0, fixed: 0, errors: 0, needsReview: 0 };

  for (const p of filtered) {
    const r = await processProduct(p);
    if (r.skipped)      { stats.skipped++; continue; }
    if (r.skippedSafe)  { stats.skippedSafe++; if (r.needsReview) stats.needsReview++; continue; }
    stats.found++;
    if (r.fixed)        stats.fixed++;
    if (r.error)        stats.errors++;
    if (r.needsManual)  stats.needsReview++;
  }

  console.log('═'.repeat(60));
  if (DRY_RUN) {
    console.log(`📋 Dry-run complete (${filtered.length} products scanned):`);
    console.log(`   🔧 Có noise cần fix: ${stats.found}`);
    console.log(`   ⏭  Skipped (sạch):   ${stats.skipped}`);
    console.log(`   ⚠️  Cần review:       ${stats.needsReview}`);
    if (stats.found > 0) {
      console.log(`\n→ Chạy --apply để strip noise`);
    } else {
      console.log('\n✅ Tất cả long_descriptions đã sạch!');
    }
  } else {
    console.log(`✅ Đã fix: ${stats.fixed} products`);
    if (stats.skippedSafe) console.log(`⚠️  Đã skip (safety): ${stats.skippedSafe}`);
    if (stats.errors)      console.log(`❌ Lỗi: ${stats.errors}`);
    if (stats.needsReview) console.log(`✏️  Cần review: ${stats.needsReview}`);
    if (stats.fixed > 0) {
      console.log('\n→ Nhớ purge cache: node khoa.js purge-cache');
    }
  }
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
