/**
 * fix-short-desc.js  v1  (2026-04-02)
 * Phát hiện và sửa short_description kém chất lượng trên WooCommerce products.
 *
 * 3 loại noise cần xử lý:
 *   FOOTER  — "Mã sản phẩm: X Thương hiệu: B&R Automation Xuất xứ: Áo"
 *   SALES   — "Hàng chính hãng, báo giá nhanh, Hóa đơn đầy đủ, Giao hàng nhanh"
 *   GENERIC — "lý tưởng cho / tối ưu cho / phù hợp cho [X]"
 *
 * Logic:
 *   1. Strip noise khỏi short_desc hiện tại
 *   2. Nếu sau strip ≥ 100c → chỉ save clean version
 *   3. Nếu sau strip 60–99c → THIN → extend bằng specs từ long_desc
 *   4. Nếu sau strip < 60c  → SHORT → rebuild từ long_desc theo category-aware logic
 *
 * Cách dùng:
 *   node fix-short-desc.js                  # dry-run tất cả
 *   node fix-short-desc.js --apply          # apply tất cả
 *   node fix-short-desc.js --id=5277        # test 1 product (dry-run)
 *   node fix-short-desc.js --id=5277 --apply# apply 1 product
 *
 * Target: 80–160 chars, không CTA, không noise, kết thúc bằng câu hoàn chỉnh.
 *
 * Baseline (23 good products):
 *   "X20SI4100 thuộc module đầu vào số an toàn X20, 4 đầu vào số an toàn,
 *    bộ lọc đầu vào có thể cấu hình, 4 đầu ra xung, 24 VDC."
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { config, wcRequest, fetchAll } = require('./wp-client');

const DRY_RUN  = !process.argv.includes('--apply');
const ONLY_ID  = (() => { const m = process.argv.join(' ').match(/--id=(\d+)/); return m ? parseInt(m[1]) : null; })();

const SHORT_MIN  = 80;   // < 80c sau strip → cần rebuild từ long_desc
const SHORT_THIN = 100;  // 80–99c → extend
const SHORT_MAX  = 160;  // cắt tại đây

const BACKUP_DIR = path.join(__dirname, '..', 'backups');
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

// ─────────────────────────────────────────────────────────────────────────────
// STRIP FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

function stripHtml(h) {
  if (!h) return '';
  return h
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#\d+;/g, ' ').replace(/&\w+;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

// Strip footer noise: "Mã sản phẩm: ... Thương hiệu: ... Xuất xứ: ..."
// Bắt đầu từ "Mã sản phẩm" đến hết string (thường là 3 dòng cuối)
function stripFooterNoise(text) {
  return text
    .replace(/\s*Mã\s+sản\s+phẩm\s*:\s*[\w.\-]+[\s\S]*$/i, '')
    .replace(/\s*Mã\s+số\s+sản\s+phẩm\s*:\s*[\w.\-]+[\s\S]*$/i, '')
    .trim();
}

// Strip sales noise: sentences/clauses chứa thương mại
// Dùng \s* thay vì [,.]? để catch cả trường hợp không có dấu chấm trước
function stripSalesNoise(text) {
  return text
    // "Hàng chính hãng[...]." hoặc "Hàng thật chính hãng[...]."
    .replace(/[\s,]*[Hh]àng\s+(thật\s+)?chính\s+hãng[^.!?]*[.!?]?/g, ' ')
    // "báo giá nhanh / Báo giá sớm / báo giá và tư vấn"
    .replace(/[\s,]*[Bb]áo\s+giá[^.!?]*[.!?]?/g, ' ')
    // "Giao hàng[...]."
    .replace(/[\s,]*[Gg]iao\s+hàng[^.!?]*[.!?]?/g, ' ')
    // "Hóa đơn[...]. / Đầy đủ hóa đơn[...]."
    .replace(/[\s,]*([Đđ]ầy\s+đủ\s+)?[Hh]óa\s+đơn[^.!?]*[.!?]?/g, ' ')
    // "Chứng từ[...]."
    .replace(/[\s,]*[Cc]hứng\s+từ[^.!?]*[.!?]?/g, ' ')
    // "Giá cả tốt / Giá cả cạnh tranh / Giá tốt"
    .replace(/[\s,]*[Gg]iá\s+(cả\s+)?(tốt|cạnh\s+tranh|hợp\s+lí|hợp\s+lý|phù\s+hợp)[^.!?]*[.!?]?/g, ' ')
    // "bảo hành 1 năm / bảo hành trong 12 tháng / Chính hãng 100%, bảo hành"
    .replace(/[\s,]*[Bb]ảo\s+hành[^.!?]*[.!?]?/g, ' ')
    // "Chính hãng 100%"
    .replace(/[\s,]*[Cc]hính\s+hãng\s+100%[^.!?]*[.!?]?/g, ' ')
    // "Liên hệ[...]."
    .replace(/[\s,]*[Ll]iên\s+hệ[^.!?]*[.!?]?/g, ' ')
    // "Tư vấn[...]."
    .replace(/[\s,]*[Tt]ư\s+vấn[^.!?]*[.!?]?/g, ' ')
    // "Uy tín, chính hãng"
    .replace(/[\s,]*[Uu]y\s+tín[^.!?]*[.!?]?/g, ' ')
    // "Xem ngay / Mua ngay"
    .replace(/[\s,]*[Mm]ua\s+ngay[^.!?]*[.!?]?/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

// Strip generic close phrases: "lý tưởng cho X" / "tối ưu cho X" / "phù hợp cho X"
function stripGenericClose(text) {
  return text
    .replace(/[,.]?\s*(lý\s+tưởng|tối\s+ưu|phù\s+hợp|giải\s+pháp\s+tối\s+ưu)\s+(cho|trong|với)[^.]*\.?/gi, '')
    .replace(/[,.]?\s*[Gg]iải\s+pháp\s+tối\s+ưu[^.]*\.?/gi, '')
    .replace(/\s+/g, ' ').trim();
}

// Làm sạch toàn bộ short_desc: strip html + 3 loại noise
function cleanShortDesc(rawHtml) {
  let t = stripHtml(rawHtml);
  t = stripFooterNoise(t);
  t = stripSalesNoise(t);
  t = stripGenericClose(t);
  // Xóa trailing comma/semicolon/ellipsis
  t = t.replace(/[,;…]+\s*$/, '').trim();
  // Đảm bảo kết thúc bằng dấu chấm nếu còn nội dung
  if (t && !/[.!?]$/.test(t)) t += '.';
  return t;
}

// Strip manual refs và noise headings trong long_desc
function cleanLongDesc(rawHtml) {
  let t = stripHtml(rawHtml);
  // "(manual, trang N)" / "(manual, trang N-M)" / "(manual, trang N, M, ...)" / edge cases
  t = t.replace(/\s*\(manual,\s*trang\s*[^)]{1,60}\)/gi, '');
  t = t.replace(/\s*\(user\s*manual[^)]*\)/gi, '');
  // Metadata block ở đầu: "Mã sản phẩm: ... Thương hiệu: ... Xuất xứ: ..."
  t = t.replace(/Mã\s+(số\s+)?sản\s+phẩm\s*:\s*[\w.\-]+\s*/gi, '');
  t = t.replace(/Thương\s+hiệu\s*:\s*[^\n.]+[.\n]?\s*/gi, '');
  t = t.replace(/Xuất\s+xứ\s*:\s*[^\n.]+[.\n]?\s*/gi, '');
  // Heading labels standalone
  t = t.replace(/^(Đặc\s+tính\s+nổi\s+(trội|bật)|Đặc\s+điểm\s+(ưu\s+việt|nổi\s+bật)|Thông\s+số\s+kỹ\s+thuật)\s*:?\s*/gim, '');
  t = t.replace(/^Đặc\s+tính\s+và\s+thông\s+số\s+(kỹ\s+thuật\s+)?[^\n]*\n/gim, '');
  return t.replace(/\s+/g, ' ').trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORY DETECTION
