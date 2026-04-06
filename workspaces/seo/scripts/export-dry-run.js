/**
 * export-dry-run.js  (2026-04-02)
 * Export kết quả dry-run của fix-short-desc và fix-long-desc ra 2 file CSV.
 *
 * Output:
 *   ../reports/dry-run-short-desc-YYYYMMDD.csv
 *   ../reports/dry-run-long-desc-YYYYMMDD.csv
 *
 * CSV short-desc columns:
 *   ID, Name, URL, Category, Issue_Type, Orig_Len, Cleaned_Len, Proposed_Len,
 *   Needs_Review, Current_Short_Desc, Proposed_Short_Desc
 *
 * CSV long-desc columns:
 *   ID, Name, URL, Orig_Len_Plain, Clean_Len_Plain, Chars_Removed,
 *   Manual_Refs_Count, Has_Metadata_Block, Sample_Noise, Status
 *
 * Cách dùng:
 *   node export-dry-run.js              # export cả 2 CSVs
 *   node export-dry-run.js --short      # chỉ export short-desc
 *   node export-dry-run.js --long       # chỉ export long-desc
 *   node export-dry-run.js --id=5277    # 1 product cụ thể
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { fetchAll } = require('./wp-client');

const ONLY_SHORT = process.argv.includes('--short');
const ONLY_LONG  = process.argv.includes('--long');
const ONLY_ID    = (() => { const m = process.argv.join(' ').match(/--id=(\d+)/); return m ? parseInt(m[1]) : null; })();

const REPORTS_DIR = path.join(__dirname, '..', 'reports');
if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

const DATE_STR = new Date().toISOString().slice(0, 10).replace(/-/g, '');

// ─────────────────────────────────────────────────────────────────────────────
// SHARED UTILITIES
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

// CSV cell: escape double quotes, wrap in quotes
function csvCell(val) {
  const s = String(val == null ? '' : val);
  // Escape internal double-quotes by doubling them
  return '"' + s.replace(/"/g, '""') + '"';
}

function csvRow(cells) {
  return cells.map(csvCell).join(',');
}

// ─────────────────────────────────────────────────────────────────────────────
// SHORT-DESC LOGIC (copy từ fix-short-desc.js — không import để tránh side effects)
// ─────────────────────────────────────────────────────────────────────────────

const SHORT_MIN  = 80;
const SHORT_THIN = 100;
const SHORT_MAX  = 160;

function stripFooterNoise(text) {
  return text
    .replace(/\s*Mã\s+sản\s+phẩm\s*:\s*[\w.\-]+[\s\S]*$/i, '')
    .replace(/\s*Mã\s+số\s+sản\s+phẩm\s*:\s*[\w.\-]+[\s\S]*$/i, '')
    .trim();
}

function stripSalesNoise(text) {
  return text
    .replace(/[\s,]*[Hh]àng\s+(thật\s+)?chính\s+hãng[^.!?]*[.!?]?/g, ' ')
    .replace(/[\s,]*[Bb]áo\s+giá[^.!?]*[.!?]?/g, ' ')
    .replace(/[\s,]*[Gg]iao\s+hàng[^.!?]*[.!?]?/g, ' ')
    .replace(/[\s,]*([Đđ]ầy\s+đủ\s+)?[Hh]óa\s+đơn[^.!?]*[.!?]?/g, ' ')
    .replace(/[\s,]*[Cc]hứng\s+từ[^.!?]*[.!?]?/g, ' ')
    .replace(/[\s,]*[Gg]iá\s+(cả\s+)?(tốt|cạnh\s+tranh|hợp\s+lí|hợp\s+lý|phù\s+hợp)[^.!?]*[.!?]?/g, ' ')
    .replace(/[\s,]*[Bb]ảo\s+hành[^.!?]*[.!?]?/g, ' ')
    .replace(/[\s,]*[Cc]hính\s+hãng\s+100%[^.!?]*[.!?]?/g, ' ')
    .replace(/[\s,]*[Ll]iên\s+hệ[^.!?]*[.!?]?/g, ' ')
    .replace(/[\s,]*[Tt]ư\s+vấn[^.!?]*[.!?]?/g, ' ')
    .replace(/[\s,]*[Uu]y\s+tín[^.!?]*[.!?]?/g, ' ')
    .replace(/[\s,]*[Mm]ua\s+ngay[^.!?]*[.!?]?/g, ' ')
    .replace(/[\s,]*[Xx]em\s+ngay[^.!?]*[.!?]?/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function stripGenericClose(text) {
  return text
    .replace(/[,.]?\s*(lý\s+tưởng|tối\s+ưu|phù\s+hợp|giải\s+pháp\s+tối\s+ưu)\s+(cho|trong|với)[^.]*\.?/gi, '')
    .replace(/[,.]?\s*[Gg]iải\s+pháp\s+tối\s+ưu[^.]*\.?/gi, '')
    .replace(/\s+/g, ' ').trim();
}

function cleanShortDesc(rawHtml) {
  let t = stripHtml(rawHtml);
  t = stripFooterNoise(t);
  t = stripSalesNoise(t);
  t = stripGenericClose(t);
  t = t.replace(/[,;…]+\s*$/, '').trim();
  if (t && !/[.!?]$/.test(t)) t += '.';
  return t;
}

function cleanLongDescText(rawHtml) {
  if (!rawHtml) return '';
  let t = stripHtml(rawHtml);
  t = t.replace(/\(manual,\s*trang\s*[^)]{1,60}\)/gi, '');
  t = t.replace(/\(manual,\s*p\.?\s*[^)]{1,30}\)/gi, '');
  t = t.replace(/\(user\s*manual[^)]{0,40}\)/gi, '');
  t = t.replace(/Mã\s+(số\s+)?sản\s+phẩm\s*:\s*[\w.\-]+\s*/gi, '');
  t = t.replace(/Thương\s+hiệu\s*:\s*[^\n.]+[.\n]?\s*/gi, '');
  t = t.replace(/Xuất\s+xứ\s*:\s*[^\n.]+[.\n]?\s*/gi, '');
  return t.replace(/\s+/g, ' ').trim();
}

