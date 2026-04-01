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
 * Semantic SEO meta description formula:
 *   Products: [Chức năng] [Mã SP] [Thông số kỹ thuật]. [Dòng SP]. [CTA]
 *   Posts:    [Tóm tắt giá trị bài viết]. [Điểm nổi bật]. [CTA]
 *   Pages:    [Mô tả trang]. [Lợi ích]. [CTA]
 *
 * Target length: 120–160 chars
 * Required env: WP_BASE_URL, WP_USERNAME, WP_APP_PASSWORD
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

const DESC_MIN    = parseInt(process.env.META_DESC_MIN || '120');
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
// Không gọi AI — dùng template từ dữ liệu sản phẩm thực.
// Đủ chính xác cho 80% cases, còn lại Khoa (agent) sẽ review.

function generateProductDesc(product) {
  const name    = (product.name || '').trim();
  const cats    = (product.categories || []).map(c => c.name).filter(Boolean);
  const rawDesc = stripHtml(product.short_description || '');

  // Xác định dòng sản phẩm từ tên module hoặc category
  let productLine = '';
  if (/\bX67\b/i.test(name)) productLine = 'dòng X67';
  else if (/\bX20\b/i.test(name)) productLine = 'dòng X20 System';
  else if (/\b2003\b/.test(name) || cats.some(c => /2003/i.test(c))) productLine = 'dòng 2003 System';
  else if (/\b2005\b/.test(name) || cats.some(c => /2005/i.test(c))) productLine = 'dòng 2005 System';
  else if (/Automation PC|APC/i.test(name)) productLine = 'dòng Automation PC';
  else if (/Power Panel|4PP/i.test(name)) productLine = 'dòng Power Panel';

  // Lấy câu đầu tiên của short_description (giá trị nhất)
  const firstSentence = rawDesc ? rawDesc.split(/[.!?]/)[0].trim() : '';

  // Tạo description
  let parts = [];

  if (firstSentence && firstSentence.length > 20) {
    parts.push(firstSentence);
    if (productLine && !firstSentence.includes(productLine.replace('dòng ', ''))) {
      parts.push(`Thuộc ${productLine} B&R`);
    }
  } else {
    // Fallback: dùng tên sản phẩm + category
    const catStr = cats.slice(0, 2).join(', ');
    parts.push(`${name}${catStr ? ` – ${catStr}` : ''} của B&R Automation`);
    if (productLine) parts.push(`Thuộc ${productLine}`);
  }

  const cta = `Liên hệ ${SITE_BRAND} để được báo giá.`;
  let desc = parts.join('. ') + '. ' + cta;

  // Trim về MAX nếu quá dài (ưu tiên giữ CTA)
  if (desc.length > DESC_MAX) {
    // Cắt phần nội dung, giữ CTA
    const maxContent = DESC_MAX - cta.length - 2;
    const contentPart = smartTrim(parts.join('. '), maxContent);
    desc = contentPart + '. ' + cta;
  }

  return desc;
}

function generatePostDesc(post) {
  const title   = stripHtml(post.title?.rendered || '');
  const excerpt = stripHtml(post.excerpt?.rendered || '');
  const rawDesc = excerpt || '';

  if (rawDesc.length >= DESC_MIN) {
    return smartTrim(rawDesc, DESC_MAX);
  }

  // Excerpt quá ngắn → dùng title + excerpt
  const desc = rawDesc
    ? `${rawDesc} Tìm hiểu thêm tại ${SITE_BRAND}.`
    : `${title}. Đọc chi tiết tại blog ${SITE_BRAND}.`;

  return smartTrim(desc, DESC_MAX);
}

function generatePageDesc(page) {
  const title   = stripHtml(page.title?.rendered || '');
  const excerpt = stripHtml(page.excerpt?.rendered || '');

  if (excerpt.length >= DESC_MIN) return smartTrim(excerpt, DESC_MAX);

  // System pages: title + brand
  return smartTrim(`${title} – ${SITE_BRAND}. Thông tin chi tiết về dịch vụ và sản phẩm B&R Automation tại Việt Nam.`, DESC_MAX);
}

// ── Xử lý 1 item ──────────────────────────────────────────────────────────────
async function processItem(item, itemType) {
  const id = item.id;

  // Lấy current meta desc
  let currentDesc = '';
  if (itemType === 'WC_PRODUCT') {
    currentDesc = item.meta_data?.find(m => m.key === 'rank_math_description')?.value || '';
  } else {
    currentDesc = item.meta?.rank_math_description || '';
  }

  const { issue, len } = checkDesc(currentDesc);
  if (!issue) return { ok: true };

  const name = itemType === 'WC_PRODUCT' ? item.name : (item.title?.rendered || `ID:${id}`);
  const url  = item.link || item.permalink || '';

  // Generate semantic description
  let newDesc = '';
  if (itemType === 'WC_PRODUCT') newDesc = generateProductDesc(item);
  else if (itemType === 'WP_POST') newDesc = generatePostDesc(item);
  else newDesc = generatePageDesc(item);

  // Validate generated desc
  const newCheck = checkDesc(newDesc);
  const needsReview = newCheck.issue !== null; // nếu generate ra vẫn sai thì flag

  if (DRY_RUN) {
    const issueIcon = issue === 'NO_META_DESC' ? '🔴' : '🟡';
    console.log(`${issueIcon} ${issue} [${itemType} ${id}] (hiện tại: ${len} chars)`);
    console.log(`   Tên: "${stripHtml(name).slice(0, 60)}"`);
    console.log(`   URL: ${url}`);
    console.log(`   → Đề xuất (${newDesc.length} chars): "${newDesc}"`);
    if (needsReview) console.log(`   ⚠️  Đề xuất chưa đạt ${DESC_MIN}-${DESC_MAX} chars — cần Khoa review`);
    console.log('');
    return { issue, id, itemType, currentDesc, newDesc, url, name: stripHtml(name), needsReview };
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
    console.log(`   ${issue} (${len}) → "${newDesc}" (${newDesc.length})`);
    if (needsReview) console.log(`   ⚠️  Nên review lại (${newDesc.length} chars)`);
    return { issue, id, itemType, fixed: true, needsReview };
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
  console.log(`   Target: ${DESC_MIN}–${DESC_MAX} chars | Brand CTA: "${SITE_BRAND}"\n`);

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