// ─────────────────────────────────────────────────────────────────────────────

function detectCategoryType(categories) {
  const names = categories.map(c => (c.name || '').toLowerCase()).join(' ');
  if (/safety|an toàn/.test(names))             return 'safety';
  if (/acopos|motion\s*control|servo/.test(names)) return 'servo';
  if (/hmi|panel|power\s*panel/.test(names))    return 'hmi';
  if (/plc|bộ điều khiển/.test(names))          return 'plc';
  if (/i\/o|i-o|input|output/.test(names))      return 'io';
  if (/x20\s*system|x67\s*system/.test(names))  return 'io';
  return 'default';
}

// Must-have spec patterns theo category
// Script tìm các câu trong long_desc chứa những pattern này để extend short_desc
const MUST_HAVE = {
  safety:  [
    /PL\s+e\s*\/\s*SIL\s*3/i,
    /\d+\s*SafeNODE/i,
    /SafeLOGIC[\-X]*/i,
    /openSAFETY/i,
    /SafeMOTION/i,
    /\d+\s*trục.*an\s*toàn/i,
  ],
  servo: [
    /\d+[\.,]?\d*\s*kW/i,
    /B[&&amp;]R\s+200[023]/i,
    /Automation\s+Studio/i,
    /POWERLINK/i,
    /\d+\s*A\s+(peak|đỉnh|liên\s*tục)/i,
  ],
  hmi: [
    /\d+\s*[xX]\s*\d+\s*(pixel|px)/i,
    /QVGA|SVGA|VGA|WVGA|XGA/i,
    /IP\s*\d+/i,
    /\d+[\.,]\d*["'`]\s*(inch|in\b)/i,
    /128\s*MB|256\s*MB|512\s*MB/i,
  ],
  plc: [
    /\d+\s*MHz|\d+[\.,]\d*\s*GHz/i,
    /Ethernet\s+\d+\/\d+\/\d+BASE/i,
    /CompactFlash/i,
    /SDRAM|DRAM|SRAM/i,
    /POWERLINK\s+V\d/i,
  ],
  io: [
    /\d+\s*(kênh|đầu vào|đầu ra|ngõ vào|ngõ ra)/i,
    /24\s*VDC/i,
    /M12\s*\d+-pin/i,
    /IP\s*\d+/i,
    /\d+[\.,]\d*\s*°C/i,
  ],
  default: [
    /\d+\s*MHz|\d+[\.,]\d*\s*GHz/i,
    /\d+\s*VDC/i,
    /\d+[\.,]?\d*\s*kW/i,
    /\d+\s*MB\s+(SDRAM|DRAM|RAM)/i,
    /IP\s*\d+/i,
  ],
};

// Tách văn bản thành mảng câu
function splitSentences(text) {
  return text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length > 15);
}

