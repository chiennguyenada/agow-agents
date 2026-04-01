/**
 * fix-title.js
 * Phát hiện và sửa SEO title bị LONG_TITLE (>60 chars) hoặc SHORT_TITLE (<30 chars)
 * trên posts, pages và WC products.
 *
 * Cách dùng:
 *   node fix-title.js              # dry-run: liệt kê tất cả issues
 *   node fix-title.js --apply      # apply: chỉ sửa LONG_TITLE (auto-truncate)
 *   node fix-title.js --apply --id=123  # chỉ sửa 1 item
 *
 * SHORT_TITLE: chỉ hiển thị trong report, KHÔNG sửa tự động.
 *   → Cần AI hoặc human review để mở rộng title cho đủ ý nghĩa.
 *
 * LONG_TITLE: sửa tự động bằng smart-truncate:
 *   - Ưu tiên giữ suffix brand " | Agow" hoặc " - Agow" (từ WP_BRAND_SUFFIX)
 *   - Cắt từ cuối cùng vừa đủ, không cắt giữa từ
 *   - Thêm "..." nếu cần (nhưng cố gắng tránh)
 *
 * RankMath meta: đọc/ghi qua meta.rank_math_title
 *   → Yêu cầu PHP snippet register_post_meta() đang hoạt động
 *   → Nếu meta null: fallback sang title.rendered (post title)
 *
 * Required env: WP_BASE_URL, WP_USERNAME, WP_APP_PASSWORD
 * Optional env: WC_CONSUMER_KEY, WC_CONSUMER_SECRET
 *               WP_BRAND_SUFFIX  (default: "| Agow Automation")
 *               TITLE_MIN        (default: 30)
 *               TITLE_MAX        (default: 60)
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { config, wpGet, wpPut, wcRequest, fetchAll } = require('./wp-client');

const DRY_RUN    = !process.argv.includes('--apply');
const ONLY_ID    = (() => { const m = process.argv.join(' ').match(/--id=(\d+)/); return m ? parseInt(m[1]) : null; })();
const BACKUP_DIR = path.join(__dirname, '..', 'backups');

const BRAND_SUFFIX = process.env.WP_BRAND_SUFFIX || '| Agow Automation';
const TITLE_MIN    = parseInt(process.env.TITLE_MIN || '30');
const TITLE_MAX    = parseInt(process.env.TITLE_MAX || '60');

if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

// ── Title health checks ────────────────────────────────────────────────────────
function checkTitle(title) {
  if (!title || title.trim() === '') return { issue: 'MISSING_TITLE', len: 0 };
  const len = title.trim().length;
  if (len < TITLE_MIN) return { issue: 'SHORT_TITLE', len };
  if (len > TITLE_MAX) return { issue: 'LONG_TITLE', len };
  return { issue: null, len };
}

// ── Smart truncate: cắt tại ranh giới từ, ưu tiên giữ brand suffix ────────────
function smartTruncate(title) {
  if (title.length <= TITLE_MAX) return title;

  // Chuẩn hóa: bỏ khoảng trắng thừa
  title = title.replace(/\s+/g, ' ').trim();

  // Tìm brand suffix (không phân biệt hoa/thường)
  const brandRe = new RegExp(
    '\\s*[|\\-–—]\\s*' + BRAND_SUFFIX.replace(/[|\\-–—]/g, '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$',
    'i'
  );
  const brandMatch = title.match(brandRe);
  const suffix = brandMatch ? brandMatch[0] : '';
  const core   = suffix ? title.slice(0, title.length - suffix.length).trim() : title;

  const maxCore = TITLE_MAX - suffix.length;
  if (maxCore <= 10) {
    // Suffix quá dài — cắt không có suffix
    const words = title.split(' ');
    let result = '';
    for (const w of words) {
      if ((result + (result ? ' ' : '') + w).length > TITLE_MAX - 3) break;
      result += (result ? ' ' : '') + w;
    }
    return result.trim() + '...';
  }

  // Cắt core tại ranh giới từ
  if (core.length <= maxCore) return core + suffix;

  const coreWords = core.split(' ');
  let truncated = '';
  for (const w of coreWords) {
    const next = truncated + (truncated ? ' ' : '') + w;
    if (next.length > maxCore) break;
    truncated = next;
  }

  // Bỏ dấu câu thừa cuối cùng (dấu phẩy, gạch ngang...)
  truncated = truncated.replace(/[\s,\-–|]+$/, '').trim();

  return truncated + suffix;
}

// ── Resolve SEO title cho 1 item ───────────────────────────────────────────────
// Ưu tiên: rank_math_title > title.rendered > name (WC)
function resolveTitle(item, itemType) {
  if (itemType === 'WC_PRODUCT') {
    return item.meta_data?.find(m => m.key === 'rank_math_title')?.value
      || item.name
      || '';
  }
  return item.meta?.rank_math_title
    || item.title?.rendered
    || '';
}

// ── Xử lý 1 item ──────────────────────────────────────────────────────────────
async function processItem(item, itemType) {
  const currentTitle = resolveTitle(item, itemType);
  const { issue, len }  = checkTitle(currentTitle);
  if (!issue) return { ok: true };

  const id    = item.id;
  const name  = (itemType === 'WC_PRODUCT' ? item.name : item.title?.rendered) || `ID:${id}`;
  const url   = item.link || item.permalink || '';

  if (issue === 'SHORT_TITLE') {
    // SHORT_TITLE: chỉ report, không sửa tự động
    console.log(`⚠️  SHORT_TITLE [${itemType} ${id}] (${len} chars) "${name}"`);
    console.log(`     → Cần thêm keyword/context cho đủ ${TITLE_MIN}+ chars. URL: ${url}`);
    return { issue, id, itemType, currentTitle, autoFixable: false };
  }

  // LONG_TITLE: sửa tự động
  const newTitle = smartTruncate(currentTitle);
  const newCheck = checkTitle(newTitle);

  if (DRY_RUN) {
    console.log(`🔧 LONG_TITLE [${itemType} ${id}] (${len}→${newTitle.length} chars)`);
    console.log(`     Trước: "${currentTitle}"`);
    console.log(`     Sau:   "${newTitle}"`);
    if (newCheck.issue) {
      console.log(`     ⚠️  Sau khi cắt vẫn còn ${newCheck.issue} (${newCheck.len} chars) — cần manual fix`);
    }
    return { issue, id, itemType, currentTitle, newTitle, autoFixable: !newCheck.issue, dry: true };
  }

  // ── Backup ────────────────────────────────────────────────────────────────
  const backup = {
    itemType, id, url, issue, len,
    currentTitle, newTitle,
    timestamp: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(BACKUP_DIR, `title-backup-${itemType.toLowerCase()}-${id}-${Date.now()}.json`),
    JSON.stringify(backup, null, 2)
  );

  // ── Write ─────────────────────────────────────────────────────────────────
  let res;
  if (itemType === 'WC_PRODUCT') {
    // WC: ghi vào meta_data array
    const existingMeta = (item.meta_data || []).filter(m => m.key !== 'rank_math_title');
    res = await wcRequest('PUT', `/wp-json/wc/v3/products/${id}`, {
      meta_data: [...existingMeta, { key: 'rank_math_title', value: newTitle }],
    });
  } else {
    const endpoint = itemType === 'WP_POST' ? 'posts' : 'pages';
    res = await wpPut(`/wp-json/wp/v2/${endpoint}/${id}`, {
      meta: { rank_math_title: newTitle },
    });
  }

  if (res && res.ok) {
    console.log(`✅ [${itemType} ${id}] "${name}"`);
    console.log(`   "${currentTitle}" (${len})`);
    console.log(`→  "${newTitle}" (${newTitle.length})`);
    return { issue, id, itemType, currentTitle, newTitle, fixed: true };
  } else {
    console.log(`❌ [${itemType} ${id}] "${name}" — API error (status: ${res?.status})`);
    if (res?.status === 403 || res?.body?.code === 'rest_cannot_edit_meta') {
      console.log(`   💡 Lỗi meta write — kiểm tra PHP snippet register_post_meta() đã active chưa`);
    }
    return { issue, id, itemType, currentTitle, error: true };
  }
}

// ── MAIN ───────────────────────────────────────────────────────────────────────
async function main() {
  console.log(DRY_RUN
    ? '=== DRY-RUN: Scan title issues (--apply để sửa LONG_TITLE) ==='
    : '=== APPLY: Fixing LONG_TITLE (backup trước khi sửa) ===');
  if (ONLY_ID) console.log(`   Chỉ xử lý item ID: ${ONLY_ID}`);
  console.log(`   Range: SHORT=${TITLE_MIN}-${TITLE_MAX - 1} chars GOOD, LONG>${TITLE_MAX} chars\n`);

  const results = { LONG_TITLE: [], SHORT_TITLE: [], fixed: 0, errors: 0 };

  // ── 1. WP Posts ─────────────────────────────────────────────────────────────
  process.stderr.write('Fetching posts...\n');
  const posts = await fetchAll('/wp-json/wp/v2/posts', 'id,title,link,meta');
  const filteredPosts = ONLY_ID ? posts.filter(p => p.id === ONLY_ID) : posts;
  for (const post of filteredPosts) {
    const r = await processItem(post, 'WP_POST');
    if (r.issue === 'LONG_TITLE') results.LONG_TITLE.push(r);
    if (r.issue === 'SHORT_TITLE') results.SHORT_TITLE.push(r);
    if (r.fixed) results.fixed++;
    if (r.error) results.errors++;
  }

  // ── 2. WP Pages ─────────────────────────────────────────────────────────────
  process.stderr.write('Fetching pages...\n');
  const pages = await fetchAll('/wp-json/wp/v2/pages', 'id,title,link,meta');
  const filteredPages = ONLY_ID ? pages.filter(p => p.id === ONLY_ID) : pages;
  for (const page of filteredPages) {
    const r = await processItem(page, 'WP_PAGE');
    if (r.issue === 'LONG_TITLE') results.LONG_TITLE.push(r);
    if (r.issue === 'SHORT_TITLE') results.SHORT_TITLE.push(r);
    if (r.fixed) results.fixed++;
    if (r.error) results.errors++;
  }

  // ── 3. WC Products ───────────────────────────────────────────────────────────
  process.stderr.write('Fetching WC products...\n');
  const products = await fetchAll('/wp-json/wc/v3/products', 'id,name,permalink,meta_data', true);
  const filteredProds = ONLY_ID ? products.filter(p => p.id === ONLY_ID) : products;
  for (const prod of filteredProds) {
    const r = await processItem(prod, 'WC_PRODUCT');
    if (r.issue === 'LONG_TITLE') results.LONG_TITLE.push(r);
    if (r.issue === 'SHORT_TITLE') results.SHORT_TITLE.push(r);
    if (r.fixed) results.fixed++;
    if (r.error) results.errors++;
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  const totalIssues = results.LONG_TITLE.length + results.SHORT_TITLE.length;
  console.log('\n' + '═'.repeat(60));

  if (DRY_RUN) {
    console.log(`📋 Dry-run complete:`);
    console.log(`   LONG_TITLE (auto-fixable):  ${results.LONG_TITLE.filter(r => r.autoFixable !== false).length} items`);
    console.log(`   LONG_TITLE (needs review):  ${results.LONG_TITLE.filter(r => r.autoFixable === false).length} items`);
    console.log(`   SHORT_TITLE (manual only):  ${results.SHORT_TITLE.length} items`);
    if (totalIssues > 0) {
      console.log(`\n→ Chạy với --apply để sửa LONG_TITLE tự động`);
      console.log(`→ SHORT_TITLE cần AI/human review để thêm keywords`);
    } else {
      console.log('\n✅ Không có title issues!');
    }
  } else {
    console.log(`✅ Đã sửa: ${results.fixed} items`);
    if (results.errors > 0) console.log(`❌ Lỗi: ${results.errors} items (kiểm tra PHP snippet)`);
    if (results.SHORT_TITLE.length > 0) {
      console.log(`⚠️  SHORT_TITLE (${results.SHORT_TITLE.length} items) — cần sửa thủ công hoặc dùng AI`);
    }
    if (results.fixed > 0) {
      console.log('\n⚠️  Nhớ purge LiteSpeed cache: node khoa.js purge-cache');
    }
  }
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
