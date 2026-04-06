#!/usr/bin/env node
/**
 * ai-rewrite-product.js  v2  (2026-04-03)
 * AI viết lại rank_math_title + short_description + rank_math_description
 * cho WooCommerce products năm 2025 cần cải thiện SEO.
 *
 * Filter: products năm 2025 có title kiểu cũ ("Hãng B&R") HOẶC short_desc có metadata noise.
 * Scope: 373–413 products.
 *
 * Workflow:
 *   1. DRY-RUN → AI rewrite → lưu cache + xuất CSV để review
 *   2. Bạn review CSV (3 cột: title mới, short_desc mới, meta_desc mới)
 *   3. APPLY → push lên WooCommerce
 *
 * Cách dùng:
 *   node ai-rewrite-product.js                    # dry-run tất cả (có filter)
 *   node ai-rewrite-product.js --id=5334          # dry-run: test 1 SP
 *   node ai-rewrite-product.js --limit=5          # dry-run: test 5 SP đầu
 *   node ai-rewrite-product.js --resume           # tiếp tục từ cache
 *   node ai-rewrite-product.js --apply            # push cached results lên WC
 *   node ai-rewrite-product.js --apply --id=5382  # push 1 SP
 *
 * Output files:
 *   ../cache/ai-rewrite-cache.json   — kết quả AI theo ID (bền vững, incremental)
 *   ../reports/ai-rewrite-YYYYMMDD.csv  — export để review trước apply
 *
 * SEO standards:
 *   TITLE:      50–60c. Mã SP đứng đầu. Kết thúc B&R.
 *   SHORT_DESC: 220–300c. 3 câu kỹ thuật. Hiển thị trên trang sản phẩm.
 *   META_DESC:  140–155c. 1-2 câu tối ưu CTR. Hiển thị trên Google SERP.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { config, wcRequest, fetchAll }  = require('./wp-client');
const { chatComplete, modelInfo }      = require('./claudible-client');

// ── CLI args ──────────────────────────────────────────────────────────────────
const ARGS       = process.argv.slice(2);
const APPLY_MODE = ARGS.includes('--apply');
const RESUME     = ARGS.includes('--resume');
const ONLY_ID    = (() => { const m = process.argv.join(' ').match(/--id=(\d+)/);   return m ? +m[1] : null; })();
const LIMIT      = (() => { const m = process.argv.join(' ').match(/--limit=(\d+)/); return m ? +m[1] : null; })();
const YEAR       = (() => { const m = process.argv.join(' ').match(/--year=(\d{4})/); return m ? m[1] : '2025'; })();

// ── Paths ─────────────────────────────────────────────────────────────────────
const WORKSPACE  = path.resolve(__dirname, '..');
const CACHE_DIR  = path.join(WORKSPACE, 'cache');
const REPORT_DIR = path.join(WORKSPACE, 'reports');
// Cache riêng theo năm để không trộn lẫn 2025 ↔ 2021
const CACHE_FILE = path.join(CACHE_DIR, `ai-rewrite-cache-${YEAR}.json`);

for (const d of [CACHE_DIR, REPORT_DIR]) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const strip = h => (h || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<')
  .replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#039;/g,"'")
  .replace(/&#\d+;/g, c => String.fromCharCode(parseInt(c.match(/\d+/)[0])))
  .replace(/&\w+;/g,' ').replace(/\s+/g,' ').trim();

// Xóa noise khỏi long_desc trước khi đưa vào AI
function cleanLongDesc(html) {
  if (!html) return '';
  // Xóa metadata block dạng <li>
  html = html.replace(/<li[^>]*>\s*Mã\s+(số\s+)?sản\s+phẩm\s*:\s*[^<]*<\/li>/gi, '');
  html = html.replace(/<li[^>]*>\s*Thương\s+hiệu\s*:\s*[^<]*<\/li>/gi, '');
  html = html.replace(/<li[^>]*>\s*Xuất\s+xứ\s*:\s*[^<]*<\/li>/gi, '');
  // Xóa metadata dạng inline
  html = html.replace(/Mã\s+(số\s+)?sản\s+phẩm\s*:\s*[\w.\-]+\s*/gi, '');
  html = html.replace(/Thương\s+hiệu\s*:\s*B&(?:amp;)?R\s*Automation\s*/gi, '');
  html = html.replace(/Xuất\s+xứ\s*:\s*Áo\.?\s*/gi, '');
  // Xóa hotline
  html = html.replace(/\b028\s*6670\s*9931\b/g, '');
  // Strip HTML → text
  return strip(html);
}

