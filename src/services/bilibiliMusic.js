export async function getMusicProviders() {
  const response = await fetch(await apiUrl('/api/providers'));
  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.ok) {
    throw createApiError(payload, '数据源列表暂不可用');
  }

  return payload.providers || [];
}

export async function searchBilibiliMusic({ keyword, sort = 'relevance', duration = 'all', provider = 'bilibili', limit = 40 }) {
  const params = new URLSearchParams({
    keyword,
    sort,
    duration,
    provider,
    limit: String(limit)
  });

  const response = await fetch(await apiUrl(`/api/search?${params.toString()}`));
  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.ok) {
    throw createApiError(payload, '搜索服务暂不可用');
  }

  return {
    tracks: payload.tracks || [],
    source: payload.source || 'unknown',
    provider: payload.provider || null,
    cache: payload.cache || { hit: false },
    complianceNotice: payload.complianceNotice || ''
  };
}

export async function clearSearchCache() {
  const response = await fetch(await apiUrl('/api/cache'), {
    method: 'DELETE'
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.ok) {
    throw createApiError(payload, '缓存清理失败');
  }

  return payload.cache;
}

function createApiError(payload, fallbackMessage) {
  const error = new Error(payload?.error || fallbackMessage);
  error.code = payload?.code || 'API_ERROR';
  error.details = payload?.details || {};
  return error;
}

let desktopApiBaseUrlPromise;

async function apiUrl(path) {
  if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
    const baseUrl = await getDesktopApiBaseUrl();
    return `${baseUrl}${path}`;
  }
  return path;
}

async function getDesktopApiBaseUrl() {
  if (!desktopApiBaseUrlPromise) {
    desktopApiBaseUrlPromise = resolveDesktopApiBaseUrl();
  }
  return desktopApiBaseUrlPromise;
}

async function resolveDesktopApiBaseUrl() {
  try {
    const apiUrlFromDesktop = await window.biliwaveDesktop?.getApiUrl?.();
    if (typeof apiUrlFromDesktop === 'string' && apiUrlFromDesktop.trim()) {
      return apiUrlFromDesktop.replace(/\/$/, '');
    }
  } catch {
    // Fall through to the default local API port used by development and older desktop builds.
  }

  return 'http://127.0.0.1:8787';
}