// Lấy các câu từ long_desc có chứa must-have spec chưa có trong existing desc
function extractSpecSentences(existing, cleanLong, catType) {
  const patterns = MUST_HAVE[catType] || MUST_HAVE.default;
  const existLower = existing.toLowerCase();
  const sentences = splitSentences(cleanLong);

  const newSentences = [];
  for (const pat of patterns) {
    // Chỉ thêm nếu pattern chưa có trong existing
    if (pat.test(existLower)) continue;
    // Tìm câu trong long_desc chứa pattern này
    const match = sentences.find(s => pat.test(s) && !existLower.includes(s.toLowerCase().slice(0, 20)));
    if (match) newSentences.push(match);
    if (newSentences.length >= 2) break; // tối đa 2 câu mới
  }
  return newSentences.join(' ');
}

// Smart trim: cắt tại dấu chấm gần nhất, fallback tại ranh giới từ
function smartTrim(text, maxLen) {
  if (text.length <= maxLen) return text;
  let cut = text.lastIndexOf('.', maxLen);
  if (cut > maxLen * 0.6) return text.slice(0, cut + 1).trim();
  cut = text.lastIndexOf(' ', maxLen);
  return text.slice(0, cut).trim() + '…';
}

// ─────────────────────────────────────────────────────────────────────────────
// CORE: build new short_desc for 1 product
// ─────────────────────────────────────────────────────────────────────────────

