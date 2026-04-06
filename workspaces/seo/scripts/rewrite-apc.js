#!/usr/bin/env node
/**
 * rewrite-apc.js  (2026-04-06)
 * AI rewrite short_description + meta_description cho 14 sản phẩm:
 *   APC2100 (6), APC2200 (4), APC3100 (4)
 *
 * Vấn đề cần fix:
 *   1. short_desc boilerplate — chỉ thay mã, không có spec phân biệt variant
 *   2. short_desc có 4 dòng noise: "Chính hãng, bảo hành 1 năm..." etc.
 *   3. meta_desc kết thúc bằng CTA "Tư vấn miễn phí!" / "Liên hệ ngay!"
 *   4. ID 3769: title sai dấu (5APC3100-KBU3-000 → 5APC3100.KBU3-000), suffix "| AGOW"
 *
 * Workflow:
 *   node rewrite-apc.js           # dry-run → AI → cache → xuất CSV
 *   node rewrite-apc.js --apply   # apply từ cache lên WC
 *
 * Output:
 *   ../cache/apc-rewrite-cache.json
 *   ../reports/apc-rewrite-YYYYMMDD.csv
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { config, wcRequest, wpGet, wpPost } = require('./wp-client');
const { chatComplete } = require('./claudible-client');

const APPLY_MODE = process.argv.includes('--apply');

const WORKSPACE  = path.resolve(__dirname, '..');
const CACHE_DIR  = path.join(WORKSPACE, 'cache');
const REPORT_DIR = path.join(WORKSPACE, 'reports');
const CACHE_FILE = path.join(CACHE_DIR, 'apc-rewrite-cache.json');
const today      = new Date().toISOString().slice(0,10).replace(/-/g,'');
const CSV_FILE   = path.join(REPORT_DIR, `apc-rewrite-${today}.csv`);

for (const d of [CACHE_DIR, REPORT_DIR]) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

// Product IDs theo category
const PRODUCT_GROUPS = [
  { cat: 'APC2100', ids: [3755, 3754, 3753, 3752, 3751, 3744] },
  { cat: 'APC2200', ids: [3762, 3761, 3760, 3757] },
  { cat: 'APC3100', ids: [3769, 3767, 3766, 3764] },
];

// ID cần fix title riêng
const TITLE_FIXES = {
  3769: '5APC3100.KBU3-000 Máy Tính Công Nghiệp Core i7 B&R',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const strip = h => (h||'').replace(/<[^>]+>/g,' ')
  .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
  .replace(/&quot;/g,'"').replace(/&#039;/g,"'")
  .replace(/&\w+;/g,' ').replace(/\s+/g,' ').trim();

function cleanLongDesc(html) {
  if (!html) return '';
  html = html.replace(/<li[^>]*>\s*Mã\s*(số\s*)?sản\s*phẩm\s*:\s*[^<]*<\/li>/gi, '');
  html = html.replace(/<li[^>]*>\s*Thương\s*hiệu\s*:\s*[^<]*<\/li>/gi, '');
  html = html.replace(/<li[^>]*>\s*Xuất\s*xứ\s*:\s*[^<]*<\/li>/gi, '');
  html = html.replace(/Mã\s*(số\s*)?sản\s*phẩm\s*:\s*[\w.\-]+\s*/gi, '');
  html = html.replace(/Thương\s*hiệu\s*:\s*B&(?:amp;)?R\s*Automation\s*/gi, '');
  html = html.replace(/Xuất\s*xứ\s*:\s*Áo\.?\s*/gi, '');
  html = html.replace(/\b028\s*6670\s*9931\b/g, '');
  return strip(html);
}

function loadCache() {
  if (!fs.existsSync(CACHE_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(CACHE_FILE,'utf8')); }
  catch { return {}; }
}
function saveCache(cache) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

// ── Trim tại ranh giới câu ────────────────────────────────────────────────────
function trimAtSentence(text, maxLen) {
  if (text.length <= maxLen) return text;
  const sub  = text.slice(0, maxLen);
  const last = sub.lastIndexOf('.');
  if (last > 0) return text.slice(0, last + 1).trim();
  return text.slice(0, sub.lastIndexOf(' ') || maxLen).trim();
}

