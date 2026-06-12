const defaultTtlMs = 5 * 60_000;
const detailTtlMs = 30 * 60_000;
const cache = new Map();

export function getCachedSearch(cacheKey) {
  const entry = cache.get(cacheKey);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    cache.delete(cacheKey);
    return null;
  }

  return entry.value;
}

export function setCachedSearch(cacheKey, value, ttlMs = defaultTtlMs) {
  cache.set(cacheKey, {
    value,
    expiresAt: Date.now() + ttlMs
  });
}

export function getSearchCacheTtlMs({ queryType = 'keyword' } = {}) {
  return queryType === 'bv' || queryType === 'av' ? detailTtlMs : defaultTtlMs;
}

export function getCacheStats() {
  const now = Date.now();
  let activeEntries = 0;

  for (const [key, entry] of cache.entries()) {
    if (now > entry.expiresAt) {
      cache.delete(key);
    } else {
      activeEntries += 1;
    }
  }

  return {
    activeEntries,
    ttlMs: defaultTtlMs,
    detailTtlMs
  };
}

export function clearSearchCache() {
  const clearedEntries = cache.size;
  cache.clear();
  return {
    clearedEntries,
    activeEntries: 0,
    ttlMs: defaultTtlMs,
    detailTtlMs
  };
}
