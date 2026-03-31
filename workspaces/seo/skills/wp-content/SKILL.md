---
name: wp-content
description: Create new content or expand thin content for WordPress pages and posts using AI
---

# Skill: WP Content

## Purpose
Create new content or expand thin content for agowautomation.com pages and posts.

## Source Reference
Based on: `28-auditwebagow/sprint3_content_fixer.py`

## Trigger
- User request: "viết bài", "tạo content", "mở rộng nội dung"
- Auto-triggered by wp-daily-check when THIN_CONTENT detected
- Auto-triggered by wp-audit for pages with score < 70 due to content issues

## Approval Tier
- New post/page creation: Tier 3 (create as DRAFT, await PUBLISH approval)
- Content expansion (existing page): Tier 2 (expand then notify with undo option)

## Content Strategies

### Strategy 1: Thin Content Fix (< 300 words)
Full rewrite approach:
1. Read existing content and meta
2. Research product specs from product-catalog.md
3. Generate comprehensive content (target: 800-1200 words):
   - Introduction: What is this product/category
   - Technical specifications: from B&R datasheets
   - Applications: real-world use cases in Vietnam manufacturing
   - Comparison: vs similar products in lineup
   - FAQ: 3-5 common questions
4. Preserve existing media (images, downloads)
5. Set RankMath focus keyword

### Strategy 2: Medium Content Enhancement (300-600 words)
Enhance existing approach:
1. Read and understand current content structure
2. Identify gaps (missing specs, no applications section, no FAQ)
3. Add missing sections (target: total 800+ words)
4. Improve existing sections with more detail
5. Do NOT rewrite sections that are already good
6. Preserve author voice and style

### Strategy 3: New Content Creation
For completely new posts/pages:
1. Receive topic from user or Lead Agent
2. Research via product-catalog.md + existing site content
3. Create outline first → confirm with admin if complex
4. Write full article (target: 1000-1500 words)
5. Generate meta title (≤60 chars), description (≤160 chars), focus keyword
6. Create as DRAFT — never auto-publish

## Content Quality Checks
Before submitting content:
- [ ] Word count meets target
- [ ] Focus keyword appears in: title, first paragraph, H2, meta description
- [ ] No duplicate content with existing pages (check via wp-audit similarity)
- [ ] All product names/model numbers are accurate (verify against product-catalog.md)
- [ ] Vietnamese grammar and spelling check
- [ ] Technical terms are correct (B&R terminology)
- [ ] Internal links to related products/categories included
- [ ] Alt text inflation check: no duplicate alt text in new images

## WordPress API Integration

### Update existing post content:
```
PUT /wp-json/wp/v2/posts/{id}
Body: {
  "content": "{new_content}",
  "meta": {
    "rank_math_title": "{seo_title}",
    "rank_math_description": "{meta_desc}",
    "rank_math_focus_keyword": "{keyword}"
  }
}
```

### Create new draft:
```
POST /wp-json/wp/v2/posts
Body: {
  "title": "{title}",
  "content": "{content}",
  "status": "draft",
  "categories": [{category_ids}],
  "meta": {
    "rank_math_title": "{seo_title}",
    "rank_math_description": "{meta_desc}",
    "rank_math_focus_keyword": "{keyword}"
  }
}
```

### After content update:
1. Call LiteSpeed cache purge for the URL
2. Wait 5 seconds
3. Re-crawl to verify changes are live
4. Re-score the page
5. Log: old_score → new_score, content_change_summary

## Model Selection
- **claude-haiku-4-5**: For content expansion (strategy 2), meta descriptions
- **claude-sonnet-4-6**: For full rewrites (strategy 1), new content creation (strategy 3)
- Cost estimation: ~$0.005 per Haiku call, ~$0.03 per Sonnet call

## Error Handling
- API write fails → retry 3x → save content locally as backup → alert admin
- Content generation quality low → re-generate with more specific prompt
- Duplicate content detected → abort, flag for manual review
- Word count below target after generation → retry with explicit word count instruction
