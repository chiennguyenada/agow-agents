'use strict';
/**
 * write-project-post.js
 * Viết bài blog "case study" từ thông tin dự án do admin cung cấp qua Telegram.
 * Ảnh do admin gửi — đã được Khoa upload lên WP Media trước khi gọi script này.
 *
 * CLI:
 *   node write-project-post.js --info='{"task_type":"repair",...}'
 *   node write-project-post.js --info-file=path/to/project.json
 *   node write-project-post.js --img-ids=5490,5491        (WP Media IDs, đã upload)
 *   node write-project-post.js --schedule=2026-04-17      (lên lịch đăng, mặc định 08:00)
 *   node write-project-post.js --publish                  (đăng ngay)
 *
 * Project info JSON structure:
 * {
 *   "task_type": "repair" | "install" | "retrofit" | "maintenance",
 *   "devices": ["ACOPOS 1022", "X20CP3484"],
 *   "factory": { "name": "...", "industry": "bao bì nhựa", "location": "Bình Dương" },
 *   "duration": "3 ngày",
 *   "problem": "Mô tả sự cố / yêu cầu ban đầu",
 *   "solution": "Giải pháp Agow thực hiện",
 *   "result": "Kết quả đạt được",
 *   "extra": "Thông tin bổ sung tùy chọn"
 * }
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../..', '.env') });

const fs   = require('fs');
const path = require('path');
const { wpGet, wpPost, wpPut, config } = require('./wp-client');
const { chatComplete } = require('./gemini-client');

// ── CLI parsing ───────────────────────────────────────────────────────────────
const ARGV = process.argv.slice(2);

function getArg(name) {
  const m = process.argv.join(' ').match(new RegExp('--' + name + '=([^\\s]+)'));
  return m ? m[1] : null;
}

const INFO_ARG      = getArg('info');
const INFO_FILE_ARG = getArg('info-file');
const IMG_IDS_ARG   = getArg('img-ids');
const SCHEDULE_ARG  = getArg('schedule');
const PUBLISH_NOW   = ARGV.includes('--publish');

// ── Load project info ─────────────────────────────────────────────────────────
function loadProjectInfo() {
  if (INFO_ARG) {
    try { return JSON.parse(decodeURIComponent(INFO_ARG)); }
    catch (e) { throw new Error('--info JSON parse error: ' + e.message); }
  }
  if (INFO_FILE_ARG) {
    if (!fs.existsSync(INFO_FILE_ARG)) throw new Error('--info-file not found: ' + INFO_FILE_ARG);
    return JSON.parse(fs.readFileSync(INFO_FILE_ARG, 'utf-8'));
  }
  throw new Error('Cần --info=\'{...}\' hoặc --info-file=path.json');
}

// ── Task type labels ──────────────────────────────────────────────────────────
const TASK_LABELS = {
  repair:      'Sửa chữa thiết bị',
  install:     'Lắp đặt hệ thống',
  retrofit:    'Nâng cấp / Retrofit',
  maintenance: 'Bảo trì định kỳ',
};

// ── System prompt ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Bạn là chuyên gia viết nội dung SEO cho Agow Automation — nhà phân phối và dịch vụ thiết bị B&R Automation tại Việt Nam.

NHIỆM VỤ: Viết bài blog dạng "case study" — ghi lại một dự án Agow vừa hoàn thành (sửa chữa, lắp đặt, retrofit, bảo trì thiết bị B&R).

MỤC TIÊU BÀI VIẾT:
- Chứng minh năng lực kỹ thuật của Agow với khách hàng B2B
- Xây dựng trust qua thực tế (E-E-A-T: Experience, Expertise, Authoritativeness, Trustworthiness)
- SEO semantic: target doanh nghiệp tìm kiếm dịch vụ sửa chữa/lắp đặt thiết bị B&R

QUY TẮC VIẾT:
1. Ngôn ngữ: tiếng Việt. Thuật ngữ kỹ thuật giữ tiếng Anh (ACOPOS, PLC, HMI, servo, I/O, CPU).
2. Độ dài: 600–800 từ (ngắn gọn, súc tích — đây là case study, không phải hướng dẫn)
3. Giọng văn: chuyên nghiệp, thực tế, không hoa mỹ. Tránh "Agow luôn cam kết..." kiểu PR rỗng.
4. Cấu trúc HTML (KHÔNG bao gồm <h1>):
   - <h2>Bối cảnh / Yêu cầu khách hàng</h2>
   - <h2>Thiết bị và vấn đề</h2>
   - <h2>Giải pháp Agow thực hiện</h2>
   - <h2>Kết quả đạt được</h2>
   - <h2>Kết luận</h2> (≥80 từ, có 1 internal link)
5. Thông tin nhà máy/khách hàng: giữ chung nếu không được phép công khai (VD: "một nhà máy bao bì nhựa tại Bình Dương")
6. KHÔNG bịa thông số kỹ thuật. KHÔNG thêm thông tin không có trong input.
7. Internal link cuối bài: <a href="/dich-vu/">dịch vụ của Agow</a> hoặc link tới category sản phẩm liên quan.
8. [IMAGE_1] đặt sau <h2> đầu tiên. [IMAGE_2] đặt sau <h2> thứ 3 (nếu có ≥2 ảnh).

OUTPUT FORMAT (JSON strict):
{
  "html": "<h2>...</h2><p>...",
  "h1_title": "tiêu đề H1 bài viết (60-80 ký tự, chứa thiết bị + ngành/kết quả)",
  "seo_title": "meta title ≤60 ký tự",
  "meta_desc": "140–155 ký tự, không CTA chung",
  "focus_keyword": "3-5 từ (VD: sửa chữa ACOPOS B&R, lắp đặt PLC B&R)",
  "slug": "url-slug-ascii-khong-dau (5-8 từ)",
  "categories": ["Tin Tức", "Dự Án"],
  "tags": ["B&R", "ACOPOS", "..."]
}

Ghi chú: "html" là toàn bộ nội dung bài KHÔNG gồm <h1>. <h1> sẽ dùng "h1_title" và được thêm bên ngoài.`;

// ── Build writing prompt from project info ────────────────────────────────────
function buildPrompt(info) {
  const taskLabel = TASK_LABELS[info.task_type] || info.task_type;
  const devices   = (info.devices || []).join(', ') || 'không rõ';
  const factory   = info.factory
    ? `${info.factory.name || 'nhà máy'} — ngành: ${info.factory.industry || 'không rõ'}, địa điểm: ${info.factory.location || 'không rõ'}`
    : 'không rõ';

  return `Thông tin dự án vừa hoàn thành:

Loại công việc: ${taskLabel}
Thiết bị: ${devices}
Khách hàng / Nhà máy: ${factory}
Thời gian thực hiện: ${info.duration || 'không rõ'}
Vấn đề / Yêu cầu ban đầu: ${info.problem || '(không có)'}
Giải pháp Agow thực hiện: ${info.solution || '(không có)'}
Kết quả đạt được: ${info.result || '(không có)'}
${info.extra ? 'Thông tin thêm: ' + info.extra : ''}

Hãy viết bài blog case study theo system prompt. Trả về JSON.`;
}

// ── Parse JSON from Gemini response ──────────────────────────────────────────
function parseJSON(text, label) {
  if (!text) return null;
  let s = text.trim();
  const fenceMatch = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) s = fenceMatch[1].trim();
  try { return JSON.parse(s); }
  catch {
    const m = s.match(/\{[\s\S]*\}/);
    if (m) try { return JSON.parse(m[0]); } catch {}
    console.warn('  ⚠️  JSON parse failed for ' + label);
    return null;
  }
}

// ── Resolve WP media info from IDs ────────────────────────────────────────────
async function resolveMediaIds(ids) {
  const results = [];
  for (const id of ids) {
    const res = await wpGet('/wp-json/wp/v2/media/' + id + '?_fields=id,source_url,alt_text,caption');
    if (res.ok && res.body && res.body.id) {
      results.push({
        id:        res.body.id,
        url:       res.body.source_url,
        alt:       (res.body.alt_text || {}).rendered || res.body.alt_text || '',
        caption:   (res.body.caption || {}).rendered || '',
      });
    } else {
      console.warn('  ⚠️  Media ID ' + id + ' not found — skipping');
    }
  }
  return results;
}

// ── Inject images into HTML ───────────────────────────────────────────────────
function injectImages(html, mediaList) {
  if (!mediaList.length) return html;

  // Build img tags
  const imgTags = mediaList.map(m =>
    '<figure><img src="' + m.url + '" alt="' + (m.alt || '') + '" loading="lazy" /></figure>'
  );

  // Replace [IMAGE_1] and [IMAGE_2] if they exist
  let result = html;
  if (result.includes('[IMAGE_1]') && imgTags[0]) {
    result = result.replace('[IMAGE_1]', imgTags[0]);
  } else if (imgTags[0]) {
    // Inject after first <h2>
    result = result.replace(/(<h2[^>]*>.*?<\/h2>)/, '$1\n' + imgTags[0]);
  }
  if (result.includes('[IMAGE_2]') && imgTags[1]) {
    result = result.replace('[IMAGE_2]', imgTags[1]);
  } else if (imgTags[1]) {
    // Inject after 3rd <h2>
    const h2s = [...result.matchAll(/<h2/g)];
    if (h2s.length >= 3) {
      const pos = h2s[2].index;
      result = result.slice(0, pos) + imgTags[1] + '\n' + result.slice(pos);
    }
  }
  // Remove any remaining unfilled placeholders
  result = result.replace(/\[IMAGE_\d+\]/g, '');
  return result;
}

// ── findOrCreate WP category ──────────────────────────────────────────────────
async function findOrCreateCategory(name) {
  const res = await wpGet('/wp-json/wp/v2/categories?search=' + encodeURIComponent(name) + '&_fields=id,name');
  if (res.ok && Array.isArray(res.body) && res.body.length) {
    const exact = res.body.find(c => c.name.toLowerCase() === name.toLowerCase());
    return exact ? exact.id : res.body[0].id;
  }
  const cr = await wpPost('/wp-json/wp/v2/categories', { name });
  if (cr.ok && cr.body && cr.body.id) {
    console.log('   Created category: "' + name + '" (ID: ' + cr.body.id + ')');
    return cr.body.id;
  }
  console.warn('   ⚠️  Cannot create category: ' + name);
  return null;
}

async function resolveCategories(names) {
  const ids = [];
  for (const name of names) {
    const id = await findOrCreateCategory(name.trim());
    if (id) ids.push(id);
  }
  return ids;
}

// ── Purge cache ───────────────────────────────────────────────────────────────
function purgeCache() {
  const { spawnSync } = require('child_process');
  const purgeScript   = path.join(__dirname, 'purge-cache.js');
  if (fs.existsSync(purgeScript)) {
    const r = spawnSync(process.execPath, [purgeScript], { stdio: 'inherit', env: process.env });
    if (r.status !== 0) console.warn('  ⚠️  Cache purge exited non-zero');
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n' + '═'.repeat(60));
  console.log('  Agow Project Post Writer — write-project-post.js');
  console.log('═'.repeat(60) + '\n');

  // 1. Load project info
  const info = loadProjectInfo();
  console.log('📋 Project info loaded:');
  console.log('   Task type:', info.task_type);
  console.log('   Devices:', (info.devices || []).join(', '));
  console.log('   Factory:', info.factory ? JSON.stringify(info.factory) : '(không có)');

  // 2. Resolve WP Media IDs
  const imgIds = IMG_IDS_ARG
    ? IMG_IDS_ARG.split(',').map(s => parseInt(s.trim(), 10)).filter(Boolean)
    : [];
  let mediaList = [];
  if (imgIds.length) {
    console.log('\n🖼️  Resolving WP Media IDs:', imgIds.join(', '));
    mediaList = await resolveMediaIds(imgIds);
    console.log('   Resolved:', mediaList.length + '/' + imgIds.length + ' images');
  } else {
    console.log('\n⚠️  Không có --img-ids — bài sẽ không có ảnh');
  }

  // 3. Write article via Gemini
  console.log('\n✍️  Writing article with Gemini...');
  const prompt = buildPrompt(info);
  const raw = await chatComplete(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: prompt },
    ],
    { maxTokens: 4096, temperature: 0.4 }
  );

  const article = parseJSON(raw, 'article');
  if (!article || !article.html || !article.seo_title) {
    console.error('Raw response:\n', raw.slice(0, 500));
    throw new Error('Failed to parse article JSON from Gemini');
  }

  console.log('   H1:', article.h1_title);
  console.log('   SEO title (' + article.seo_title.length + 'c):', article.seo_title);
  console.log('   Meta desc (' + (article.meta_desc || '').length + 'c)');
  console.log('   Focus keyword:', article.focus_keyword);
  console.log('   HTML length:', article.html.length + ' chars');

  // 4. Inject images into HTML
  const html = injectImages(article.html, mediaList);

  // 5. Create WP draft
  console.log('\n📝 Creating WP draft...');
  const rawCats = Array.isArray(article.categories) ? article.categories : ['Tin Tức', 'Dự Án'];
  // Ensure "Tin Tức" always included for blog menu
  if (!rawCats.some(c => c.toLowerCase().includes('tin t'))) rawCats.unshift('Tin Tức');
  const categoryIds = await resolveCategories(rawCats);
  console.log('   Categories:', categoryIds.join(', ') || '(none)');

  const postBody = {
    title:          article.seo_title,
    content:        '<h1>' + article.h1_title + '</h1>\n' + html,
    excerpt:        article.meta_desc || '',
    status:         'draft',
    slug:           article.slug || '',
    categories:     categoryIds,
    featured_media: mediaList.length ? mediaList[0].id : 0,
    meta: {
      rank_math_title:         article.seo_title,
      rank_math_description:   article.meta_desc || '',
      rank_math_focus_keyword: article.focus_keyword || '',
    },
  };

  const res = await wpPost('/wp-json/wp/v2/posts', postBody);
  if (!res.ok || !res.body || !res.body.id) {
    throw new Error('WP post creation failed: ' + JSON.stringify(res.body).slice(0, 200));
  }
  const draftId = res.body.id;
  console.log('   ✅ Draft created: ID ' + draftId);

  // 6. Schedule or publish
  if (SCHEDULE_ARG) {
    const isoDate = SCHEDULE_ARG.includes('T') ? SCHEDULE_ARG : SCHEDULE_ARG + 'T08:00:00';
    const sc = await wpPut('/wp-json/wp/v2/posts/' + draftId, { status: 'future', date: isoDate });
    if (!sc.ok) throw new Error('Schedule failed: ' + JSON.stringify(sc.body).slice(0, 200));
    console.log('   📅 Scheduled:', isoDate);
  } else if (PUBLISH_NOW) {
    const pb = await wpPut('/wp-json/wp/v2/posts/' + draftId, { status: 'publish' });
    if (!pb.ok) throw new Error('Publish failed: ' + JSON.stringify(pb.body).slice(0, 200));
    console.log('   🚀 Published:', pb.body.link || '');
    purgeCache();
  }

  // 7. Summary
  const previewUrl = config.BASE_URL + '/?p=' + draftId + '&preview=true';
  console.log('\n' + '═'.repeat(60));
  console.log('✅ Bài case study đã tạo draft — ID ' + draftId);
  console.log('📝 ' + article.seo_title);
  console.log('🔑 ' + article.focus_keyword);
  if (SCHEDULE_ARG) console.log('📅 Sẽ đăng: ' + SCHEDULE_ARG + ' 08:00');
  else if (!PUBLISH_NOW) console.log('🔗 Preview: ' + previewUrl);
  if (!SCHEDULE_ARG && !PUBLISH_NOW) {
    console.log('\n→ Lên lịch đăng:');
    console.log('  node khoa.js schedule-blog -- --id=' + draftId + ' --date=YYYY-MM-DD');
    console.log('→ Đăng ngay:');
    console.log('  node khoa.js publish-blog -- --id=' + draftId + ' --publish');
  }
  console.log('═'.repeat(60));
}

main().catch(e => {
  console.error('\n❌ Fatal error:', e.message);
  if (process.env.DEBUG) console.error(e.stack);
  process.exit(1);
});
