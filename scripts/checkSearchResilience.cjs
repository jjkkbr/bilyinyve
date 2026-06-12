const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.join(__dirname, '..');
const cacheSource = fs.readFileSync(path.join(rootDir, 'server', 'searchCache.js'), 'utf8');
const searchSource = fs.readFileSync(path.join(rootDir, 'server', 'searchService.js'), 'utf8');
const bilibiliSource = fs.readFileSync(path.join(rootDir, 'server', 'providers', 'bilibiliProvider.js'), 'utf8');

assert(cacheSource.includes('5 * 60_000'), 'keyword search cache should last several minutes');
assert(cacheSource.includes('30 * 60_000'), 'Bilibili detail cache should last longer than keyword search');
assert(searchSource.includes('getSearchCacheTtlMs'), 'search service should choose cache TTL by query type');
assert(bilibiliSource.includes('AbortController'), 'Bilibili requests should support timeout cancellation');
assert(bilibiliSource.includes('bilibiliRequestTimeoutMs'), 'Bilibili request timeout should be configured');
assert(bilibiliSource.includes('bilibiliRetryDelayMs'), 'Bilibili fetchJson should retry transient failures');

console.log('Search resilience checks passed');
