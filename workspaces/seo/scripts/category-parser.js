'use strict';
// Auto-extracted from ai-rewrite-category.js

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
  let seoTitle      = getBlock('SEO_TITLE').split('\n')[0].trim();  // chỉ lấy dòng đầu
  let metaDesc      = getBlock('META_DESC');

  // Meta: lấy dòng dài nhất (loại dòng chú thích ngắn)
  const metaLines = metaDesc.split('\n').map(l => l.trim()).filter(l => l.length > 20);
  metaDesc = metaLines[0] || metaDesc.trim();

  // Strip ký tự `*-` ở đầu/cuối title và meta (AI hay thêm ** trước content)
  seoTitle = seoTitle.replace(/^[`*\-\s]+|[`*\-\s]+$/g, '').trim();
  metaDesc = metaDesc.replace(/^[`*\-\s]+|[`*\-\s]+$/g, '').trim();
  // Nếu title vẫn rỗng, tìm dòng có nội dung thật trong toàn block
  if (!seoTitle) {
    const allLines = getBlock('SEO_TITLE').split('\n')
      .map(l => l.replace(/^[`*\-\s]+|[`*\-\s]+$/g, '').trim())
      .filter(l => l.length > 5 && /[a-zA-ZÀ-ỹ]/.test(l));
    seoTitle = allLines[0] || '';
  }

  return { description, seoTitle, metaDesc };
}


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


module.exports = { parseAIResponse, validate };