'use strict';
/**
 * fix-category-cache.js
 * Auto-fix common AI output issues in ai-rewrite-category-cache.json:
 *   - <h1> → <p><strong>
 *   - **bold** markdown → <strong>
 *   - "hãng b&r" → "B&R"
 *   - meta desc quá dài → trim tại ranh giới từ
 *   - title **bold** → plain text
 * Sau đó re-validate issues array.
 */

const fs   = require('fs');
const path = require('path');

const CACHE_FILE = path.join(__dirname, '..', 'cache', 'ai-rewrite-category-cache.json');
const REGEN_IDS  = new Set([]); // empty — all IDs done, safe to fix all

const strip = h => (h||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();

function revalidate(desc, title, meta) {
  const issues = [];
  const wc = strip(desc).split(/\s+/).filter(Boolean).length;
  if (wc < 150)                        issues.push(`Desc ngắn (${wc} words)`);
  if (!/<h2/i.test(desc))              issues.push('Thiếu <h2>');
  if (!/<ul/i.test(desc))              issues.push('Thiếu <ul>');
  if (/<h1/i.test(desc))               issues.push('Còn <h1>');
  if (/\*\*/.test(desc))               issues.push('Còn **bold**');
  if (/hãng b&r/i.test(desc))          issues.push('"hãng b&r" lowercase');
  if (!/Agow Automation/i.test(desc))  issues.push('Thiếu "Agow Automation"');
  if (!/B&R/.test(desc))               issues.push('Thiếu "B&R"');
  if (title.length > 62)               issues.push(`Title dài (${title.length}c)`);
  if (title.length < 30)               issues.push('Title ngắn');
  if (!/B&R/.test(title))              issues.push('Title thiếu "B&R"');
  if (!title.includes('|'))            issues.push('Title thiếu "|"');
  if (meta.length > 162)               issues.push(`Meta dài (${meta.length}c)`);
  if (meta.length < 120)               issues.push('Meta ngắn');
  if (!/Agow/i.test(meta))             issues.push('Meta thiếu "Agow"');
  return issues;
}

const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
let fixed = 0;

for (const [id, v] of Object.entries(cache)) {
  if (REGEN_IDS.has(id) || !v.result) continue;

  let changed = false;
  let { description: desc, seoTitle: title, metaDesc: meta } = v.result;

  // 1. <h1> → <p><strong>
  if (/<h1/i.test(desc)) {
    desc = desc.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '<p><strong>$1</strong></p>');
    changed = true;
  }

  // 2. **bold** markdown → <strong>
  if (/\*\*/.test(desc)) {
    desc = desc.replace(/\*\*([\s\S]*?)\*\*/g, '<strong>$1</strong>');
    changed = true;
  }

  // 3. "hãng b&r" → "B&R"
  if (/hãng b&r/i.test(desc)) {
    desc = desc.replace(/hãng b&r/gi, 'B&R');
    changed = true;
  }

  // 4. Title: strip **bold**
  if (/\*\*/.test(title)) {
    title = title.replace(/\*\*/g, '').trim();
    changed = true;
  }

  // 5. Meta: strip **bold**, newlines sau dòng đầu
  if (/\*\*/.test(meta)) {
    meta = meta.replace(/\*\*/g, '').trim();
    changed = true;
  }
  if (meta.includes('\n')) {
    meta = meta.split('\n').find(l => l.trim().length > 20)?.trim() || meta.split('\n')[0].trim();
    changed = true;
  }
  // 6. Meta quá dài → trim tại ranh giới từ
  if (meta.length > 160) {
    let cut = meta.slice(0, 155);
    const lastSep = Math.max(
      cut.lastIndexOf('. '), cut.lastIndexOf(', '),
      cut.lastIndexOf(' – '), cut.lastIndexOf(' — ')
    );
    if (lastSep > 100) cut = cut.slice(0, lastSep);
    if (!/Agow/i.test(cut)) cut = cut + ' | Agow Automation';
    meta = cut.trim();
    changed = true;
  }

  if (changed) {
    v.result.description = desc;
    v.result.seoTitle    = title;
    v.result.metaDesc    = meta;
    v.issues = revalidate(desc, title, meta);
    fixed++;
    const remaining = v.issues.length ? v.issues.join('; ') : 'NONE ✅';
    console.log(`[${id}] ${v.wcName} — Issues còn lại: ${remaining}`);
  }
}

fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));

const total    = Object.values(cache).filter(v => v.result && !REGEN_IDS.has(String(v.id))).length;
const clean    = Object.values(cache).filter(v => v.result && !v.issues?.length).length;
const review   = Object.values(cache).filter(v => v.result && v.issues?.length).length;
console.log(`\nAuto-fixed: ${fixed} entries`);
console.log(`✅ Clean:  ${clean} | 🟡 Review: ${review} | Total: ${total}`);