// ── AI system prompt ──────────────────────────────────────────────────────────
const SYSTEM_MSG = `Bạn là chuyên gia SEO kỹ thuật cho website phân phối thiết bị B&R Automation tại Việt Nam.
Viết SHORT_DESC và META_DESC chuẩn Semantic SEO cho từng variant máy tính công nghiệp B&R.

Quy tắc cứng:
- SHORT_DESC: 220–280 ký tự. Đúng 3 câu kỹ thuật.
  Câu 1: [Mã SP] là [loại thiết bị] dòng [dòng SP] B&R — nêu đặc điểm PHÂN BIỆT variant này (CPU, RAM, storage, số slot).
  Câu 2: Kiến trúc/giao tiếp/interface nổi bật (POWERLINK, EtherNet/IP, PCIe, USB, số COM port...).
  Câu 3: Ứng dụng ngành cụ thể (điều khiển máy, robot, automation panel, SCADA...).
  KHÔNG: "Chính hãng", "bảo hành", "Giá cả hợp lí", "hóa đơn đầy đủ", "Giao hàng", CTA bất kỳ.
- META_DESC: 140–155 ký tự. 1-2 câu spec + intent. Không CTA "Liên hệ", "Tư vấn", "Báo giá". Kết thúc "| B&R".
- Trả ĐÚNG 2 dòng, không giải thích.`;

function buildPrompt(product, catDesc) {
  const name     = strip(product.name);
  const longText = cleanLongDesc(product.description).slice(0, 1000);
  const currentShort = strip(product.short_description);
  const meta = product._rankMathMeta || {};
  const currentMeta = meta.rank_math_description || '';

  return `VARIANT: ${name}
Dòng sản phẩm: ${catDesc}
Mô tả kỹ thuật gốc (dùng để trích specs):
${longText}

SHORT_DESC hiện tại (cần cải thiện — boilerplate, thiếu specs phân biệt variant):
${currentShort.slice(0, 200)}

META_DESC hiện tại (cần bỏ CTA cuối):
${currentMeta}

Yêu cầu: Viết SHORT_DESC và META_DESC mới cho đúng VARIANT ${name}.
SHORT_DESC phải nêu spec CỤ THỂ phân biệt variant này với các variant khác trong cùng dòng.

SHORT_DESC:
META_DESC:`;
}

// ── Parse AI response ─────────────────────────────────────────────────────────
function parseResponse(text) {
  const shortMatch = text.match(/^SHORT_DESC:\s*([\s\S]+?)(?=^META_DESC:|$)/m);
  const metaMatch  = text.match(/^META_DESC:\s*(.+)/m);
  if (!shortMatch) return null;

  let shortDesc = shortMatch[1].trim().replace(/\n/g,' ').replace(/\s+/g,' ');
  if (shortDesc.length > 300) shortDesc = trimAtSentence(shortDesc, 300);

  let metaDesc = metaMatch ? metaMatch[1].trim().replace(/\n/g,' ').replace(/\s+/g,' ') : '';
  if (metaDesc.length > 160) metaDesc = trimAtSentence(metaDesc, 160);

  return { shortDesc, metaDesc };
}

// Category descriptions để cung cấp context cho AI
const CAT_DESCS = {
  APC2100: 'Automation PC 2100 — máy tính công nghiệp compact B&R, bo mạch CPU + vỏ + đế gắn, RAM hàn vĩnh viễn, nhiều variant BY01/BY11/BY22/BY34/BY44/BY48 phân biệt theo RAM/CPU/storage.',
  APC2200: 'Automation PC 2200 — máy tính công nghiệp B&R kiến trúc Apollo Lake Intel, hệ thống PC hoàn chỉnh, variant phân biệt theo CPU (dual-core/quad-core) và RAM.',
  APC3100: 'Automation PC 3100 — máy tính công nghiệp B&R với Core i-series thế hệ mới, thiết kế nhỏ gọn cho tủ điện, tùy biến module, variant KBU0/KBU1/KBU2/KBU3 phân biệt theo CPU tier.',
};

