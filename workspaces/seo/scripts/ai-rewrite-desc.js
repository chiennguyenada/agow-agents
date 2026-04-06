/**
 * ai-rewrite-desc.js
 * AI rewrite toàn bộ WooCommerce product description (long desc / tab "Mô tả").
 *
 * PHASE 1 — Dry-run (default):
 *   Fetch products → pre-clean noise → gọi AI → lưu cache JSON + xuất CSV
 *   KHÔNG ghi gì lên WP.
 *
 * PHASE 2 — Apply:
 *   Đọc cache JSON → ghi WC API → purge cache
 *
 * Usage:
 *   node ai-rewrite-desc.js                   # dry-run tất cả ~590 SP
 *   node ai-rewrite-desc.js --id=5382         # dry-run 1 SP (test nhanh)
 *   node ai-rewrite-desc.js --limit=5         # dry-run 5 SP (budget test)
 *   node ai-rewrite-desc.js --apply           # apply từ cache → ghi WC
 *   node ai-rewrite-desc.js --apply --id=5382 # apply 1 SP từ cache
 *
 * Entry point: khoa.js rewrite-desc / apply-rewrite-desc
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { config, wcRequest, fetchAll } = require('./wp-client');
const { chatComplete, modelInfo }     = require('./claudible-client');

// ── CLI flags ──────────────────────────────────────────────────────────────────
const APPLY    = process.argv.includes('--apply');
const ONLY_ID  = (() => { const m = process.argv.join(' ').match(/--id=(\d+)/);    return m ? parseInt(m[1]) : null; })();
const LIMIT    = (() => { const m = process.argv.join(' ').match(/--limit=(\d+)/); return m ? parseInt(m[1]) : null; })();

// ── Paths ──────────────────────────────────────────────────────────────────────
const REPORTS_DIR = path.join(__dirname, '..', 'reports');
const BACKUPS_DIR = path.join(__dirname, '..', 'backups');
if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });

const DATE_STR  = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const CACHE_FILE = path.join(REPORTS_DIR, `ai-rewrite-cache-${DATE_STR}.json`);
const CSV_FILE   = path.join(REPORTS_DIR, `ai-rewrite-desc-${DATE_STR}.csv`);

// ── Noise stripping ────────────────────────────────────────────────────────────
/**
 * Strip HTML tags → plain text (dùng để gửi AI và xuất CSV).
 */
function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#\d+;/g, ' ').replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

/**
 * Pre-clean noise thật sự khỏi HTML trước khi gửi AI.
 *
 * KHÔNG xóa citation (data sheet, trang X) / (manual, trang X) —
 * đây là E-E-A-T signal quan trọng, AI cần GIỮ LẠI trong output.
 *
 * Chỉ xóa:
 *  R1: Hotline / SĐT / Email cụ thể của công ty
 *  R2: CTA boilerplate ("Liên hệ Agow để báo giá...")
 */
function cleanNoise(html) {
  let s = html || '';

  // R4: tham khảo "X20 system user's manual" (kèm dấu ngoặc kép hoặc không)
  s = s.replace(/,?\s*tham\s*khảo\s*["""]?X20\s+system\s+user'?s?\s*manual["""]?/gi, '');

  // R5a: Hotline: / Điện thoại: / Tel: / ĐT: kèm số — giữ lại 1 khoảng trắng sau context
  s = s.replace(/\s*(?:hotline|điện\s*thoại|tel|đt)\s*:?\s*[\d\s\-\.\(\)]{7,18}/gi, ' ');

  // R5b: Số cụ thể 028 6670 9931 (phòng khi không có label trước)
  s = s.replace(/\b028\s*6670\s*9931\b/g, '');

  // R5c: Email công ty
  s = s.replace(/\s*[Ee]mail\s*:\s*\S+@\S+/g, '');

  // Dọn dấu thừa sau khi strip: dấu chấm đôi, ngoặc rỗng, khoảng trắng thừa
  s = s.replace(/\.\s*\./g, '.').replace(/\(\s*\)/g, '').replace(/\s{2,}/g, ' ');

  return s.trim();
}

// ── Cache helpers ──────────────────────────────────────────────────────────────
function loadCache() {
  if (fs.existsSync(CACHE_FILE)) {
    try { return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); }
    catch { return {}; }
  }
  return {};
}

function saveCache(cache) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

