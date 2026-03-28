# SEO Agent "Khoa" — Effective Patterns
<!-- Proven strategies that consistently produce good results -->
<!-- Promote to HOT if used 3+ times in 7 days -->
<!-- Source: Seeded from production 28-auditwebagow -->

## Content Strategy
- Thin content (<300 words): full AI rewrite with product-specific keywords
- Medium content (300-600 words): enhance existing, add technical specs + use cases
- Product pages: include B&R part number, Vietnamese description, technical specs, application scenarios

## Meta Optimization
- Title: ≤60 chars, primary keyword first, brand last, dash separator
- Description: ≤160 chars, include call-to-action in Vietnamese
- Focus keyword: match main H1 keyword

## Batch Processing
- Always crawl fresh before batch fixes (never use data >24h old)
- Process in priority order: Critical → High → Medium → Low
- Max 30 WP API writes/hour to avoid rate limiting
- Deduplicate issues before counting (alt text inflates counts)

## Cost Efficiency
- Use Haiku for: meta fixes, alt text, schema generation, daily checks
- Use Sonnet for: long-form content creation, complex rewrites, content strategy
- Schema markup: template-based generation, no AI call needed
- Expected daily cost: $0.08-0.15/run