function buildShortDesc(product) {
  const origRaw   = product.short_description || '';
  const longRaw   = product.description || '';
  const catType   = detectCategoryType(product.categories || []);

  const cleaned   = cleanShortDesc(origRaw);    // strip noise
  const cleanLong = cleanLongDesc(longRaw);

  // ── Phân loại sau khi strip ──────────────────────────────────────────────
  let issue, proposed, needsManual = false;

  if (cleaned.length >= SHORT_THIN) {
    // ≥ 100c: Đủ tốt sau strip — chỉ save clean version
    issue    = 'CLEAN_ONLY';
    proposed = smartTrim(cleaned, SHORT_MAX);

  } else if (cleaned.length >= SHORT_MIN) {
    // 80–99c: THIN — extend bằng spec từ long_desc
    issue = 'THIN';
    const extra = extractSpecSentences(cleaned, cleanLong, catType);
    if (extra) {
      proposed = smartTrim(cleaned.replace(/\.$/, '') + '. ' + extra, SHORT_MAX);
    } else {
      // Không tìm được spec mới → giữ clean version, flag review
      proposed   = cleaned;
      needsManual = true;
    }

  } else {
    // < 80c: SHORT — rebuild từ long_desc
    issue = 'SHORT';
    if (cleanLong.length > 100) {
      // Lấy 2-3 câu đầu của long_desc có giá trị nhất
      const sentences = splitSentences(cleanLong);
      // Câu đầu thường là intro chứa model + category context
      let base = sentences.slice(0, 2).join(' ');
      // Thêm must-have spec nếu chưa có
      const extra = extractSpecSentences(base, cleanLong, catType);
      if (extra) base = base.replace(/\.$/, '') + '. ' + extra;
      proposed = smartTrim(base, SHORT_MAX);
    } else {
      // Không có long_desc đủ → giữ cleaned + flag
      proposed   = cleaned || stripHtml(origRaw).slice(0, SHORT_MAX);
      needsManual = true;
    }
  }

  // ── Safety checks ─────────────────────────────────────────────────────────
  // 1. Không bao giờ ngắn hơn cleaned version — TRỪ khi smartTrim đã cắt hợp lệ
  //    (CLEAN_ONLY: proposed là smartTrim(cleaned) → OK nếu ngắn hơn vì đã bỏ noise)
  if (issue !== 'CLEAN_ONLY' && proposed.length < cleaned.length && cleaned.length > 0) {
    proposed    = cleaned;
    needsManual = true;
  }
  // 2. Không có noise còn sót
  const hasNoise = /Mã\s+sản\s+phẩm|Hàng\s+chính\s+hãng|Hóa\s+đơn|báo\s+giá|Giao\s+hàng/i.test(proposed);
  if (hasNoise) {
    proposed    = cleanShortDesc(proposed); // strip lại lần nữa
    needsManual = true;
  }
  // 3. Kết thúc bằng câu hoàn chỉnh
  if (proposed && !/[.!?]$/.test(proposed)) proposed += '.';
  // 4. Không thay đổi gì so với RAW HTML gốc? Bỏ qua
  //    So sánh proposed với stripped HTML gốc (không clean) để phát hiện có noise
  const origStripped = stripHtml(origRaw);
  const unchanged = proposed.trim() === origStripped.trim();

  return { issue, origLen: stripHtml(origRaw).length, cleanedLen: cleaned.length, proposed, needsManual, unchanged, catType };
}

// ─────────────────────────────────────────────────────────────────────────────
// PROCESS ONE PRODUCT
// ─────────────────────────────────────────────────────────────────────────────