// Kiểm tra short_desc có metadata noise không
function hasMetadataNoise(text) {
  return /Mã\s*(số\s*)?sản\s*phẩm|Thương\s*hiệu\s*:\s*B/i.test(text);
}

// ── Kiểm tra product có cần rewrite không ─────────────────────────────────────
// Cần rewrite nếu: title dạng cũ ("Hãng B&R") HOẶC short_desc có metadata noise
function needsRewrite(product) {
  const title = (product.meta_data?.find(m => m.key === 'rank_math_title')?.value || '').trim();
  const short = strip(product.short_description);
  const titleOld = /Hãng\s+B&R/i.test(title) || /^\s*$/.test(title);
  return titleOld || hasMetadataNoise(short);
}

// ── Đọc / ghi cache ───────────────────────────────────────────────────────────
function loadCache() {
  if (!fs.existsSync(CACHE_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); }
  catch { return {}; }
}
function saveCache(cache) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

// ── Gọi AI qua claudible-client (CLAUDIBLE_API_KEY) ──────────────────────────
const SYSTEM_MSG = `Bạn là chuyên gia SEO kỹ thuật cho website B&R Automation tại Việt Nam.
Nhiệm vụ: viết TITLE, SHORT_DESC và META_DESC chuẩn Semantic SEO cho từng sản phẩm.
Quy tắc cứng:
- TITLE: 50–60 ký tự. Cấu trúc: [Mã SP] [Loại] [Spec phân biệt] B&R
- SHORT_DESC: 220–270 ký tự. Đúng 3 câu kỹ thuật, mỗi câu ~70-90 ký tự. Không CTA, không metadata.
- META_DESC: 140–155 ký tự. 1-2 câu súc tích, tối ưu CTR trên Google. Kết thúc bằng "| B&R".
- Trả lời ĐÚNG 3 dòng, KHÔNG giải thích, KHÔNG đếm ký tự.`;

async function callClaude(prompt) {
  // TITLE ~60c + SHORT_DESC ~270c + META_DESC ~155c + labels ≈ 500c
  // Tiếng Việt ~2 tokens/từ → cần ~800 tokens. Dùng 900 để đủ an toàn.
  const reply = await chatComplete(
    [
      { role: 'system', content: SYSTEM_MSG },
      { role: 'user',   content: prompt },
    ],
    { maxTokens: 900, temperature: 0.3 }
  );
  return reply;
}

// ── Xây dựng prompt SEO semantic ──────────────────────────────────────────────
function buildPrompt(product) {
  const name     = strip(product.name);
  const cats     = (product.categories || []).map(c => strip(c.name))
                    .filter(c => !/hãng b&r/i.test(c)).join(', ');
  const longText = cleanLongDesc(product.description);
  // Chỉ lấy 800 chars đầu của long_desc — đủ specs, tiết kiệm token
  const longSlice = longText.slice(0, 800);

  return `SẢN PHẨM:
Tên: ${name}
Danh mục: ${cats}
Nội dung kỹ thuật:
${longSlice}

TITLE (50–60 ký tự): [Mã SP] [Loại thiết bị] [Spec phân biệt] B&R
- Mã SP đứng đầu. Kết thúc "B&R". Không dùng "|".
Ví dụ đúng:
  "X20CP3583 PLC CPU Dual-Core 400 MHz POWERLINK X20 B&R"
  "8V1022.00-2 Servo Drive ACOPOS 1 kW POWERLINK B&R"
  "4PP420.0571-B5 Power Panel HMI 5.7in 320x240 IP65 B&R"
  "X20SLX910 Safety Controller 20DI openSAFETY SIL3 B&R"

SHORT_DESC (220–270 ký tự): 3 câu kỹ thuật súc tích, mỗi câu ~70-90 ký tự.
- Câu 1: [Mã SP] là [loại] dòng [line] B&R + specs chính (CPU/kênh/công suất + interfaces)
- Câu 2: Protocol/tiêu chuẩn/đặc tính nổi bật (SafeNODE, bus speed, certif, nhiệt độ...)
- Câu 3: Ứng dụng ngành cụ thể (robot, máy CNC, dệt, đóng gói...)
KHÔNG: CTA, metadata (Mã SP:/Thương hiệu:/Xuất xứ:), "lý tưởng cho", "tối ưu cho"
Ví dụ đúng:
  "X20SLX910 là safety controller dòng X20 B&R với 20 đầu vào số 24 VDC, 4 đầu ra xung, đạt PL e/SIL 3. Tích hợp SafeLOGIC-X, quản lý 10 SafeNODE qua openSAFETY, hỗ trợ 4 trục SafeMOTION. Dùng trong hệ thống an toàn: robot công nghiệp, máy ép, dây chuyền đóng gói."

META_DESC (140–155 ký tự): 1-2 câu tối ưu CTR trên Google SERP.
- Gọi hành động nhẹ + spec nổi bật nhất + thương hiệu. Không dùng "Giá tốt", "Báo giá".
- Cần đạt ≥140 ký tự. Kết thúc bằng "| B&R".
Ví dụ đúng (đếm ký tự mẫu: 147c):
  "X20SLX910 safety controller 20DI openSAFETY, đạt SIL 3/PL e — giải pháp an toàn máy ép, robot & dây chuyền tự động hóa. | B&R"
Ví dụ đúng (150c):
  "8V1640.00-2 servo drive ACOPOS 64A liên tục, 200A đỉnh, 54 kVA — điều khiển chuyển động chính xác cho máy CNC & dây chuyền sản xuất. | B&R"

TITLE:
SHORT_DESC:
META_DESC: `;
}

