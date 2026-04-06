'use strict';
/**
 * finalize-cache.js — Manual title fixes + trim long metas
 */
const fs   = require('fs');
const path = require('path');
const CACHE_FILE = path.join(__dirname, '..', 'cache', 'ai-rewrite-category-cache.json');

// Manual title fixes cho các title dài > 60c
const TITLE_FIX = {
  '134': 'Hãng B&R – Thiết Bị Tự Động Hóa Chính Hãng | Agow',
  '135': 'Acopos Single B&R | Servo Drive Đơn Trục | Agow',
  '136': 'Acopos Multi B&R | Servo Drive Đa Trục | Agow Automation',
  '137': 'Servo Drive ACOPOS B&R | Điều Khiển Servo | Agow',
  '185': 'PLC B&R | Bộ Điều Khiển Lập Trình | Agow Automation',
  '188': 'PLC X20 B&R | Bộ Điều Khiển Lập Trình | Agow',
  '381': '2003 System B&R | I/O Module Phân Tán | Agow Automation',
  '382': 'X20 System B&R | I/O Module Công Nghiệp | Agow',
  '511': 'Máy Tính Công Nghiệp B&R APC620 | Agow Automation',
  '673': 'PLC Bachmann | Điều Khiển Công Nghiệp | Agow Automation',
  '679': 'X67 Safety B&R | Module An Toàn IP67 | Agow Automation',
  '680': 'I/O System B&R | Module Vào Ra Công Nghiệp | Agow',
  '681': 'X67 System B&R | I/O Từ Xa IP67 | Agow Automation',
  '728': 'Automation PC 4100 B&R | IPC Fanless | Agow Automation',
};

const BACHMANN_IDS = new Set(['672', '673']); // không check B&R requirement

const strip  = h => (h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const wCount = h => strip(h).split(/\s+/).filter(Boolean).length;

const trimMeta = (m, max = 155) => {
  if (m.length <= max) return m;
  let cut = m.slice(0, max);
  for (const sep of [' – ', ' — ', '. ', ', ']) {
    const i = cut.lastIndexOf(sep);
    if (i > 80) { cut = cut.slice(0, i); break; }
  }
  if (!/Agow/i.test(cut)) cut = cut.trimEnd() + ' | Agow Automation';
  return cut.trim();
};

function revalidate(id, r) {
  const issues = [];
  const wc = wCount(r.description);
  if (wc < 150)                             issues.push(`Desc ngắn (${wc}w)`);
  if (!/<h2/i.test(r.description))          issues.push('Thiếu <h2>');
  if (!/<ul/i.test(r.description))          issues.push('Thiếu <ul>');
  if (/<h1/i.test(r.description))           issues.push('Có <h1>');
  if (/\*\*/.test(r.description))           issues.push('Còn **bold**');
  if (/hãng b&r/i.test(r.description))      issues.push('"hãng b&r"');
  if (!/Agow Automation/i.test(r.description)) issues.push('Thiếu Agow');
  if (!BACHMANN_IDS.has(id) && !/B&R/.test(r.description)) issues.push('Thiếu B&R');
  if (r.seoTitle.length > 62)               issues.push(`Title dài (${r.seoTitle.length}c)`);
  if (r.seoTitle.length < 30)               issues.push('Title ngắn');
  if (!BACHMANN_IDS.has(id) && !/B&R/.test(r.seoTitle)) issues.push('Title thiếu B&R');
  if (!r.seoTitle.includes('|'))            issues.push('Title thiếu |');
  if (r.metaDesc.length > 162)              issues.push(`Meta dài (${r.metaDesc.length}c)`);
  if (r.metaDesc.length < 120)              issues.push('Meta ngắn');
  if (!/Agow/i.test(r.metaDesc))            issues.push('Meta thiếu Agow');
  return issues;
}

const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));

for (const [id, v] of Object.entries(cache)) {
  if (!v.result) continue;
  let changed = false;

  if (TITLE_FIX[id]) {
    v.result.seoTitle = TITLE_FIX[id];
    changed = true;
  }

  if (v.result.metaDesc.length > 162) {
    v.result.metaDesc = trimMeta(v.result.metaDesc);
    changed = true;
  }

  if (changed) {
    v.issues = revalidate(id, v.result);
    const tag = v.issues.length ? `🟡 ${v.issues.join('; ')}` : '✅';
    console.log(`[${id}] (T:${v.result.seoTitle.length}c M:${v.result.metaDesc.length}c) ${v.wcName} — ${tag}`);
  }
}

fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
const clean  = Object.values(cache).filter(v => v.result && !v.issues?.length).length;
const review = Object.values(cache).filter(v => v.result &&  v.issues?.length).length;
console.log(`\n✅ Clean: ${clean} | 🟡 Review: ${review} | Total with result: ${clean + review}`);
