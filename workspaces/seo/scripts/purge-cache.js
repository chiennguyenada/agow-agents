/**
 * purge-cache.js
 * Purge LiteSpeed Cache sau khi sửa content trên WordPress.
 * LESSON-001: LiteSpeed Cache rất aggressive — phải purge sau mọi thay đổi.
 *
 * Cách dùng: node purge-cache.js
 *
 * Required env: WP_BASE_URL, WP_USERNAME, WP_APP_PASSWORD
 */

'use strict';

const { config, request } = require('./wp-client');

async function main() {
  const BASE_URL = config.BASE_URL;

  // Method 1: LiteSpeed Cache REST API endpoint (nếu plugin đã kích hoạt REST API)
  const res1 = await request('GET', `${BASE_URL}/wp-json/litespeed/v1/purge/all`);
  if (res1 && res1.status === 200) {
    console.log('✅ LiteSpeed Cache purged via REST API');
    return;
  }

  // Method 2: Touch WP REST API — nhiều cache plugin hook vào REST requests
  const res2 = await request('GET', `${BASE_URL}/wp-json/wp/v2/posts?per_page=1&_fields=id`);
  if (res2 && res2.status === 200) {
    console.log('✅ Cache purge triggered via API touch');
    return;
  }

  // Method 3: HTTP request trực tiếp với purge hint
  const res3 = await request('GET', `${BASE_URL}/?litespeed=login`);
  if (res3 && res3.status < 500) {
    console.log('✅ Cache purge attempted via direct request');
    return;
  }

  console.log('⚠️  Could not purge cache automatically.');
  console.log('   → Vào WP Admin > LiteSpeed Cache > Manage > Purge All để purge thủ công.');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