// ── Parse response AI ─────────────────────────────────────────────────────────

/**
 * Trim text đến ≤maxLen tại ranh giới câu cuối cùng (dấu ".")
 * Nếu không có "." trước maxLen, cắt tại khoảng trắng cuối.
 */
function trimAtSentence(text, maxLen) {
  if (text.length <= maxLen) return text;
  // Tìm "." cuối cùng trước maxLen
  const sub  = text.slice(0, maxLen);
  const last = sub.lastIndexOf('.');
  if (last > 0) return text.slice(0, last + 1).trim();
  // Fallback: cắt tại khoảng trắng
  const lastSpace = sub.lastIndexOf(' ');
  return text.slice(0, lastSpace > 0 ? lastSpace : maxLen).trim();
}

function parseAIResponse(text) {
  const titleMatch = text.match(/^TITLE:\s*(.+)/m);
  const shortMatch = text.match(/^SHORT_DESC:\s*([\s\S]+?)(?=^META_DESC:|$)/m);
  const metaMatch  = text.match(/^META_DESC:\s*(.+)/m);
  if (!titleMatch || !shortMatch) return null;

  let shortDesc = shortMatch[1].trim().replace(/\n/g, ' ').replace(/\s+/g, ' ');
  // Auto-trim đến 300c tại ranh giới câu — enforce chuẩn SEO 200-300c
  if (shortDesc.length > 300) shortDesc = trimAtSentence(shortDesc, 300);

  let metaDesc = metaMatch ? metaMatch[1].trim().replace(/\n/g, ' ').replace(/\s+/g, ' ') : '';
  // Auto-trim meta đến 160c tại ranh giới từ
  if (metaDesc.length > 160) {
    const cut = metaDesc.lastIndexOf(' ', 157);
    metaDesc = metaDesc.slice(0, cut > 0 ? cut : 157).trim();
  }

  return {
    title:     titleMatch[1].trim(),
    shortDesc,
    metaDesc,
  };
}

// ── Validate kết quả AI ───────────────────────────────────────────────────────
function validate(result, productId) {
  const issues = [];
  if (!result) return ['Không parse được response'];

  const tLen = result.title.length;
  const sLen = result.shortDesc.length;
  const mLen = (result.metaDesc || '').length;

  if (tLen < 45) issues.push(`Title quá ngắn (${tLen}c, cần ≥50c)`);
  if (tLen > 62) issues.push(`Title quá dài (${tLen}c, cần ≤60c)`);
  if (sLen < 180) issues.push(`Short desc quá ngắn (${sLen}c, cần ≥220c)`);
  if (sLen > 305) issues.push(`Short desc quá dài (${sLen}c) — auto-trim chưa chạy?`);
  if (mLen > 0 && mLen < 100) issues.push(`Meta desc quá ngắn (${mLen}c, cần ≥140c)`);
  if (mLen > 160) issues.push(`Meta desc quá dài (${mLen}c, cần ≤155c)`);
  if (mLen === 0) issues.push('Meta desc trống — parse thất bại?');
  if (/Hãng B&R/.test(result.title)) issues.push('Title vẫn có "Hãng B&R"');
  if (/Liên hệ|Tư vấn|Báo giá|Xem ngay/i.test(result.shortDesc)) issues.push('Short desc có CTA');
  if (/Mã\s*sản\s*phẩm|Thương\s*hiệu|Xuất\s*xứ/i.test(result.shortDesc)) issues.push('Short desc còn metadata');
  if (/lý tưởng cho|tối ưu cho|giải pháp tối ưu/i.test(result.shortDesc)) issues.push('Short desc generic close');
  if (/Giá\s*tốt|Báo\s*giá|Liên\s*hệ/i.test(result.metaDesc)) issues.push('Meta desc có CTA xấu');

  return issues;
}