function detectCategoryType(categories) {
  const names = categories.map(c => (c.name || '').toLowerCase()).join(' ');
  if (/safety|an toàn/.test(names))              return 'safety';
  if (/acopos|motion\s*control|servo/.test(names)) return 'servo';
  if (/hmi|panel|power\s*panel/.test(names))     return 'hmi';
  if (/plc|bộ điều khiển/.test(names))           return 'plc';
  if (/i\/o|i-o|input|output/.test(names))       return 'io';
  if (/x20\s*system|x67\s*system/.test(names))   return 'io';
  return 'default';
}

const MUST_HAVE = {
  safety:  [/PL\s+e\s*\/\s*SIL\s*3/i,/\d+\s*SafeNODE/i,/SafeLOGIC[\-X]*/i,/openSAFETY/i,/SafeMOTION/i],
  servo:   [/\d+[\.,]?\d*\s*kW/i,/POWERLINK/i,/\d+\s*A\s+(peak|đỉnh)/i],
  hmi:     [/\d+\s*[xX]\s*\d+\s*(pixel|px)/i,/IP\s*\d+/i,/\d+[\.,]\d*["'`]\s*(inch|in\b)/i],
  plc:     [/\d+\s*MHz|\d+[\.,]\d*\s*GHz/i,/CompactFlash/i,/POWERLINK\s+V\d/i],
  io:      [/\d+\s*(kênh|đầu vào|đầu ra)/i,/24\s*VDC/i,/\d+[\.,]\d*\s*°C/i],
  default: [/\d+\s*MHz|\d+[\.,]\d*\s*GHz/i,/\d+\s*VDC/i,/\d+[\.,]?\d*\s*kW/i,/IP\s*\d+/i],
};

function splitSentences(text) {
  return text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length > 15);
}

function extractSpecSentences(existing, cleanLong, catType) {
  const patterns = MUST_HAVE[catType] || MUST_HAVE.default;
  const existLower = existing.toLowerCase();
  const sentences = splitSentences(cleanLong);
  const newSentences = [];
  for (const pat of patterns) {
    if (pat.test(existLower)) continue;
    const match = sentences.find(s => pat.test(s) && !existLower.includes(s.toLowerCase().slice(0, 20)));
    if (match) newSentences.push(match);
    if (newSentences.length >= 2) break;
  }
  return newSentences.join(' ');
}

function smartTrim(text, maxLen) {
  if (text.length <= maxLen) return text;
  let cut = text.lastIndexOf('.', maxLen);
  if (cut > maxLen * 0.6) return text.slice(0, cut + 1).trim();
  cut = text.lastIndexOf(' ', maxLen);
  return text.slice(0, cut).trim() + '…';
}

function buildShortDescResult(product) {
  const origRaw  = product.short_description || '';
  const longRaw  = product.description || '';
  const catType  = detectCategoryType(product.categories || []);
  const origStripped = stripHtml(origRaw);
  const cleaned  = cleanShortDesc(origRaw);
  const cleanLong = cleanLongDescText(longRaw);

  let issue, proposed, needsManual = false;

  if (cleaned.length >= SHORT_THIN) {
    issue    = 'CLEAN_ONLY';
    proposed = smartTrim(cleaned, SHORT_MAX);
  } else if (cleaned.length >= SHORT_MIN) {
    issue = 'THIN';
    const extra = extractSpecSentences(cleaned, cleanLong, catType);
    if (extra) {
      proposed = smartTrim(cleaned.replace(/\.$/, '') + '. ' + extra, SHORT_MAX);
    } else {
      proposed    = cleaned;
      needsManual = true;
    }
  } else {
    issue = 'SHORT';
    if (cleanLong.length > 100) {
      const sentences = splitSentences(cleanLong);
      let base = sentences.slice(0, 2).join(' ');
      const extra = extractSpecSentences(base, cleanLong, catType);
      if (extra) base = base.replace(/\.$/, '') + '. ' + extra;
      proposed = smartTrim(base, SHORT_MAX);
    } else {
      proposed    = cleaned || origStripped.slice(0, SHORT_MAX);
      needsManual = true;
    }
  }

  // Safety
  if (issue !== 'CLEAN_ONLY' && proposed.length < cleaned.length && cleaned.length > 0) {
    proposed    = cleaned;
    needsManual = true;
  }
  const hasNoise = /Mã\s+sản\s+phẩm|Hàng\s+chính\s+hãng|Hóa\s+đơn|báo\s+giá|Giao\s+hàng/i.test(proposed);
  if (hasNoise) { proposed = cleanShortDesc(proposed); needsManual = true; }
  if (proposed && !/[.!?]$/.test(proposed)) proposed += '.';

  const unchanged = proposed.trim() === origStripped.trim();
  return { issue, origLen: origStripped.length, cleanedLen: cleaned.length, proposed, needsManual, unchanged, catType };
}

// ─────────────────────────────────────────────────────────────────────────────
// LONG-DESC LOGIC (copy từ fix-long-desc.js)
// ─────────────────────────────────────────────────────────────────────────────

function cleanLongDescHtml(rawHtml) {
  if (!rawHtml) return rawHtml;
  let h = rawHtml;
  h = h.replace(/\s*\(manual,\s*trang\s*[^)]{1,60}\)/gi, '');
  h = h.replace(/\s*\(manual,\s*p\.?\s*[^)]{1,30}\)/gi, '');
  h = h.replace(/\s*\(user\s*manual[^)]{0,40}\)/gi, '');
  h = h.replace(/<li[^>]*>\s*Mã\s+(số\s+)?sản\s+phẩm\s*:\s*[^<]*<\/li>/gi, '');
  h = h.replace(/<li[^>]*>\s*Thương\s+hiệu\s*:\s*[^<]*<\/li>/gi, '');
  h = h.replace(/<li[^>]*>\s*Xuất\s+xứ\s*:\s*[^<]*<\/li>/gi, '');
  h = h.replace(/<p[^>]*>\s*Mã\s+(số\s+)?sản\s+phẩm\s*:\s*[^<]*<\/p>/gi, '');
  h = h.replace(/<p[^>]*>\s*Thương\s+hiệu\s*:\s*[^<]*<\/p>/gi, '');
  h = h.replace(/<p[^>]*>\s*Xuất\s+xứ\s*:\s*[^<]*<\/p>/gi, '');
  h = h.replace(/Mã\s+(số\s+)?sản\s+phẩm\s*:\s*[\w.\-]+\s*/gi, '');
  h = h.replace(/Thương\s+hiệu\s*:\s*[^\n<.]+[.\n]?\s*/gi, '');
  h = h.replace(/Xuất\s+xứ\s*:\s*[^\n<.]+[.\n]?\s*/gi, '');
  h = h.replace(/<p[^>]*>\s*<strong>\s*(Đặc\s+tính\s+nổi\s+(trội|bật)|Đặc\s+điểm\s+(ưu\s+việt|nổi\s+bật)|Thông\s+số\s+kỹ\s+thuật|Tính\s+năng\s+nổi\s+bật)\s*:?\s*<\/strong>\s*<\/p>/gi, '');
  h = h.replace(/<p[^>]*>\s*(Đặc\s+tính\s+nổi\s+(trội|bật)|Đặc\s+điểm\s+(ưu\s+việt|nổi\s+bật)|Thông\s+số\s+kỹ\s+thuật)\s*:?\s*<\/p>/gi, '');
  h = h.replace(/<ul[^>]*>\s*<\/ul>/gi, '');
  h = h.replace(/<ol[^>]*>\s*<\/ol>/gi, '');
  h = h.replace(/(\s*\n\s*){3,}/g, '\n\n');
  return h.trim();
}

