import { getCachedSearch, getSearchCacheTtlMs, setCachedSearch } from './searchCache.js';
import { getProvider, toProviderSummary } from './providers/index.js';
import { demoTracks } from './demoCatalog.js';
import { ProviderError } from './providerError.js';
import { classifyBilibiliQuery } from './providers/queryClassifier.js';

const allowedDurations = new Set(['all', 'short', 'medium', 'long']);
const allowedSorts = new Set(['relevance', 'latest', 'views']);
const defaultResultLimit = 40;
const maxResultLimit = 100;

export async function searchTracks({ keyword = '', sort = 'relevance', duration = 'all', providerId = 'demo', limit = defaultResultLimit }) {
  const trimmedKeyword = keyword.trim();
  const normalizedKeyword = trimmedKeyword.toLowerCase();
  const safeSort = allowedSorts.has(sort) ? sort : 'relevance';
  const safeDuration = allowedDurations.has(duration) ? duration : 'all';
  const safeLimit = sanitizeResultLimit(limit);
  const provider = getProvider(providerId);
  const queryType = provider?.id === 'bilibili' ? classifyBilibiliQuery(trimmedKeyword).type : 'keyword';

  if (!provider) {
    throw new ProviderError(`未知数据源：${providerId}`, {
      code: 'UNKNOWN_PROVIDER',
      statusCode: 400,
      details: {
        provider: providerId
      }
    });
  }

  const cacheKey = JSON.stringify({
    provider: provider.id,
    queryType,
    keyword: normalizedKeyword,
    sort: safeSort,
    duration: safeDuration,
    limit: safeLimit
  });

  if (!trimmedKeyword) {
    return {
      tracks: [],
      provider: toProviderSummary(provider),
      cache: {
        hit: false
      },
      pagination: {
        requestedLimit: safeLimit,
        resultCount: 0,
        hasMore: false,
        fetchedPages: 0
      }
    };
  }

  const cached = getCachedSearch(cacheKey);
  if (cached) {
    const cachedTracks = Array.isArray(cached.tracks) ? cached.tracks : [];
    return {
      ...cached,
      pagination: cached.pagination || {
        requestedLimit: safeLimit,
        resultCount: cachedTracks.length,
        hasMore: false,
        fetchedPages: null
      },
      cache: {
        hit: true
      }
    };
  }

  const providerResult = await provider.search({
    keyword: provider.id === 'demo' ? normalizedKeyword : trimmedKeyword,
    limit: safeLimit
  });
  const providerTracks = Array.isArray(providerResult)
    ? providerResult
    : Array.isArray(providerResult?.tracks)
      ? providerResult.tracks
      : [];
  const pagination = getSearchPagination({
    providerResult,
    providerTracks,
    requestedLimit: safeLimit
  });
  const tracks = sortTracks(filterByDuration(providerTracks, safeDuration), safeSort).slice(0, safeLimit);
  const result = {
    tracks,
    provider: toProviderSummary(provider),
    cache: {
      hit: false
    },
    pagination: {
      ...pagination,
      resultCount: tracks.length
    }
  };

  setCachedSearch(cacheKey, result, getSearchCacheTtlMs({ queryType }));
  return result;
}

function sanitizeResultLimit(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return defaultResultLimit;
  return Math.min(maxResultLimit, Math.max(1, Math.floor(numberValue)));
}

function getSearchPagination({ providerResult, providerTracks, requestedLimit }) {
  const providerPagination =
    providerResult && !Array.isArray(providerResult) && typeof providerResult === 'object'
      ? providerResult.pagination
      : null;
  const providerHasMore =
    providerPagination && typeof providerPagination.hasMore === 'boolean'
      ? providerPagination.hasMore
      : providerTracks.length > requestedLimit;

  return {
    requestedLimit,
    hasMore: Boolean(providerHasMore && requestedLimit < maxResultLimit),
    fetchedPages: Number.isFinite(Number(providerPagination?.fetchedPages))
      ? Number(providerPagination.fetchedPages)
      : null
  };
}

function filterByDuration(tracks, duration) {
  if (duration === 'short') return tracks.filter((track) => track.durationSeconds <= 240);
  if (duration === 'medium') {
    return tracks.filter((track) => track.durationSeconds > 240 && track.durationSeconds <= 600);
  }
  if (duration === 'long') return tracks.filter((track) => track.durationSeconds > 600);
  return tracks;
}

function sortTracks(tracks, sort) {
  return [...tracks].sort((a, b) => {
    if (sort === 'latest') return new Date(b.publishedAt) - new Date(a.publishedAt);
    if (sort === 'views') return b.viewCount - a.viewCount;
    const aIndex = demoTracks.findIndex((track) => track.id === a.id);
    const bIndex = demoTracks.findIndex((track) => track.id === b.id);
    if (aIndex >= 0 && bIndex >= 0) return aIndex - bIndex;
    if (aIndex >= 0) return -1;
    if (bIndex >= 0) return 1;
    return 0;
  });
}