// ── Export CSV ────────────────────────────────────────────────────────────────
function exportCsv(cache) {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const file = path.join(REPORT_DIR, `ai-rewrite-${date}-${YEAR}.csv`);
  const esc  = s => '"' + String(s||'').replace(/"/g, '""') + '"';

  const header = [
    'ID','URL','WC Name',
    'Title cũ','Title mới','Chars title',
    'Short Desc mới','Chars short',
    'Meta Desc cũ','Meta Desc mới','Chars meta',
    'Issues','Status',
  ];
  const rows = Object.entries(cache)
    .filter(([, v]) => v.result)
    .map(([id, v]) => [
      id,
      v.url,
      v.wcName,
      v.oldTitle,
      v.result.title,
      v.result.title.length,
      v.result.shortDesc,
      v.result.shortDesc.length,
      v.oldMetaDesc || '',
      v.result.metaDesc || '',
      (v.result.metaDesc || '').length,
      (v.issues || []).join('; '),
      v.issues?.length ? 'REVIEW' : 'OK',
    ].map(esc).join(','));

  fs.writeFileSync(file, [header.join(','), ...rows].join('\n'), 'utf8');
  return file;
}

// ── APPLY: push cache → WooCommerce ──────────────────────────────────────────
async function applyFromCache() {
  const cache = loadCache();
  const entries = Object.entries(cache).filter(([, v]) => v.result && !v.applied);

  if (ONLY_ID) {
    const entry = cache[String(ONLY_ID)];
    if (!entry?.result) { console.log(`ID ${ONLY_ID} chưa có trong cache. Chạy dry-run trước.`); process.exit(1); }
  }

  const targets = ONLY_ID
    ? entries.filter(([id]) => +id === ONLY_ID)
    : entries;

  if (!targets.length) { console.log('Không có item nào cần apply (tất cả đã apply hoặc cache rỗng).'); return; }

  console.log(`=== APPLY: ${targets.length} products → WooCommerce ===\n`);
  let ok = 0, err = 0;

  for (const [id, v] of targets) {
    const existingMeta = (v.rawMetaData || [])
      .filter(m => m.key !== 'rank_math_title' && m.key !== 'rank_math_description');

    try {
      const res = await wcRequest('PUT', `/wp-json/wc/v3/products/${id}`, {
        short_description: '<p>' + v.result.shortDesc + '</p>',
        meta_data: [
          ...existingMeta,
          { key: 'rank_math_title',       value: v.result.title    },
          { key: 'rank_math_description', value: v.result.metaDesc || v.result.shortDesc.slice(0, 155) },
        ],
      });

      if (res && res.ok) {
        cache[id].applied = true;
        cache[id].appliedAt = new Date().toISOString();
        saveCache(cache);
        console.log(`✅ [${id}] ${v.wcName?.slice(0, 50)}`);
        console.log(`   title: ${v.result.title}`);
        ok++;
      } else {
        const hint = res?.status === 403 ? ' (403 — kiểm tra WC credentials)' : ` status=${res?.status}`;
        console.log(`❌ [${id}] ${v.wcName?.slice(0, 50)}${hint}`);
        err++;
      }
    } catch (e) {
      console.log(`❌ [${id}] Error: ${e.message}`);
      err++;
    }

    // Rate limit: 10 req/s
    await new Promise(r => setTimeout(r, 110));
  }

  console.log(`\n════════════════════════════════`);
  console.log(`✅ Applied: ${ok} | ❌ Errors: ${err}`);
  if (ok > 0) console.log('\n→ Nhớ purge cache: node khoa.js purge-cache');
}

// ── DRY-RUN: AI rewrite → cache ───────────────────────────────────────────────
async function dryRun() {
  console.log(ONLY_ID
    ? `=== DRY-RUN: AI rewrite SP #${ONLY_ID} ===`
    : `=== DRY-RUN: AI rewrite products năm ${YEAR} ===`);
  if (LIMIT) console.log(`   Giới hạn: ${LIMIT} SP`);
  if (RESUME) console.log('   Resume mode: bỏ qua SP đã có trong cache');
  console.log('');

  const cache = loadCache();

  // Lấy danh sách products
  process.stderr.write('Fetching products from WooCommerce...\n');
  const all = await fetchAll(
    '/wp-json/wc/v3/products',
    'id,name,date_created,short_description,description,permalink,categories,meta_data',
    true
  );

  // Filter theo năm
  // - 2025: chỉ SP có title cũ "Hãng B&R" HOẶC short_desc noise (needsRewrite)
  // - Năm khác (vd 2021 viết tay): rewrite TOÀN BỘ để đồng nhất chất lượng
  let targets = all.filter(p => {
    if (!(p.date_created || '').startsWith(YEAR)) return false;
    return YEAR === '2025' ? needsRewrite(p) : true;
  });

  if (ONLY_ID) {
    // Nếu --id: xử lý đúng ID đó dù năm nào (để test)
    targets = all.filter(p => p.id === ONLY_ID);
    if (!targets.length) { console.log(`Không tìm thấy product ID ${ONLY_ID}`); process.exit(1); }
  }

  if (RESUME) {
    targets = targets.filter(p => !cache[String(p.id)]?.result);
    console.log(`Resume: ${targets.length} SP chưa có trong cache`);
  }

  if (LIMIT) targets = targets.slice(0, LIMIT);

  console.log(`Target: ${targets.length} products\n`);

  let done = 0, skipped = 0, errors = 0;

  for (const p of targets) {
    const id  = String(p.id);
    const url = p.permalink || '';
    const oldTitle    = (p.meta_data?.find(m => m.key === 'rank_math_title')?.value || strip(p.name)).trim();
    const oldMetaDesc = (p.meta_data?.find(m => m.key === 'rank_math_description')?.value || '').trim();

    if (RESUME && cache[id]?.result) { skipped++; continue; }

    process.stderr.write(`[${p.id}] ${strip(p.name).slice(0, 50)}...\n`);

    try {
      const prompt   = buildPrompt(p);
      const response = await callClaude(prompt);
      const result   = parseAIResponse(response);
      const issues   = validate(result, p.id);

      cache[id] = {
        id:           p.id,
        url,
        wcName:       strip(p.name),
        oldTitle,
        oldMetaDesc,
        oldShortDesc: strip(p.short_description),
        rawMetaData:  p.meta_data || [],
        result,
        issues,
        rawResponse:  response,
        generatedAt:  new Date().toISOString(),
        applied:      false,
      };
      saveCache(cache);

      // Print preview
      const statusIcon = issues.length ? '⚠️ ' : '✅';
      console.log(`${statusIcon} [${p.id}] ${strip(p.name).slice(0, 45)}`);
      if (result) {
        console.log(`   TITLE (${result.title.length}c): ${result.title}`);
        console.log(`   SHORT (${result.shortDesc.length}c): ${result.shortDesc.slice(0, 100)}…`);
        console.log(`   META  (${(result.metaDesc||'').length}c): ${(result.metaDesc||'(trống)').slice(0, 100)}`);
      }
      if (issues.length) console.log(`   ⚠️  Issues: ${issues.join(', ')}`);
      console.log('');

      done++;
    } catch (e) {
      console.log(`❌ [${p.id}] Error: ${e.message}`);
      errors++;
    }

    // Rate limit Anthropic: ~50 req/min for Haiku
    await new Promise(r => setTimeout(r, 1300));
  }

  // Export CSV
  const csvFile = exportCsv(cache);

  console.log('═'.repeat(60));
  console.log(`Dry-run complete:`);
  console.log(`  ✅ Done:    ${done}`);
  console.log(`  ⏭️  Skipped: ${skipped} (đã có cache)`);
  console.log(`  ❌ Errors:  ${errors}`);
  console.log(`  📋 CSV:     ${csvFile}`);
  console.log('');

  // Summary: bao nhiêu cần review
  const needReview = Object.values(cache).filter(v => v.issues?.length).length;
  const allReady   = Object.values(cache).filter(v => v.result && !v.issues?.length).length;
  console.log(`  🟢 Sẵn sàng apply: ${allReady}`);
  console.log(`  🟡 Cần review:     ${needReview}`);
  console.log('');
  console.log('→ Review CSV, sau đó chạy: node khoa.js apply-rewrite-product');
  console.log('→ Apply 1 SP test:          node khoa.js apply-rewrite-product --id=5382');
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  if (APPLY_MODE) {
    await applyFromCache();
  } else {
    await dryRun();
  }
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
