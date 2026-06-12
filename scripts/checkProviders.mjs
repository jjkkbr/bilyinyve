import { classifyBilibiliQuery } from '../server/providers/queryClassifier.js';
import { searchTracks } from '../server/searchService.js';
import { ProviderError } from '../server/providerError.js';

const cases = [
  ['BV1xx411c7mD', 'bv'],
  ['https://www.bilibili.com/video/BV1xx411c7mD/', 'bv'],
  ['av170001', 'av'],
  ['170001', 'av'],
  ['洛天依', 'keyword']
];

for (const [query, expectedType] of cases) {
  const result = classifyBilibiliQuery(query);
  assert(result.type === expectedType, `Expected ${query} to be ${expectedType}, got ${result.type}`);
}

const demoResult = await searchTracks({
  keyword: '音乐',
  providerId: 'demo',
  limit: 40
});
assert(demoResult.tracks.length > 0, 'Demo provider should return tracks');
assert(demoResult.provider.id === 'demo', 'Demo search should report demo provider');

const limitedDemoResult = await searchTracks({
  keyword: '音乐',
  providerId: 'demo',
  limit: 2
});
assert(limitedDemoResult.tracks.length === 2, 'Search service should honor result limit');

const bilibiliResult = await searchTracks({
  keyword: 'https://www.bilibili.com/video/BV1xx411c7mD/',
  providerId: 'bilibili',
  limit: 1
});
assert(bilibiliResult.tracks.length === 1, 'Bilibili provider should return one metadata result');
assert(bilibiliResult.provider.id === 'bilibili', 'Bilibili search should report bilibili provider');
assert(bilibiliResult.provider.configured === true, 'Bilibili provider should be configured for public metadata');
assert(bilibiliResult.tracks[0].externalOnly === true, 'Bilibili result should be external-only');
assert(
  bilibiliResult.tracks[0].sourceUrl.toUpperCase().includes('BV1XX411C7MD'),
  'Bilibili result should link to source video'
);

try {
  const bilibiliKeywordResult = await searchTracks({
    keyword: '普通DISCO',
    providerId: 'bilibili',
    limit: 40
  });
  assert(bilibiliKeywordResult.tracks.length > 0, 'Bilibili keyword search should return public video results');
  assert(bilibiliKeywordResult.tracks[0].externalOnly === true, 'Bilibili keyword result should be external-only');
  assert(bilibiliKeywordResult.tracks[0].sourceUrl.includes('bilibili.com/video/'), 'Keyword result should link to Bilibili');
} catch (error) {
  if (
    !(error instanceof ProviderError) ||
    !['BILIBILI_SEARCH_RATE_LIMITED', 'BILIBILI_SEARCH_UNAVAILABLE'].includes(error.code)
  ) {
    throw error;
  }
  console.warn(`Skipping live Bilibili keyword search check: ${error.code}`);
}

console.log('Provider checks passed');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
