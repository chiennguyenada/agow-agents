'use strict';
/**
 * google-image-search.js  (powered by SerpAPI — Google Images)
 * Keeps the same exported interface so ai-write-blog.js needs no changes.
 *
 * Required env var:
 *   SERPAPI_KEY  — from serpapi.com dashboard (free: 100/month)
 *
 * Exports:
 *   searchImages(query, count) -> [{index, title, url, thumbnail, width, height}]
 */

const https = require('https');

const SERPAPI_KEY = process.env.SERPAPI_KEY;

if (!SERPAPI_KEY) {
  console.error('[image-search] ERROR: SERPAPI_KEY env var is not set');
  process.exit(1);
}

/**
 * Search images via SerpAPI (Google Images).
 * @param {string} query  — search query
 * @param {number} count  — number of results to return (max 100)
 * @returns {Promise<Array<{index, title, url, thumbnail, width, height}>>}
 */
function searchImages(query, count) {
  count = count || 10;
  return new Promise(function(resolve) {
    var qs = new URLSearchParams({
      engine:   'google_images',
      q:        query,
      api_key:  SERPAPI_KEY,
      num:      String(Math.min(count, 100)),
      safe:     'active',
      ijn:      '0',  // page 0
    });

    var opts = {
      hostname: 'serpapi.com',
      path:     '/search?' + qs.toString(),
      method:   'GET',
      headers: { 'User-Agent': 'agow-seo-bot/1.0' },
    };

    var req = https.request(opts, function(res) {
      var data = '';
      res.on('data', function(c) { data += c; });
      res.on('end', function() {
        try {
          var parsed = JSON.parse(data);

          if (parsed.error) {
            console.warn('  [WARN] SerpAPI error:', parsed.error);
            resolve([]);
            return;
          }

          var items = parsed.images_results || [];
          var results = items.slice(0, count).map(function(item, i) {
            return {
              index:      i + 1,
              title:      item.title || '',
              url:        item.original || item.link || '',
              thumbnail:  item.thumbnail || '',
              contextUrl: item.source || '',
              width:      item.original_width  || 0,
              height:     item.original_height || 0,
            };
          });

          if (!results.length) {
            console.warn('  [WARN] SerpAPI: no image results');
          }
          resolve(results);
        } catch (e) {
          console.warn('  [WARN] SerpAPI parse error:', e.message);
          resolve([]);
        }
      });
    });

    req.on('error', function(e) { console.warn('  [WARN] SerpAPI request error:', e.message); resolve([]); });
    req.setTimeout(20000, function() { req.destroy(); resolve([]); });
    req.end();
  });
}

module.exports = { searchImages: searchImages };
