/**
 * fix-meta-desc.js
 * Phát hiện và sửa meta description bị NO_META_DESC (rỗng) hoặc
 * THIN_META_DESC (<120 chars) theo Semantic SEO principles.
 *
 * Cách dùng:
 *   node fix-meta-desc.js              # dry-run: liệt kê tất cả issues + đề xuất
 *   node fix-meta-desc.js --apply      # apply: ghi meta description vào WP/WC
 *   node fix-meta-desc.js --id=123     # chỉ xử lý 1 item
 *   node fix-meta-desc.js --type=post  # chỉ xử lý posts (post|page|product)
 *
 * Semantic SEO meta description formula (2026-04-01):
 *   THIN_META_DESC → EXTEND bản gốc (thêm spec kỹ thuật còn thiếu, KHÔNG replace)
 *   NO_META_DESC   → BUILD từ short_description (2 câu đầu chứa spec kỹ thuật)
 *   KHÔNG append CTA chung ("Liên hệ Agow...") cho products — boilerplate signal
 *   CTA chỉ dùng cho page/service descriptions (intent phù hợp)
 *   Target: 140–155 chars. Safety: không bao giờ đề xuất ngắn hơn bản gốc.
 *
 * Target length: 140–155 chars (Google hiển thị ~155 desktop, ~120 mobile)
 * THIN_META_DESC: < 140 chars
 * LONG_META_DESC: > 160 chars (bị cắt giữa chừng)
 * Optional env: WC_CONSUMER_KEY, WC_CONSUMER_SECRET
 *               META_DESC_MIN (default: 120)
 *               META_DESC_MAX (default: 160)
 *               SITE_BRAND    (default: "Agow Automation")
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { config, wpGet, wpPut, wcRequest, fetchAll } = require('./wp-client');

const DRY_RUN  = !process.argv.includes('--apply');
const ONLY_ID  = (() => { const m = process.argv.join(' ').match(/--id=(\d+)/); return m ? parseInt(m[1]) : null; })();
const ONLY_TYPE = (() => { const m = process.argv.join(' ').match(/--type=(\w+)/); return m ? m[1] : null; })();

const DESC_MIN    = parseInt(process.env.META_DESC_MIN || '140');
const DESC_MAX    = parseInt(process.env.META_DESC_MAX || '160');
const SITE_BRAND  = process.env.SITE_BRAND || 'Agow Automation';
const BACKUP_DIR  = path.join(__dirname, '..', 'backups');

if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

// ── Strip HTML tags và decode entities ────────────────────────────────────────
function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#\d+;/g, ' ').replace(/&\w+;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

// ── Cắt tại ranh giới từ, ưu tiên kết thúc ở dấu chấm ───────────────────────
function smartTrim(text, maxLen) {
  if (text.length <= maxLen) return text;
  // Tìm dấu chấm gần nhất trước maxLen
  let cut = text.lastIndexOf('.', maxLen);
  if (cut > maxLen * 0.6) return text.slice(0, cut + 1).trim();
  // Không có dấu chấm tốt → cắt tại ranh giới từ
  cut = text.lastIndexOf(' ', maxLen);
  return text.slice(0, cut).trim() + '…';
}

// ── Check meta description ────────────────────────────────────────────────────
function checkDesc(desc) {
  if (!desc || desc.trim() === '') return { issue: 'NO_META_DESC', len: 0 };
  const len = desc.trim().length;
  if (len < DESC_MIN) return { issue: 'THIN_META_DESC', len };
  if (len > DESC_MAX) return { issue: 'LONG_META_DESC', len };
  return { issue: null, len };
}

// ── Semantic description generation ──────────────────────────────────────────
// Nguyên tắc Semantic SEO (2026-04-01):
//   1. THIN_META_DESC → EXTEND nội dung hiện tại, KHÔNG generate lại từ đầu
//   2. NO_META_DESC   → build từ short_description, ưu tiên thông số kỹ thuật cụ thể
//   3. KHÔNG append CTA chung ("Liên hệ Agow...") — tạo boilerplate cross-page
//   4. Dùng ~40 chars còn lại để thêm SPEC kỹ thuật unique cho từng sản phẩm
//   5. CTA chỉ dùng cho service/page, không dùng cho product detail

// Lấy các câu từ short_description chưa có trong existing desc
function extractNewSpecs(existingDesc, shortDesc) {
  if (!shortDesc) return '';
  const existing = existingDesc.toLowerCase();
  const sentences = shortDesc.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 15);
  // Tìm câu chứa thông tin chưa có trong existing desc
  const newInfo = sentences.filter(s => {
    // Lấy các từ quan trọng (số, đơn vị, model codes) trong câu này
    const keywords = s.match(/\b(\d+[\w\/]*|MHz|VDC|kHz|GB|MB|mm|kW|Nm|IP\d+|SIL\d|Cat\.\d|M\d+|RS\d+|USB|Ethernet|POWERLINK|PROFIBUS|Modbus|EtherNet\/IP|CANopen|X2X|SafeNODE|SafeLOGIC|PLCopen|I\/O|I\/Os)\b/gi) || [];
    // Nếu câu có keyword kỹ thuật và keyword đó chưa có trong existing → đây là info mới
    return keywords.some(k => !existing.includes(k.toLowerCase()));
  });
  return newInfo.slice(0, 2).join('. '); // tối đa 2 câu mới
}

// Nhận dạng dòng sản phẩm B&R
function detectProductLine(name, cats) {
  const n = name.toUpperCase();
  const c = cats.map(c => c.toUpperCase()).join(' ');
  if (/\bX67\b/.test(n)) return 'X67 System';
  if (/\bX20S/.test(n)) return 'X20 Safety';
  if (/\bX20\b/.test(n)) return 'X20 System';
  if (/\b2003\b/.test(n) || /\b2003\b/.test(c)) return '2003 System';
  if (/\b2005\b/.test(n) || /\b2005\b/.test(c)) return '2005 System';
  if (/APC\d{3}|5PC\d{3}|Automation PC/i.test(n)) return 'Automation PC';
  if (/4PP\d{3}|Power Panel/i.test(n)) return 'Power Panel';
  if (/ACOPOS|8V\d{4}/i.test(n)) return 'ACOPOS';
  return '';
}

// THIN_META_DESC: mở rộng bản gốc bằng specs còn thiếu
function extendProductDesc(currentDesc, product) {
  const rawShort = stripHtml(product.short_description || '');
  const newSpecs = extractNewSpecs(currentDesc, rawShort);
  if (!newSpecs) {
    // Không tìm được spec mới → flag needsReview, trả về bản gốc để không làm xấu hơn
    return { desc: currentDesc, needsManual: true };
  }
  // Ghép: bản gốc (không CTA) + spec mới
  const base = currentDesc.replace(/\.\s*(Liên hệ|Xem thêm|Contact|Mua ngay)[^.]*\.\s*$/, '').trim();
  let extended = base + '. ' + newSpecs;
  if (extended.length > DESC_MAX) extended = smartTrim(extended, DESC_MAX);
  return { desc: extended, needsManual: false };
}

// NO_META_DESC: build từ đầu từ short_description
function buildProductDesc(product) {
  const name    = stripHtml(product.name || '').trim();
  const cats    = (product.categories || []).map(c => c.name).filter(Boolean);
  const rawShort = stripHtml(product.short_description || '');
  const line    = detectProductLine(name, cats);

  // Ưu tiên: dùng câu đầu + câu thứ 2 của short_description (chứa spec kỹ thuật nhất)
  const sentences = rawShort.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 15);

  let desc = '';
  if (sentences.length >= 2) {
    // Có đủ content → lấy 2 câu đầu chứa specs
    desc = sentences.slice(0, 2).join('. ');
    if (line && !desc.toUpperCase().includes(line.replace(' System','').replace(' Safety',''))) {
      desc += `. Thuộc dòng ${line} B&R`;
    }
  } else if (sentences.length === 1) {
    desc = sentences[0];
    if (line) desc += `. Thuộc dòng ${line} B&R Automation`;
  } else {
    // Không có short_description → dùng name + category, flag review
    const catStr = cats.filter(c => !/hãng b&r|b&r automation/i.test(c)).slice(0, 2).join(', ');
    desc = `${name}${catStr ? ' – ' + catStr : ''}${line ? '. Dòng ' + line + ' B&R' : ''}`;
    return { desc: smartTrim(desc, DESC_MAX), needsManual: true };
  }

  desc = smartTrim(desc, DESC_MAX);
  return { desc, needsManual: checkDesc(desc).issue !== null };
}

function generatePostDesc(post) {
  const title   = stripHtml(post.title?.rendered || '');
  const excerpt = stripHtml(post.excerpt?.rendered || '');
  if (excerpt.length >= DESC_MIN) return { desc: smartTrim(excerpt, DESC_MAX), needsManual: false };
  // Ghép excerpt + title context, không CTA brand
  const desc = excerpt
    ? smartTrim(excerpt + '. Xem chi tiết bài viết tại Agow Automation.', DESC_MAX)
    : smartTrim(`${title} – tìm hiểu kinh nghiệm thực tế từ đội ngũ kỹ thuật Agow Automation về thiết bị B&R.`, DESC_MAX);
  return { desc, needsManual: checkDesc(desc).issue !== null };
}

function generatePageDesc(page) {
  const title   = stripHtml(page.title?.rendered || '');
  const excerpt = stripHtml(page.excerpt?.rendered || '');
  if (excerpt.length >= DESC_MIN) return { desc: smartTrim(excerpt, DESC_MAX), needsManual: false };
  // Service/info pages: CTA phù hợp intent (người dùng đang tìm thông tin/dịch vụ)
  const desc = smartTrim(
    `${title} tại Agow Automation – nhà phân phối chính thức thiết bị B&R Automation tại Việt Nam. Hỗ trợ kỹ thuật, báo giá nhanh.`,
    DESC_MAX
  );
  return { desc, needsManual: checkDesc(desc).issue !== null };
}

// ── Xử lý 1 item ──────────────────────────────────────────────────────────────
async function processItem(item, itemType) {
  const id = item.id;

  // Lấy current meta desc
  let currentDesc = '';
  if (itemType === 'WC_PRODUCT') {
    currentDesc = (item.meta_data?.find(m => m.key === 'rank_math_description')?.value || '').trim();
  } else {
    currentDesc = (item.meta?.rank_math_description || '').trim();
  }

  const { issue, len } = checkDesc(currentDesc);
  if (!issue) return { ok: true };

  const name = itemType === 'WC_PRODUCT' ? item.name : (item.title?.rendered || `ID:${id}`);
  const url  = item.link || item.permalink || '';

  // ── Generate semantic description theo đúng loại issue ──────────────────────
  let newDesc = '';
  let needsManual = false;

  if (issue === 'THIN_META_DESC' && itemType === 'WC_PRODUCT') {
    // THIN: mở rộng bản gốc, KHÔNG replace
    const r = extendProductDesc(currentDesc, item);
    newDesc = r.desc; needsManual = r.needsManual;
  } else if (issue === 'NO_META_DESC' && itemType === 'WC_PRODUCT') {
    // NO: build từ đầu từ short_description
    const r = buildProductDesc(item);
    newDesc = r.desc; needsManual = r.needsManual;
  } else if (itemType === 'WP_POST') {
    const r = generatePostDesc(item);
    newDesc = r.desc; needsManual = r.needsManual;
  } else {
    const r = generatePageDesc(item);
    newDesc = r.desc; needsManual = r.needsManual;
  }

  // Safety: không bao giờ đề xuất desc ngắn hơn bản gốc
  if (newDesc.length < currentDesc.length && currentDesc.length > 0) {
    needsManual = true;
    newDesc = currentDesc; // giữ nguyên bản gốc, flag để Khoa viết tay
  }

  if (DRY_RUN) {
    const issueIcon = issue === 'NO_META_DESC' ? '🔴' : '🟡';
    const actionLabel = (issue === 'THIN_META_DESC') ? 'Mở rộng' : 'Build mới';
    console.log(`${issueIcon} ${issue} [${itemType} ${id}] (hiện tại: ${len} chars)`);
    console.log(`   Tên: "${stripHtml(name).slice(0, 60)}"`);
    console.log(`   URL: ${url}`);
    if (issue === 'THIN_META_DESC' && currentDesc) {
      console.log(`   Hiện tại: "${currentDesc}"`);
    }
    console.log(`   → ${actionLabel} (${newDesc.length} chars): "${newDesc}"`);
    if (needsManual) console.log(`   ✏️  Cần Khoa viết tay — script không tìm được spec mới từ short_description`);
    console.log('');
    return { issue, id, itemType, currentDesc, newDesc, url, name: stripHtml(name), needsReview: needsManual };
  }

  // ── Backup ───────────────────────────────────────────────────────────────────
  const backup = { itemType, id, url, issue, len, currentDesc, newDesc, timestamp: new Date().toISOString() };
  fs.writeFileSync(
    path.join(BACKUP_DIR, `meta-desc-backup-${itemType.toLowerCase()}-${id}-${Date.now()}.json`),
    JSON.stringify(backup, null, 2)
  );

  // ── Write ────────────────────────────────────────────────────────────────────
  let res;
  if (itemType === 'WC_PRODUCT') {
    const existingMeta = (item.meta_data || []).filter(m => m.key !== 'rank_math_description');
    res = await wcRequest('PUT', `/wp-json/wc/v3/products/${id}`, {
      meta_data: [...existingMeta, { key: 'rank_math_description', value: newDesc }],
    });
  } else {
    const endpoint = itemType === 'WP_POST' ? 'posts' : 'pages';
    res = await wpPut(`/wp-json/wp/v2/${endpoint}/${id}`, {
      meta: { rank_math_description: newDesc },
    });
  }

  if (res && res.ok) {
    console.log(`✅ [${itemType} ${id}] "${stripHtml(name).slice(0, 50)}"`);
    console.log(`   ${issue} (${len}) → (${newDesc.length}) "${newDesc}"`);
    if (needsManual) console.log(`   ✏️  Cần review (script giữ nguyên bản gốc)`);
    return { issue, id, itemType, fixed: true, needsReview: needsManual };
  } else {
    const errBody = res?.body;
    const hint = (res?.status === 403 || errBody?.code === 'rest_cannot_edit_meta')
      ? ' — kiểm tra PHP snippet register_post_meta() đã active chưa'
      : ` status=${res?.status}`;
    console.log(`❌ [${itemType} ${id}] "${stripHtml(name).slice(0, 50)}"${hint}`);
    return { issue, id, itemType, error: true };
  }
}

// ── MAIN ───────────────────────────────────────────────────────────────────────
async function main() {
  console.log(DRY_RUN
    ? `=== DRY-RUN: Scan meta description issues (--apply để ghi) ===`
    : `=== APPLY: Writing semantic meta descriptions ===`);
  if (ONLY_ID) console.log(`   Chỉ xử lý ID: ${ONLY_ID}`);
  if (ONLY_TYPE) console.log(`   Chỉ xử lý type: ${ONLY_TYPE}`);
  console.log(`   Target: ${DESC_MIN}–${DESC_MAX} chars (Google: ~155 desktop, ~120 mobile)\n`);

  const results = { NO_META_DESC: 0, THIN_META_DESC: 0, LONG_META_DESC: 0, fixed: 0, errors: 0, needsReview: 0 };
  const items = [];

  // ── WP Posts ──────────────────────────────────────────────────────────────────
  if (!ONLY_TYPE || ONLY_TYPE === 'post') {
    process.stderr.write('Fetching posts...\n');
    const posts = await fetchAll('/wp-json/wp/v2/posts', 'id,title,link,excerpt,meta');
    const filtered = ONLY_ID ? posts.filter(p => p.id === ONLY_ID) : posts;
    for (const p of filtered) {
      const r = await processItem(p, 'WP_POST');
      if (r.issue) { results[r.issue] = (results[r.issue] || 0) + 1; items.push(r); }
      if (r.fixed) results.fixed++;
      if (r.error) results.errors++;
      if (r.needsReview) results.needsReview++;
    }
  }

  // ── WP Pages ──────────────────────────────────────────────────────────────────
  if (!ONLY_TYPE || ONLY_TYPE === 'page') {
    process.stderr.write('Fetching pages...\n');
    const pages = await fetchAll('/wp-json/wp/v2/pages', 'id,title,link,excerpt,meta');
    const filtered = ONLY_ID ? pages.filter(p => p.id === ONLY_ID) : pages;
    for (const p of filtered) {
      const r = await processItem(p, 'WP_PAGE');
      if (r.issue) { results[r.issue] = (results[r.issue] || 0) + 1; items.push(r); }
      if (r.fixed) results.fixed++;
      if (r.error) results.errors++;
      if (r.needsReview) results.needsReview++;
    }
  }

  // ── WC Products ───────────────────────────────────────────────────────────────
  if (!ONLY_TYPE || ONLY_TYPE === 'product') {
    process.stderr.write('Fetching WC products...\n');
    const products = await fetchAll(
      '/wp-json/wc/v3/products',
      'id,name,permalink,short_description,categories,meta_data',
      true
    );
    const filtered = ONLY_ID ? products.filter(p => p.id === ONLY_ID) : products;
    for (const p of filtered) {
      const r = await processItem(p, 'WC_PRODUCT');
      if (r.issue) { results[r.issue] = (results[r.issue] || 0) + 1; items.push(r); }
      if (r.fixed) results.fixed++;
      if (r.error) results.errors++;
      if (r.needsReview) results.needsReview++;
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────────
  const totalIssues = (results.NO_META_DESC || 0) + (results.THIN_META_DESC || 0) + (results.LONG_META_DESC || 0);
  console.log('═'.repeat(60));

  if (DRY_RUN) {
    console.log(`📋 Dry-run complete:`);
    console.log(`   🔴 NO_META_DESC:   ${results.NO_META_DESC || 0} items (không có meta desc)`);
    console.log(`   🟡 THIN_META_DESC: ${results.THIN_META_DESC || 0} items (< ${DESC_MIN} chars)`);
    if (results.LONG_META_DESC) console.log(`   🟠 LONG_META_DESC: ${results.LONG_META_DESC} items (> ${DESC_MAX} chars)`);
    console.log(`   ⚠️  Cần review:    ${results.needsReview} items (đề xuất chưa tối ưu)`);
    if (totalIssues > 0) {
      console.log(`\n→ Xem đề xuất ở trên, chỉnh sửa nếu cần, rồi chạy --apply`);
      console.log(`→ Với batch lớn (>10 items): đề xuất cho admin duyệt trước (Tier 2)`);
    } else {
      console.log('\n✅ Không có meta description issues!');
    }
  } else {
    console.log(`✅ Đã fix: ${results.fixed} items`);
    if (results.errors > 0) console.log(`❌ Lỗi: ${results.errors} items`);
    if (results.needsReview > 0) console.log(`⚠️  ${results.needsReview} items cần Khoa review thêm`);
    if (results.fixed > 0) {
      console.log('\n→ Nhớ purge cache: node khoa.js purge-cache');
      console.log('→ Verify: node khoa.js check-meta');
    }
  }
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
