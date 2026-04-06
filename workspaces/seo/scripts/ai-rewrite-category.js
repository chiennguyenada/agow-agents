'use strict';
/**
 * ai-rewrite-category.js — v1 — 2026-04-04
 *
 * AI viết/cải thiện SEO cho tất cả WooCommerce product categories:
 *   - description (HTML có H2, UL, chuẩn SEO semantic)
 *   - rank_math_title (50–60c)
 *   - rank_math_description (140–155c)
 *
 * Fetch:  WC API /products/categories (lấy description + count + parent)
 * Update: WP REST API /wp/v2/product_cat/{id} (có meta RankMath)
 *
 * Usage:
 *   node ai-rewrite-category.js              ← dry-run tất cả
 *   node ai-rewrite-category.js --id=382     ← test 1 DM
 *   node ai-rewrite-category.js --limit=3    ← test 3 DM đầu
 *   node ai-rewrite-category.js --resume     ← bỏ qua đã có cache
 *   node ai-rewrite-category.js --force --id=382 ← re-generate 1 DM
 *   node ai-rewrite-category.js --apply      ← apply cache → WooCommerce
 *   node ai-rewrite-category.js --apply --id=382
 */

const fs   = require('fs');
const path = require('path');
const { config, request, wcRequest, fetchAll } = require('./wp-client');
const { chatComplete } = require('./claudible-client');

// ── CLI args ──────────────────────────────────────────────────────────────────
const ARGS       = process.argv.slice(2);
const APPLY_MODE = ARGS.includes('--apply');
const RESUME     = ARGS.includes('--resume');
const FORCE      = ARGS.includes('--force');
const ONLY_ID    = (() => { const m = process.argv.join(' ').match(/--id=(\d+)/);    return m ? +m[1] : null; })();
const LIMIT      = (() => { const m = process.argv.join(' ').match(/--limit=(\d+)/); return m ? +m[1] : null; })();

// ── Paths ─────────────────────────────────────────────────────────────────────
const WORKSPACE  = path.resolve(__dirname, '..');
const CACHE_DIR  = path.join(WORKSPACE, 'cache');
const REPORT_DIR = path.join(WORKSPACE, 'reports');
const CACHE_FILE = path.join(CACHE_DIR, 'ai-rewrite-category-cache.json');
const BASE       = config.BASE_URL;

for (const d of [CACHE_DIR, REPORT_DIR]) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

// ── Skip IDs (system / irrelevant) ────────────────────────────────────────────
const SKIP_IDS = [15, 1]; // "Sản phẩm khác", "Uncategorized"

