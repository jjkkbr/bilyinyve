import http from 'node:http';
import { URL } from 'node:url';
import { isRateLimited } from './rateLimit.js';
import { searchTracks } from './searchService.js';
import { clearSearchCache, getCacheStats } from './searchCache.js';
import { listProviders } from './providers/index.js';
import { ProviderError } from './providerError.js';
import { proxyImage } from './imageProxy.js';

export function createApiServer() {
  return http.createServer(async (request, response) => {
    const requestUrl = new URL(request.url, `http://${request.headers.host || '127.0.0.1'}`);
    const ip = request.socket.remoteAddress || 'local';

    try {
      if (request.method === 'OPTIONS') {
        return sendJson(response, 204, {});
      }

      if (request.method === 'GET' && requestUrl.pathname === '/api/image-proxy') {
        return proxyImage(requestUrl, response);
      }

      if (isRateLimited(ip)) {
        return sendJson(response, 429, {
          ok: false,
          error: '请求过于频繁，请稍后再试'
        });
      }

      if (request.method === 'GET' && requestUrl.pathname === '/api/health') {
        return sendJson(response, 200, {
          ok: true,
          service: 'bilibili-music-local-api',
          mode: 'demo',
          providers: listProviders(),
          cache: getCacheStats(),
          timestamp: new Date().toISOString()
        });
      }

      if (request.method === 'GET' && requestUrl.pathname === '/api/providers') {
        return sendJson(response, 200, {
          ok: true,
          providers: listProviders()
        });
      }

      if (request.method === 'DELETE' && requestUrl.pathname === '/api/cache') {
        return sendJson(response, 200, {
          ok: true,
          cache: clearSearchCache()
        });
      }

      if (request.method === 'GET' && requestUrl.pathname === '/api/search') {
        const keyword = requestUrl.searchParams.get('keyword') || '';
        const sort = requestUrl.searchParams.get('sort') || 'relevance';
        const duration = requestUrl.searchParams.get('duration') || 'all';
        const providerId = requestUrl.searchParams.get('provider') || 'demo';
        const limit = requestUrl.searchParams.get('limit') || '';
        const searchResult = await searchTracks({ keyword, sort, duration, providerId, limit });
        const apiOrigin = getApiOrigin(request);

        return sendJson(response, 200, {
          ok: true,
          source: searchResult.provider.id,
          provider: searchResult.provider,
          cache: searchResult.cache,
          pagination: searchResult.pagination,
          complianceNotice: searchResult.provider.complianceNotice,
          tracks: absolutizeTrackAssets(searchResult.tracks, apiOrigin)
        });
      }

      return sendJson(response, 404, {
        ok: false,
        error: '接口不存在'
      });
    } catch (error) {
      if (error instanceof ProviderError) {
        return sendJson(response, error.statusCode, {
          ok: false,
          error: error.message,
          code: error.code,
          details: error.details
        });
      }

      return sendJson(response, 500, {
        ok: false,
        error: error.message || '服务异常'
      });
    }
  });
}

export function startApiServer({ port = 8787, host = '127.0.0.1' } = {}) {
  const server = createApiServer();
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve(server);
    });
  });
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  response.end(JSON.stringify(payload));
}

function getApiOrigin(request) {
  const host = request.headers.host || '127.0.0.1:8787';
  return `http://${host}`;
}

function absolutizeTrackAssets(tracks, apiOrigin) {
  return tracks.map((track) => ({
    ...track,
    cover: toAbsoluteApiUrl(track.cover, apiOrigin)
  }));
}

function toAbsoluteApiUrl(url, apiOrigin) {
  if (typeof url !== 'string') return url;
  if (url.startsWith('/api/')) return `${apiOrigin}${url}`;
  return url;
}
