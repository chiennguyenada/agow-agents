'use strict';
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

module.exports = parseAIResponse;