// ── CSV helpers ────────────────────────────────────────────────────────────────
function csvEscape(s) {
  if (!s) return '""';
  return '"' + String(s).replace(/"/g, '""') + '"';
}

function writeCsvHeader(fd) {
  fs.writeSync(fd, 'ID,Name,URL,Orig_Chars,New_Chars,Status,Orig_Plain,New_Plain\n');
}

function appendCsvRow(fd, row) {
  const line = [
    row.id,
    csvEscape(row.name),
    csvEscape(row.url),
    row.origLen,
    row.newLen,
    csvEscape(row.status),
    csvEscape(row.origPlain),
    csvEscape(row.newPlain),
  ].join(',') + '\n';
  fs.writeSync(fd, line);
}

// ── AI Prompt ──────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Bạn là chuyên gia SEO cho Agow Automation — nhà phân phối B&R Automation tại Việt Nam.
Viết lại mô tả sản phẩm tab "Mô tả" cho WooCommerce. Ngôn ngữ: Tiếng Việt, văn phong kỹ thuật.

QUY TẮC:
1. Giữ 100% thông số kỹ thuật (V, A, MHz, mm, kW, IP rating, protocol, model codes).
2. KHÔNG bịa thêm thông số không có trong input.
3. KHÔNG viết CTA "Liên hệ Agow/báo giá" — boilerplate gây hại SEO.
4. KHÔNG dùng: "lý tưởng cho", "tối ưu cho", "giải pháp hoàn hảo".
5. KHÔNG giữ ref tài liệu dạng: tham khảo "X20 system user's manual".
6. GIỮ NGUYÊN mọi citation dạng (data sheet, trang X) và (manual, trang X) — đây là E-E-A-T signal quan trọng, chứng minh thông tin lấy từ tài liệu kỹ thuật chính hãng B&R.
7. Output HTML thuần: <h2>, <h3>, <ul>, <li>, <p>. Không dùng <h1>, không markdown.

CẤU TRÚC (theo đúng thứ tự):
<p>[Giới thiệu: tên SP + chức năng chính + điểm kỹ thuật nổi bật nhất — 2-3 câu]</p>
<h2>Tính năng nổi bật</h2>
<ul><li>[Tính năng + thông số cụ thể + citation nếu có]</li> ... (4-6 items)</ul>
<h2>Thông số kỹ thuật</h2>
<ul><li>[Thông số: giá trị + citation nếu có]</li> ... (tất cả thông số quan trọng)</ul>
<h2>Ứng dụng thực tế</h2>
<p>[2-3 câu ứng dụng cụ thể dựa trên thông số thực]</p>
<h2>Câu hỏi thường gặp</h2>
<h3>[Câu hỏi 1]</h3><p>[Trả lời ngắn]</p>
<h3>[Câu hỏi 2]</h3><p>[Trả lời ngắn]</p>
<h2>Thông tin đặt hàng</h2>
<h3>Mã sản phẩm</h3>
<p>• [Mã sản phẩm]<br />• Thương hiệu: B&R Automation<br />• Xuất xứ: Áo</p>

ĐỘ DÀI TARGET: 1800–2800 ký tự HTML.`;

function buildUserPrompt(product) {
  const cats = (product.categories || []).map(c => c.name).join(', ');
  const shortDesc = stripHtml(product.short_description || '');
  const cleanedDesc = stripHtml(cleanNoise(product.description || ''));
  // Giới hạn long desc gửi AI: max 2500 chars để tránh Cloudflare 524 timeout
  const descTrunc = cleanedDesc.length > 2500
    ? cleanedDesc.slice(0, 2500) + '…[còn lại đã lược bỏ]'
    : cleanedDesc;

  return `Tên sản phẩm: ${product.name}
Mã sản phẩm: ${product.sku || product.id}
Danh mục: ${cats || '(không có)'}
Short description: ${shortDesc || '(không có)'}

Long description hiện tại (đã strip noise):
${descTrunc || '(không có)'}`;
}

// ── Throttle ───────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── PHASE 1: Dry-run ───────────────────────────────────────────────────────────
async function runDryRun(products) {
  const cache = loadCache();

  // Open CSV file (append mode để resume được)
  const csvExists = fs.existsSync(CSV_FILE);
  const csvFd = fs.openSync(CSV_FILE, 'a');
  if (!csvExists) writeCsvHeader(csvFd);

  let processed = 0, skipped = 0, errors = 0;
  const total = products.length;

  console.log(`\n=== DRY-RUN: AI Rewrite ${total} products ===`);
  console.log(`   Model:  ${modelInfo.model}`);
  console.log(`   Cache:  ${CACHE_FILE}`);
  console.log(`   CSV:    ${CSV_FILE}`);
  console.log(`   Throttle: 1 req/s\n`);

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const pid = String(p.id);

    // Skip nếu đã có trong cache
    if (cache[pid]) {
      process.stderr.write(`[${i+1}/${total}] CACHED  ID ${p.id} — ${p.name.slice(0, 40)}\n`);
      skipped++;
      continue;
    }

    process.stderr.write(`[${i+1}/${total}] REWRITE ID ${p.id} — ${p.name.slice(0, 40)}...\n`);

    const origHtml  = p.description || '';
    const origPlain = stripHtml(cleanNoise(origHtml));

    let newHtml = '', status = '';
    try {
      const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: buildUserPrompt(p) },
      ];
      newHtml = await chatComplete(messages, { maxTokens: 2048, temperature: 0.3 });
      status = 'OK';
      processed++;
    } catch (e) {
      console.error(`   ❌ ERROR ID ${p.id}: ${e.message}`);
      status = `ERROR: ${e.message.slice(0, 80)}`;
      errors++;
      // Ghi vào CSV để tracking, không cache
      appendCsvRow(csvFd, {
        id: p.id, name: p.name, url: p.permalink || '',
        origLen: origHtml.length, newLen: 0, status,
        origPlain: origPlain.slice(0, 300), newPlain: '',
      });
      // Backoff: 503/524 = server overload → 10s; others → 3s
      const isOverload = e.message.includes('503') || e.message.includes('524');
      await sleep(isOverload ? 10000 : 3000);
      continue;
    }

    // Lưu cache
    const cacheEntry = {
      id: p.id, name: p.name, url: p.permalink || '',
      origLen: origHtml.length, newLen: newHtml.length,
      origHtml, newHtml,
      timestamp: new Date().toISOString(),
    };
    cache[pid] = cacheEntry;
    saveCache(cache);

    // Ghi CSV
    appendCsvRow(csvFd, {
      id: p.id, name: p.name, url: p.permalink || '',
      origLen: origHtml.length, newLen: newHtml.length,
      status,
      origPlain: origPlain.slice(0, 500),
      newPlain:  stripHtml(newHtml).slice(0, 500),
    });

    // Throttle 1 req/s
    await sleep(1000);
  }

  fs.closeSync(csvFd);

  console.log('\n' + '═'.repeat(60));
  console.log(`✅ Dry-run complete:`);
  console.log(`   Rewritten: ${processed}`);
  console.log(`   Cached (skipped): ${skipped}`);
  console.log(`   Errors: ${errors}`);
  console.log(`\n   Cache: ${CACHE_FILE}`);
  console.log(`   CSV:   ${CSV_FILE}`);
  if (processed + skipped > 0) {
    console.log(`\n→ Mở CSV để review Before/After`);
    console.log(`→ Nếu OK: node khoa.js apply-rewrite-desc`);
  }
}

// ── PHASE 2: Apply ─────────────────────────────────────────────────────────────
async function runApply(productIds) {
  // Tìm cache file mới nhất
  let cacheFile = CACHE_FILE;
  if (!fs.existsSync(cacheFile)) {
    // Tìm cache file gần nhất trong reports/
    const files = fs.readdirSync(REPORTS_DIR)
      .filter(f => f.startsWith('ai-rewrite-cache-') && f.endsWith('.json'))
      .sort().reverse();
    if (!files.length) {
      console.error('❌ Không tìm thấy cache file. Chạy dry-run trước: node khoa.js rewrite-desc');
      process.exit(1);
    }
    cacheFile = path.join(REPORTS_DIR, files[0]);
  }

  const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  const entries = productIds
    ? productIds.map(id => cache[String(id)]).filter(Boolean)
    : Object.values(cache);

  if (!entries.length) {
    console.error('❌ Không có entries nào trong cache để apply.');
    process.exit(1);
  }

  console.log(`\n=== APPLY: Writing ${entries.length} products to WooCommerce ===`);
  console.log(`   Cache: ${cacheFile}\n`);

  let applied = 0, errors = 0;

  for (const entry of entries) {
    const { id, name, origHtml, newHtml } = entry;

    // Backup trước khi ghi
    const backupFile = path.join(BACKUPS_DIR, `long-desc-backup-${id}-${Date.now()}.json`);
    fs.writeFileSync(backupFile, JSON.stringify({
      id, name, origHtml,
      backedUpAt: new Date().toISOString(),
    }, null, 2));

    // Ghi lên WC API
    try {
      const res = await wcRequest('PUT', `/wp-json/wc/v3/products/${id}`, {
        description: newHtml,
      });

      if (res && res.ok) {
        console.log(`✅ [${id}] ${name.slice(0, 50)}`);
        applied++;
      } else {
        console.error(`❌ [${id}] HTTP ${res?.status} — ${name.slice(0, 40)}`);
        errors++;
      }
    } catch (e) {
      console.error(`❌ [${id}] ERROR: ${e.message}`);
      errors++;
    }

    await sleep(500); // gentle throttle
  }

  console.log('\n' + '═'.repeat(60));
  console.log(`✅ Apply complete:`);
  console.log(`   Applied: ${applied}`);
  console.log(`   Errors:  ${errors}`);
  if (applied > 0) {
    console.log(`\n→ Nhớ purge cache: node khoa.js purge-cache`);
    console.log(`→ Verify trên site: kiểm tra 2-3 URLs`);
  }
}

// ── MAIN ───────────────────────────────────────────────────────────────────────
async function main() {
  if (APPLY) {
    // Phase 2: Apply
    const idFilter = ONLY_ID ? [ONLY_ID] : null;
    await runApply(idFilter);
    return;
  }

  // Phase 1: Dry-run — fetch products
  console.log('Fetching WC products...');
  let products = await fetchAll(
    '/wp-json/wc/v3/products',
    'id,name,permalink,sku,short_description,description,categories',
    true  // isWC = true
  );

  // Filter by --id
  if (ONLY_ID) {
    products = products.filter(p => p.id === ONLY_ID);
    if (!products.length) {
      console.error(`❌ Product ID ${ONLY_ID} không tìm thấy`);
      process.exit(1);
    }
  }

  // Filter by --limit
  if (LIMIT) {
    products = products.slice(0, LIMIT);
  }

  await runDryRun(products);
}

main().catch(e => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});