function countManualRefs(rawHtml) {
  if (!rawHtml) return 0;
  const matches = rawHtml.match(/\(manual,\s*trang\s*[^)]{1,60}\)/gi) || [];
  return matches.length;
}

function hasMetadataBlock(rawHtml) {
  if (!rawHtml) return false;
  return /Mã\s+(số\s+)?sản\s+phẩm\s*:/i.test(rawHtml) ||
         /Thương\s+hiệu\s*:/i.test(rawHtml) ||
         /Xuất\s+xứ\s*:/i.test(rawHtml);
}

function extractSampleNoise(rawHtml) {
  if (!rawHtml) return '';
  // Lấy tối đa 3 manual refs đầu tiên để minh họa
  const refs = [];
  const re = /\(manual,\s*trang\s*[^)]{1,60}\)/gi;
  let m;
  while ((m = re.exec(rawHtml)) !== null && refs.length < 3) refs.push(m[0]);
  if (hasMetadataBlock(rawHtml)) {
    const metaMatch = rawHtml.match(/Mã\s+(số\s+)?sản\s+phẩm\s*:\s*[\w.\-]+/i);
    if (metaMatch) refs.push(metaMatch[0]);
  }
  return refs.join(' | ');
}

function buildLongDescResult(product) {
  const rawHtml = product.description || '';
  if (!rawHtml.trim()) return null; // không có long_desc → bỏ qua

  const origPlain  = stripHtml(rawHtml);
  const cleaned    = cleanLongDescHtml(rawHtml);
  const cleanPlain = stripHtml(cleaned);
  const removed    = origPlain.length - cleanPlain.length;
  const manualRefs = countManualRefs(rawHtml);
  const metaBlock  = hasMetadataBlock(rawHtml);
  const sampleNoise = extractSampleNoise(rawHtml);

  // Không có noise → bỏ qua
  if (removed < 5 && !metaBlock && manualRefs === 0) return null;

  const tooShort   = cleanPlain.length < 200;
  let status;
  if (tooShort)           status = 'NEEDS_REVIEW';
  else if (removed > 0)   status = 'HAS_NOISE';
  else                    status = 'CLEAN';

  return {
    origLen:    origPlain.length,
    cleanLen:   cleanPlain.length,
    removed,
    manualRefs,
    metaBlock,
    sampleNoise,
    status,
    cleanedHtml: cleaned,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT SHORT-DESC CSV
// ─────────────────────────────────────────────────────────────────────────────

async function exportShortDesc(products) {
  const outPath = path.join(REPORTS_DIR, `dry-run-short-desc-${DATE_STR}.csv`);
  const header = csvRow([
    'ID', 'Name', 'URL', 'Category', 'Issue_Type',
    'Orig_Len', 'Cleaned_Len', 'Proposed_Len',
    'Needs_Review', 'Current_Short_Desc', 'Proposed_Short_Desc'
  ]);

  const rows = [header];
  let countIssues = 0, countSkipped = 0, countReview = 0;

  for (const p of products) {
    const r = buildShortDescResult(p);
    if (r.unchanged && r.issue === 'CLEAN_ONLY') { countSkipped++; continue; } // truly unchanged

    const name = stripHtml(p.name || '');
    const cats = (p.categories || []).map(c => c.name).join(', ');
    const origRaw = stripHtml(p.short_description || '');

    rows.push(csvRow([
      p.id,
      name,
      p.permalink || '',
      cats,
      r.issue,
      r.origLen,
      r.cleanedLen,
      r.proposed.length,
      r.needsManual ? 'YES' : 'no',
      origRaw,
      r.proposed,
    ]));
    countIssues++;
    if (r.needsManual) countReview++;
  }

  fs.writeFileSync(outPath, '\uFEFF' + rows.join('\r\n'), 'utf8');  // BOM for Excel
  console.log(`✅ Short-desc CSV: ${outPath}`);
  console.log(`   ${countIssues} rows (${countSkipped} skipped clean) | ${countReview} needs review`);
  return outPath;
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT LONG-DESC CSV
// ─────────────────────────────────────────────────────────────────────────────

async function exportLongDesc(products) {
  const outPath = path.join(REPORTS_DIR, `dry-run-long-desc-${DATE_STR}.csv`);
  const header = csvRow([
    'ID', 'Name', 'URL', 'Category',
    'Orig_Len_Plain', 'Clean_Len_Plain', 'Chars_Removed',
    'Manual_Refs_Count', 'Has_Metadata_Block',
    'Status', 'Sample_Noise',
    'Current_Long_Desc_Full', 'Cleaned_Long_Desc_Full'
  ]);

  const rows = [header];
  let countNoise = 0, countReview = 0;

  for (const p of products) {
    const r = buildLongDescResult(p);
    if (!r) continue;  // no noise, skip

    const name = stripHtml(p.name || '');
    const cats = (p.categories || []).map(c => c.name).join(', ');

    // Full plain text (strip HTML, không cắt) — max ~6400c theo thực tế
    const origPreview  = stripHtml(p.description || '');
    const cleanPreview = stripHtml(r.cleanedHtml || '');

    rows.push(csvRow([
      p.id,
      name,
      p.permalink || '',
      cats,
      r.origLen,
      r.cleanLen,
      r.removed,
      r.manualRefs,
      r.metaBlock ? 'YES' : 'no',
      r.status,
      r.sampleNoise,
      origPreview,
      cleanPreview,
    ]));
    countNoise++;
    if (r.status === 'NEEDS_REVIEW') countReview++;
  }

  fs.writeFileSync(outPath, '\uFEFF' + rows.join('\r\n'), 'utf8');
  console.log(`✅ Long-desc CSV:  ${outPath}`);
  console.log(`   ${countNoise} rows with noise | ${countReview} needs review`);
  return outPath;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const doShort = !ONLY_LONG;
  const doLong  = !ONLY_SHORT;

  console.log('=== export-dry-run.js ===');
  console.log(`   Exporting: ${doShort ? 'short-desc ' : ''}${doLong ? 'long-desc' : ''}`);
  if (ONLY_ID) console.log(`   Chỉ xử lý ID: ${ONLY_ID}`);
  console.log('');

  process.stderr.write('Fetching WC products (short_description + description)...\n');
  const all = await fetchAll(
    '/wp-json/wc/v3/products',
    'id,name,permalink,short_description,description,categories',
    true
  );

  const products = ONLY_ID ? all.filter(p => p.id === ONLY_ID) : all;
  console.log(`   ${products.length} products fetched\n`);

  if (doShort) await exportShortDesc(products);
  if (doLong)  await exportLongDesc(products);

  console.log('\n→ Mở file CSV trong Excel/Google Sheets để review');
  console.log('→ Sau khi duyệt: node khoa.js fix-short-desc --apply');
  console.log('→                node khoa.js fix-long-desc --apply');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