// ── DRY-RUN: fetch + AI ───────────────────────────────────────────────────────
async function dryRun() {
  const cache = loadCache();
  const allIds = PRODUCT_GROUPS.flatMap(g => g.ids);
  const todo   = allIds.filter(id => !cache[id]);

  console.log(`Total: ${allIds.length} | Cached: ${allIds.length - todo.length} | To process: ${todo.length}`);
  if (todo.length === 0) { console.log('✅ All cached. Run --apply to push.'); exportCSV(cache, allIds); return; }

  let done = 0, failed = 0;

  for (const group of PRODUCT_GROUPS) {
    for (const id of group.ids) {
      if (cache[id]) { process.stdout.write(`  ⏭  [${id}] cached\n`); continue; }

      // Fetch product
      let product;
      try {
        const wcRes = await wcRequest('GET', `/wp-json/wc/v3/products/${id}?_fields=id,name,sku,short_description,description`);
        if (!wcRes.ok) throw new Error(`WC GET ${wcRes.status}`);
        product = wcRes.body;
        // Fetch RankMath meta
        const rmRes = await wpGet(`/wp-json/wp/v2/product/${id}?_fields=meta`);
        product._rankMathMeta = rmRes.body?.meta || {};
      } catch(e) {
        console.error(`  ❌ [${id}] fetch error: ${e.message}`);
        failed++;
        continue;
      }

      // Call AI
      process.stdout.write(`  🤖 [${id}] ${product.sku} generating...\n`);
      try {
        const prompt = buildPrompt(product, CAT_DESCS[group.cat]);
        const raw    = await chatComplete(
          [{ role:'system', content:SYSTEM_MSG }, { role:'user', content:prompt }],
          { maxTokens: 700, temperature: 0.3 }
        );
        const parsed = parseResponse(raw);
        if (!parsed) {
          console.error(`  ❌ [${id}] parse failed. Raw:\n${raw.slice(0,200)}`);
          failed++;
          continue;
        }

        cache[id] = {
          id,
          sku:          product.sku,
          name:         strip(product.name),
          cat:          group.cat,
          shortDesc:    parsed.shortDesc,
          metaDesc:     parsed.metaDesc,
          titleFix:     TITLE_FIXES[id] || null,
          shortLen:     parsed.shortDesc.length,
          metaLen:      parsed.metaDesc.length,
        };
        saveCache(cache);
        done++;
        process.stdout.write(`     short=${parsed.shortDesc.length}c | meta=${parsed.metaDesc.length}c\n`);
        process.stdout.write(`     SHORT: ${parsed.shortDesc.slice(0,100)}...\n`);
      } catch(e) {
        console.error(`  ❌ [${id}] AI error: ${e.message}`);
        failed++;
      }

      // Rate limit
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log(`\n✅ Generated: ${done} | ❌ Failed: ${failed}`);
  exportCSV(cache, allIds);
}

// ── Export CSV ────────────────────────────────────────────────────────────────
function exportCSV(cache, allIds) {
  const header = 'ID,Cat,SKU,Name,ShortLen,MetaLen,Title_Fix,Short_DESC_NEW,Meta_DESC_NEW';
  const rows   = allIds.filter(id => cache[id]).map(id => {
    const c = cache[id];
    const escape = s => '"' + (s||'').replace(/"/g,'""') + '"';
    return [
      c.id, c.cat, c.sku,
      escape(c.name),
      c.shortLen, c.metaLen,
      escape(c.titleFix||''),
      escape(c.shortDesc),
      escape(c.metaDesc),
    ].join(',');
  });
  fs.writeFileSync(CSV_FILE, [header, ...rows].join('\n'));
  console.log(`\n📊 CSV exported: ${CSV_FILE}`);
  console.log('Review CSV trước khi chạy --apply');
}

// ── APPLY ─────────────────────────────────────────────────────────────────────
async function apply() {
  const cache = loadCache();
  const allIds = PRODUCT_GROUPS.flatMap(g => g.ids);
  const ready  = allIds.filter(id => cache[id]);

  if (ready.length === 0) {
    console.log('❌ No cached results. Run dry-run first.'); return;
  }

  console.log(`Applying ${ready.length} products...`);
  let ok = 0, err = 0;

  for (const id of ready) {
    const c = cache[id];
    try {
      // 1. Update WC: short_description
      const wcRes = await wcRequest('PUT', `/wp-json/wc/v3/products/${id}`, { short_description: `<p>${c.shortDesc}</p>` });
      if (!wcRes.ok) throw new Error(`WC PUT ${wcRes.status}`);

      // 2. Update WP: RankMath meta_description (+ title if needed)
      const metaFields = { rank_math_description: c.metaDesc };
      if (c.titleFix) metaFields.rank_math_title = c.titleFix;
      const wpRes = await wpPost(`/wp-json/wp/v2/product/${id}`, { meta: metaFields });
      if (!wpRes.ok) throw new Error(`WP POST ${wpRes.status}`);

      ok++;
      process.stdout.write(`  ✅ [${id}] ${c.sku}\n`);
    } catch(e) {
      err++;
      process.stdout.write(`  ❌ [${id}] ${c.sku}: ${e.message}\n`);
    }
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\n✅ Applied: ${ok} | ❌ Errors: ${err}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  if (APPLY_MODE) {
    await apply();
  } else {
    await dryRun();
  }
})().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