// ── Cache helpers ─────────────────────────────────────────────────────────────
function loadCache() {
  if (fs.existsSync(CACHE_FILE)) {
    try { return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch { return {}; }
  }
  return {};
}
function saveCache(cache) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

// ── Text helpers ──────────────────────────────────────────────────────────────
function strip(html) {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
function decodeEntities(html) {
  return (html || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#8211;/g, '–').replace(/&#8212;/g, '—')
    .replace(/&#8220;/g, '"').replace(/&#8221;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)));
}
function cleanDesc(html) {
  return strip(decodeEntities(html || '')).slice(0, 1200);
}
function wordCount(html) {
  return strip(html || '').split(/\s+/).filter(Boolean).length;
}

// ── Classify A (viết mới) vs B (cải thiện) ───────────────────────────────────
function classifyGroup(cat) {
  const len = cleanDesc(cat.description).length;
  if (len < 200) return 'A'; // trống hoặc quá sơ sài → viết mới
  return 'B';                // có nội dung → cải thiện
}

// ── Build AI prompt ───────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Bạn là chuyên gia SEO kỹ thuật B2B cho website phân phối thiết bị công nghiệp tự động hóa B&R tại Việt Nam.
Nhiệm vụ: viết DESCRIPTION (HTML), SEO_TITLE và META_DESC cho trang danh mục sản phẩm WooCommerce.
Khách hàng mục tiêu: kỹ sư tự động hóa, trưởng phòng kỹ thuật nhà máy.

Quy tắc BẮT BUỘC:
- DESCRIPTION: HTML hợp lệ. Cấu trúc: <p>[intro 2-3 câu]</p> → <h2>...</h2><ul><li>...</li></ul> × 2-3 lần → <p>[đoạn Agow]</p>
  Tổng 400–600 words. Tiếng Việt. Chỉ dùng thẻ: <p><h2><ul><li><strong>. KHÔNG dùng <h1><h3><table><div><script>.
- SEO_TITLE: 50–60 ký tự. Format: [Tên DM ngắn gọn] B&R | Agow Automation
- META_DESC: 140–155 ký tự trên MỘT DÒNG DUY NHẤT. Tối ưu CTR. Kết thúc "| Agow Automation".
- Luôn đề cập: tên danh mục chính xác, "B&R", "Agow Automation", ứng dụng thực tế tại nhà máy/dây chuyền sản xuất.
- KHÔNG: "Giá tốt", "Báo giá ngay", "Mua ngay", "lý tưởng cho", "tối ưu cho", "giải pháp tối ưu", placeholder [...].
- Viết "B&R" (đúng hoa), KHÔNG "hãng b&r" hay "B&amp;R".
- FORMAT OUTPUT: Trả về ĐÚNG 3 nhãn sau, KHÔNG dùng markdown heading ##, KHÔNG code fence \`\`\`, KHÔNG giải thích, KHÔNG bảng.
  DESCRIPTION:
  [HTML content trực tiếp]
  SEO_TITLE: [title text]
  META_DESC: [meta text trên 1 dòng]`;

function buildPrompt(cat, group, parentName) {
  const descClean = cleanDesc(cat.description);
  const parentLine = parentName ? `DANH MỤC CHA: ${parentName}\n` : '';

  const HTML_EXAMPLE = `
VÍ DỤ STRUCTURE (BẮT BUỘC theo đúng format này):
<p>Intro 2-3 câu giới thiệu danh mục và B&R Automation.</p>
<h2>Đặc điểm nổi bật</h2>
<ul>
<li><strong>Tính năng A</strong> – mô tả ngắn kỹ thuật.</li>
<li><strong>Tính năng B</strong> – mô tả ngắn kỹ thuật.</li>
<li><strong>Tính năng C</strong> – mô tả ngắn kỹ thuật.</li>
</ul>
<h2>Ứng dụng trong công nghiệp</h2>
<ul>
<li>Ngành đóng gói và bao bì.</li>
<li>Ngành nhựa và máy ép phun.</li>
<li>Ngành chế biến thực phẩm và đồ uống.</li>
</ul>
<h2>Mua chính hãng tại Agow Automation</h2>
<p>Agow Automation là nhà phân phối chính thức B&R tại Việt Nam. Kho hàng sẵn có, hỗ trợ kỹ thuật chuyên nghiệp.</p>`;

  if (group === 'A') {
    return `DANH MỤC: ${cat.name}
${parentLine}SỐ SẢN PHẨM: ${cat.count}
MÔ TẢ HIỆN TẠI: [TRỐNG hoặc quá ngắn]
TASK: Viết MỚI hoàn toàn bằng HTML thuần. TUYỆT ĐỐI không dùng markdown (không **, không #).
Bắt buộc có: ít nhất 2 thẻ <h2>, ít nhất 2 <ul><li>. Đề cập "B&R" và "Agow Automation".
${HTML_EXAMPLE}

DESCRIPTION:
SEO_TITLE:
META_DESC:`;
  } else {
    return `DANH MỤC: ${cat.name}
${parentLine}SỐ SẢN PHẨM: ${cat.count}
MÔ TẢ HIỆN TẠI (đã clean):
${descClean}

TASK: Cải thiện bằng HTML thuần. TUYỆT ĐỐI không dùng markdown (không **, không #).
Giữ thông tin kỹ thuật đúng. Sửa "hãng b&r" → "B&R". Thêm "Agow Automation".
Bắt buộc có: ít nhất 2 thẻ <h2>, ít nhất 2 <ul><li>.
${HTML_EXAMPLE}

DESCRIPTION:
SEO_TITLE:
META_DESC:`;
  }
}

// ── Parse AI response ─────────────────────────────────────────────────────────
function parseAIResponse(text) {
  if (!text) return null;

  // Bước 1: Normalize toàn bộ text
  // - Strip code fence wrappers: ```html ... ``` và ``` ... ```
  //   (trước khi normalize labels vì fence có thể wrap cả block)
  let t = text;

  // Tách text thành 3 block theo label — xử lý mọi variant:
  // "DESCRIPTION:", "**DESCRIPTION:**", "## DESCRIPTION:", v.v.
  // Pattern: optional (**|##) + LABEL + optional(**) + : + optional whitespace

  const LABEL_RE = /(?:\*{0,2}#{0,2}\s*)(DESCRIPTION|SEO_TITLE|META_DESC)(?:\*{0,2})\s*:/gi;

  // Tìm vị trí của từng label
  const positions = [];
  let m;
  LABEL_RE.lastIndex = 0;
  while ((m = LABEL_RE.exec(t)) !== null) {
    positions.push({ label: m[1].toUpperCase(), start: m.index, end: m.index + m[0].length });
  }

  if (!positions.length) return null;

  // Extract block giữa 2 label liền kề
  function getBlock(label) {
    const pos = positions.find(p => p.label === label);
    if (!pos) return '';
    const nextPos = positions.find(p => p.start > pos.start);
    let block = nextPos ? t.slice(pos.end, nextPos.start) : t.slice(pos.end);

    // Strip trailing markdown bold remnant từ label trước: **\n hoặc **\r\n ở đầu block
    block = block.replace(/^\s*\*{1,2}\s*\n/, '');
    // Strip code fences ```html ... ```
    block = block.replace(/^\s*```(?:html|text|markdown)?\s*/i, '').replace(/\s*```[\s\S]*$/, '');
    // Strip separator lines --- và chú thích (*(...) hoặc > ...)
    block = block.replace(/^-{3,}$/gm, '').replace(/\n\*\([\s\S]*/m, '').trim();

    return block;
  }

  // Fallback: nếu không tìm thấy DESCRIPTION label,
  // lấy toàn bộ từ đầu đến label SEO_TITLE đầu tiên
  let description = getBlock('DESCRIPTION');
  if (!description || description.length < 100) {
    const firstLabel = positions[0];
    if (firstLabel && firstLabel.label !== 'DESCRIPTION') {
      // Content HTML nằm trước label đầu tiên
      let fallback = t.slice(0, firstLabel.start).trim();
      fallback = fallback.replace(/^\s*```(?:html|text|markdown)?\s*/i, '').replace(/\s*```[\s\S]*$/, '').trim();
      if (fallback.length > 100) description = fallback;
    }
    // Thêm fallback 2: lấy tất cả text từ đầu đến vị trí SEO_TITLE
    if ((!description || description.length < 100) && positions.length > 0) {
      const titlePos = positions.find(p => p.label === 'SEO_TITLE');
      if (titlePos) {
        let raw2 = t.slice(0, titlePos.start).trim();
        raw2 = raw2.replace(/^\s*```(?:html|text|markdown)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
        if (raw2.length > 100) description = raw2;
      }
    }
  }
  // Filter helper: dòng có nội dung thực (bỏ dòng chỉ là **, ---, ```, whitespace)
  const meaningful = l => l.replace(/^[`*\-\s]+|[`*\-\s]+$/g,'').length > 5 && /[a-zA-ZÀ-ỹ0-9]/.test(l);

  // SEO Title: lấy dòng meaningful đầu tiên
  const seoTitleBlock = getBlock('SEO_TITLE');
  let seoTitle = seoTitleBlock.split('\n')
    .filter(meaningful)
    .map(l => l.replace(/^[`*\-\s]+|[`*\-\s]+$/g,'').trim())[0] || '';

  // Meta: tương tự
  const metaDescBlock = getBlock('META_DESC');
  let metaDesc = metaDescBlock.split('\n')
    .filter(l => meaningful(l) && l.trim().length > 20)
    .map(l => l.replace(/^[`*\-\s]+|[`*\-\s]+$/g,'').trim())[0]
    || metaDescBlock.replace(/^[`*\-\s]+|[`*\-\s]+$/g,'').trim();

  return { description, seoTitle, metaDesc };
}

// ── Validate ──────────────────────────────────────────────────────────────────
function validate(result) {
  if (!result) return ['Không parse được response'];
  const issues = [];
  const dText = strip(result.description);
  const wc    = wordCount(result.description);
  const tLen  = result.seoTitle.length;
  const mLen  = result.metaDesc.length;

  // Description
  if (wc < 150)   issues.push(`Desc quá ngắn (${wc} words, cần ≥150)`);
  if (!/<h2/i.test(result.description))  issues.push('Desc thiếu <h2>');
  if (!/<ul/i.test(result.description))  issues.push('Desc thiếu <ul>');
  if (/<h1/i.test(result.description))   issues.push('Desc có <h1> — không được');
  if (/&amp;/i.test(result.description)) issues.push('Desc còn &amp;');
  if (/hãng b&r/i.test(result.description)) issues.push('"hãng b&r" lowercase');
  if (!/Agow Automation/i.test(result.description)) issues.push('Desc thiếu "Agow Automation"');
  if (!/B&R/.test(result.description))   issues.push('Desc thiếu "B&R"');
  if (/Liên hệ ngay|Mua ngay|Báo giá ngay/i.test(result.description)) issues.push('Desc có CTA spam');

  // SEO Title
  if (!result.seoTitle)     issues.push('SEO_TITLE trống');
  else {
    if (tLen < 30)  issues.push(`Title ngắn (${tLen}c)`);
    if (tLen > 62)  issues.push(`Title dài (${tLen}c, cần ≤60c)`);
    if (!/B&R/.test(result.seoTitle)) issues.push('Title thiếu "B&R"');
    if (!result.seoTitle.includes('|')) issues.push('Title thiếu "|"');
  }

  // Meta Desc
  if (!result.metaDesc)    issues.push('META_DESC trống');
  else {
    if (mLen < 120) issues.push(`Meta ngắn (${mLen}c)`);
    if (mLen > 162) issues.push(`Meta dài (${mLen}c, cần ≤155c)`);
    if (!/Agow/i.test(result.metaDesc)) issues.push('Meta thiếu "Agow"');
  }

  return issues;
}

// ── Export CSV ────────────────────────────────────────────────────────────────
function exportCsv(cache, catMap) {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const file = path.join(REPORT_DIR, `ai-rewrite-category-${date}.csv`);
  const esc  = s => '"' + String(s || '').replace(/"/g, '""').replace(/\n/g, ' ') + '"';

  const header = ['ID','Tên DM','Parent','Số SP','Nhóm','Desc cũ (100c)','Desc mới (200c)','Words',
                  'Title cũ','Title mới','Chars title','Meta cũ','Meta mới','Chars meta','Issues','Status'].join(',');
  const rows = Object.entries(cache)
    .filter(([, v]) => v.group !== 'SKIP')
    .sort(([, a], [, b]) => (b.spCount || 0) - (a.spCount || 0))
    .map(([id, v]) => {
      if (!v.result) return [id, v.wcName, v.parentName||'', v.spCount||0, v.group,
        esc(v.oldDescClean?.slice(0,100)), '(not generated)', 0,
        esc(v.oldSeoTitle), '', 0, esc(v.oldMetaDesc), '', 0, '', 'SKIP'].join(',');
      const wc = wordCount(v.result.description);
      return [
        id, esc(v.wcName), esc(v.parentName||'(root)'), v.spCount||0, v.group,
        esc(v.oldDescClean?.slice(0,100)), esc(strip(v.result.description).slice(0,200)), wc,
        esc(v.oldSeoTitle), esc(v.result.seoTitle), v.result.seoTitle.length,
        esc(v.oldMetaDesc), esc(v.result.metaDesc), v.result.metaDesc.length,
        esc((v.issues||[]).join('; ')), v.issues?.length ? 'REVIEW' : 'OK',
      ].join(',');
    });

  fs.writeFileSync(file, '\uFEFF' + [header, ...rows].join('\n'), 'utf8');
  return file;
}

// ── DRY-RUN ───────────────────────────────────────────────────────────────────
async function dryRun() {
  console.log('=== AI REWRITE: WooCommerce Product Categories ===');
  if (RESUME) console.log('   Resume mode: bỏ qua DM đã có trong cache');
  if (FORCE)  console.log('   Force mode: re-generate ngay cả khi đã có cache');
  console.log('');

  const cache = loadCache();

  // Fetch tất cả categories
  const all = await fetchAll('/wp-json/wc/v3/products/categories',
    'id,name,slug,count,description,parent', true);

  // Build parent name map
  const catMap = {};
  for (const c of all) catMap[c.id] = c.name;

  // Filter & sort
  let targets = all
    .filter(c => c.count > 0 && !SKIP_IDS.includes(c.id))
    .sort((a, b) => b.count - a.count);

  if (ONLY_ID) targets = all.filter(c => c.id === ONLY_ID);
  if (RESUME)  targets = targets.filter(c => !(cache[String(c.id)]?.result) || FORCE);
  if (FORCE && ONLY_ID) {
    // Reset cache entry để re-generate
    if (cache[String(ONLY_ID)]) { delete cache[String(ONLY_ID)]; saveCache(cache); }
  }
  if (LIMIT) targets = targets.slice(0, LIMIT);

  console.log(`Target: ${targets.length} danh mục\n`);

  let done = 0, skipped = 0, errors = 0;

  for (const cat of targets) {
    const id  = String(cat.id);
    const parentName = cat.parent ? catMap[cat.parent] : null;
    const group      = classifyGroup(cat);
    const oldDescClean = cleanDesc(cat.description);

    // Lấy rank_math meta cũ qua WP REST API
    let oldSeoTitle = '', oldMetaDesc = '';
    try {
      const r = await request('GET', `${BASE}/wp-json/wp/v2/product_cat/${cat.id}`);
      if (r.ok) {
        oldSeoTitle = r.body?.meta?.rank_math_title || '';
        oldMetaDesc = r.body?.meta?.rank_math_description || '';
      }
    } catch {}

    if (RESUME && cache[id]?.result && !FORCE) { skipped++; continue; }

    console.log(`[${cat.id}] ${cat.name} (${cat.count} SP, Nhóm ${group})...`);

    try {
      const prompt = buildPrompt(cat, group, parentName);
      // Retry 3x với backoff cho 503/524
      let raw = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          raw = await chatComplete(
            [{ role: 'user', content: prompt }],
            { system: SYSTEM_PROMPT, maxTokens: 2500 }
          );
          break;
        } catch (retryErr) {
          if (attempt < 3 && /503|524|timeout/i.test(retryErr.message)) {
            console.log(`   Retry ${attempt}/3 sau 10s... (${retryErr.message})`);
            await new Promise(r => setTimeout(r, 10000));
          } else throw retryErr;
        }
      }

      const result = parseAIResponse(raw);
      const issues = validate(result);
      const status = issues.length ? '🟡 REVIEW' : '✅';

      cache[id] = {
        id: cat.id, slug: cat.slug, wcName: cat.name,
        parentId: cat.parent || 0, parentName: parentName || null,
        spCount: cat.count, group,
        oldDescClean,
        oldSeoTitle, oldMetaDesc,
        result,
        issues,
        rawResponse: raw,
        generatedAt: new Date().toISOString(),
        applied: false, appliedAt: null,
      };
      saveCache(cache);

      console.log(`${status} [${cat.id}] ${cat.name}`);
      if (result) {
        const wc = wordCount(result.description);
        console.log(`   TITLE  (${result.seoTitle.length}c): ${result.seoTitle}`);
        console.log(`   META   (${result.metaDesc.length}c): ${result.metaDesc.slice(0,100)}...`);
        console.log(`   DESC   (${wc} words): ${strip(result.description).slice(0,120)}...`);
      }
      if (issues.length) console.log(`   Issues: ${issues.join('; ')}`);
      console.log('');
      done++;
    } catch (e) {
      console.log(`❌ [${cat.id}] Error: ${e.message}`);
      errors++;
    }

    await new Promise(r => setTimeout(r, 1500));
  }

  const csvFile = exportCsv(cache, catMap);
  const needReview = Object.values(cache).filter(v => v.issues?.length).length;
  const allReady   = Object.values(cache).filter(v => v.result && !v.issues?.length).length;

  console.log('═'.repeat(60));
  console.log('Dry-run complete:');
  console.log(`  ✅ Done:    ${done}`);
  console.log(`  ⏭️  Skipped: ${skipped}`);
  console.log(`  ❌ Errors:  ${errors}`);
  console.log(`  📋 CSV:     ${csvFile}`);
  console.log('');
  console.log(`  🟢 Sẵn sàng apply: ${allReady}`);
  console.log(`  🟡 Cần review:     ${needReview}`);
  console.log('');
  console.log('→ Review CSV, sau đó chạy: node ai-rewrite-category.js --apply');
}

// ── APPLY ─────────────────────────────────────────────────────────────────────
async function applyFromCache() {
  const cache = loadCache();
  let targets = Object.entries(cache).filter(([, v]) => v.result && !v.applied);
  if (ONLY_ID) targets = targets.filter(([id]) => +id === ONLY_ID);

  if (!targets.length) { console.log('Không có DM nào cần apply.'); return; }
  console.log(`=== APPLY: ${targets.length} danh mục → WooCommerce ===\n`);

  let ok = 0, err = 0;

  for (const [id, v] of targets) {
    try {
      // 1. Update description qua WC API
      const wcRes = await wcRequest('PUT', `/wp-json/wc/v3/products/categories/${id}`, {
        description: v.result.description,
      });

      // 2. Update RankMath meta qua WP REST API
      const wpRes = await request('POST', `${BASE}/wp-json/wp/v2/product_cat/${id}`, {
        meta: {
          rank_math_title:       v.result.seoTitle,
          rank_math_description: v.result.metaDesc,
        },
      });

      if (wcRes.ok && wpRes.ok) {
        cache[id].applied   = true;
        cache[id].appliedAt = new Date().toISOString();
        saveCache(cache);
        console.log(`✅ [${id}] ${v.wcName}`);
        console.log(`   title: ${v.result.seoTitle}`);
        ok++;
      } else {
        const hint = !wcRes.ok ? ` WC:${wcRes.status}` : ` WP:${wpRes.status}`;
        console.log(`❌ [${id}] ${v.wcName}${hint}`);
        err++;
      }
    } catch (e) {
      console.log(`❌ [${id}] Error: ${e.message}`);
      err++;
    }
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\n${'═'.repeat(40)}`);
  console.log(`✅ Applied: ${ok} | ❌ Errors: ${err}`);
  if (ok > 0) console.log('\n→ Nhớ purge cache: node khoa.js purge-cache');
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  if (APPLY_MODE) await applyFromCache();
  else await dryRun();
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