async function processProduct(product) {
  const id   = product.id;
  const name = stripHtml(product.name || '');
  const url  = product.permalink || '';

  const { issue, origLen, cleanedLen, proposed, needsManual, unchanged, catType } = buildShortDesc(product);

  // Không thay đổi → bỏ qua hoàn toàn (kể cả dry-run)
  if (unchanged && issue === 'CLEAN_ONLY') return { ok: true, skipped: true };

  const issueIcon = { CLEAN_ONLY: '✅', THIN: '🟡', SHORT: '🔴' }[issue] || '⬜';

  if (DRY_RUN) {
    console.log(`${issueIcon} ${issue} [${id}] (${catType}) orig:${origLen}c → clean:${cleanedLen}c → proposed:${proposed.length}c`);
    console.log(`   Tên: "${name.slice(0, 60)}"`);
    console.log(`   URL: ${url}`);
    console.log(`   → "${proposed.slice(0, 120)}${proposed.length > 120 ? '…' : ''}"`);
    if (needsManual) console.log(`   ✏️  Cần review — script không đủ long_desc spec`);
    console.log('');
    return { issue, id, name, proposed, needsManual };
  }

  // ── Backup ─────────────────────────────────────────────────────────────────
  const origShort = stripHtml(product.short_description || '');
  const backup = { id, name, url, issue, origLen, cleanedLen, origShort, proposed, timestamp: new Date().toISOString() };
  fs.writeFileSync(
    path.join(BACKUP_DIR, `short-desc-backup-${id}-${Date.now()}.json`),
    JSON.stringify(backup, null, 2)
  );

  // ── Write via WC REST API ───────────────────────────────────────────────────
  const res = await wcRequest('PUT', `/wp-json/wc/v3/products/${id}`, {
    short_description: proposed,
  });

  if (res && res.ok) {
    console.log(`✅ [${id}] "${name.slice(0, 55)}" (${cleanedLen}→${proposed.length}c)`);
    if (needsManual) console.log(`   ✏️  Cần review`);
    return { issue, id, fixed: true, needsReview: needsManual };
  } else {
    const hint = res?.status === 403 ? ' — kiểm tra WC API credentials' : ` status=${res?.status}`;
    console.log(`❌ [${id}] "${name.slice(0, 55)}"${hint}`);
    return { issue, id, error: true };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log(DRY_RUN
    ? '=== DRY-RUN: Scan short_description issues (--apply để ghi) ==='
    : '=== APPLY: Fixing short_descriptions ===');
  if (ONLY_ID) console.log(`   Chỉ xử lý ID: ${ONLY_ID}`);
  console.log(`   Target: ${SHORT_MIN}–${SHORT_MAX} chars, no noise, no CTA\n`);

  process.stderr.write('Fetching WC products...\n');
  const products = await fetchAll(
    '/wp-json/wc/v3/products',
    'id,name,permalink,short_description,description,categories',
    true
  );

  const filtered = ONLY_ID ? products.filter(p => p.id === ONLY_ID) : products;
  if (!filtered.length) {
    console.log('Không tìm thấy sản phẩm.');
    return;
  }

  const stats = { CLEAN_ONLY: 0, THIN: 0, SHORT: 0, skipped: 0, fixed: 0, errors: 0, needsReview: 0 };

  for (const p of filtered) {
    const r = await processProduct(p);
    if (r.skipped)    { stats.skipped++; continue; }
    if (r.issue)      stats[r.issue] = (stats[r.issue] || 0) + 1;
    if (r.fixed)      stats.fixed++;
    if (r.error)      stats.errors++;
    if (r.needsReview) stats.needsReview++;
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log('═'.repeat(60));
  const totalIssues = (stats.CLEAN_ONLY || 0) + (stats.THIN || 0) + (stats.SHORT || 0);

  if (DRY_RUN) {
    console.log(`📋 Dry-run complete (${filtered.length} products scanned):`);
    console.log(`   ✅ CLEAN_ONLY: ${stats.CLEAN_ONLY || 0} — có noise, đủ tốt sau strip`);
    console.log(`   🟡 THIN:       ${stats.THIN || 0}       — 80–99c sau strip, cần extend`);
    console.log(`   🔴 SHORT:      ${stats.SHORT || 0}      — <80c sau strip, cần rebuild`);
    console.log(`   ⏭  Skipped:    ${stats.skipped}         — không thay đổi gì`);
    console.log(`   ✏️  Cần review: ${stats.needsReview || 0}`);
    if (totalIssues > 0) {
      console.log(`\n→ Xem đề xuất ở trên, rồi chạy --apply`);
      console.log(`→ Test 1 product: node fix-short-desc.js --id=<ID> --apply`);
    } else {
      console.log('\n✅ Tất cả short_descriptions đã sạch!');
    }
  } else {
    console.log(`✅ Đã fix: ${stats.fixed} products`);
    if (stats.errors)     console.log(`❌ Lỗi: ${stats.errors}`);
    if (stats.needsReview) console.log(`✏️  Cần review: ${stats.needsReview}`);
    if (stats.fixed > 0) {
      console.log('\n→ Nhớ purge cache: node khoa.js purge-cache');
      console.log('→ Verify: node khoa.js check-short-desc');
    }
  }
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
