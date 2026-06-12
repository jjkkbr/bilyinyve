import { ProviderError } from '../providerError.js';
import { formatDuration, formatViews } from '../metadata.js';
import { classifyBilibiliQuery } from './queryClassifier.js';
import { normalizeBilibiliImageUrl, toImageProxyUrl } from '../imageProxy.js';

const bilibiliViewApi = 'https://api.bilibili.com/x/web-interface/view';
const bilibiliSearchApi = 'https://api.bilibili.com/x/web-interface/search/type';
const bilibiliSearchPageUrl = 'https://search.bilibili.com/video';
const bilibiliVideoBaseUrl = 'https://www.bilibili.com/video';
const bilibiliSearchPageSize = 20;
const maxBilibiliSearchPages = 5;
const maxHtmlFallbackMetadataFetches = 24;
const htmlFallbackConcurrency = 4;
const bilibiliRequestTimeoutMs = 7_000;
const bilibiliRetryDelayMs = 450;
const anonymousBilibiliCookie = createAnonymousBilibiliCookie();
const requestHeaders = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  Referer: 'https://www.bilibili.com/'
};

export const bilibiliProvider = {
  id: 'bilibili',
  name: 'Bilibili 公开视频',
  mode: 'external',
  authorized: false,
  configured: true,
  canStream: false,
  canDownload: false,
  description: '通过标题关键词、BV 号或 B站视频链接读取公开视频元数据，并跳转到 B站原视频播放。',
  complianceNotice:
    '当前仅读取公开视频元数据并打开 B站原视频；不解析音频、不下载、不绕过会员、付费、版权或地区限制。',
  async search({ keyword, limit }) {
    const query = classifyBilibiliQuery(keyword);

    if (query.type === 'empty') {
      return [];
    }

    if (query.type === 'keyword') {
      return searchPublicVideos(query.value, limit);
    }

    const videoData = await fetchVideoMetadata(query);
    return [toTrack(videoData)];
  }
};

async function fetchVideoMetadata(query) {
  const apiData = await fetchVideoMetadataFromApi(query);
  if (apiData) return apiData;

  if (query.type === 'bv') {
    const pageData = await fetchVideoMetadataFromPage(query.value);
    if (pageData) return pageData;
  }

  throw new ProviderError('未找到可访问的 Bilibili 公开视频', {
    code: 'BILIBILI_VIDEO_NOT_FOUND',
    statusCode: 404,
    details: {
      provider: 'bilibili',
      queryType: query.type,
      normalizedQuery: query.value
    }
  });
}

async function searchPublicVideos(keyword, limit = 40) {
  const safeLimit = Math.min(100, Math.max(1, Math.floor(Number(limit) || 40)));
  const pageCount = Math.min(maxBilibiliSearchPages, Math.ceil(safeLimit / bilibiliSearchPageSize));
  const results = [];
  let firstPageError = null;

  for (let page = 1; page <= pageCount && results.length < safeLimit; page += 1) {
    let payload;
    try {
      payload = await fetchSearchPage(keyword, page);
    } catch (error) {
      if (page === 1 || results.length === 0) {
        firstPageError = error;
        break;
      }
      break;
    }
    const pageResults = Array.isArray(payload.data?.result) ? payload.data.result : [];
    results.push(...pageResults);
    if (pageResults.length === 0) break;
  }

  const apiTracks = mapVideoSearchResultsToTracks(results, safeLimit);
  if (apiTracks.length > 0) return apiTracks;

  const fallbackTracks = await searchPublicVideosFromHtml(keyword, safeLimit);
  if (fallbackTracks.length > 0) return fallbackTracks;

  if (firstPageError) throw firstPageError;
  return [];
}

function mapVideoSearchResultsToTracks(results, limit) {
  const seen = new Set();
  return results
    .filter((item) => item?.type === 'video' && (item.bvid || item.aid))
    .filter((item) => {
      const id = item.bvid || item.aid;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .slice(0, limit)
    .map(toTrack);
}

async function fetchSearchPage(keyword, page) {
  const requestUrl = new URL(bilibiliSearchApi);
  requestUrl.searchParams.set('search_type', 'video');
  requestUrl.searchParams.set('keyword', keyword);
  requestUrl.searchParams.set('page', String(page));
  requestUrl.searchParams.set('page_size', String(bilibiliSearchPageSize));

  const payload = await fetchJson(requestUrl, createSearchRequestHeaders(keyword));
  if (payload?.code === -412) {
    throw new ProviderError('Bilibili 搜索触发访问限制，请稍后重试或改用 BV 号/视频链接', {
      code: 'BILIBILI_SEARCH_RATE_LIMITED',
      statusCode: 429,
      details: {
        provider: 'bilibili',
        keyword,
        page,
        payloadMessage: payload.message
      }
    });
  }

  if (!payload || payload.code !== 0) {
    throw new ProviderError('Bilibili 标题搜索暂不可用', {
      code: 'BILIBILI_SEARCH_UNAVAILABLE',
      statusCode: 502,
      details: {
        provider: 'bilibili',
        keyword,
        page,
        payloadCode: payload?.code,
        payloadMessage: payload?.message
      }
    });
  }

  return payload;
}

async function searchPublicVideosFromHtml(keyword, limit) {
  const bvids = await fetchSearchBvidsFromHtml(keyword, Math.min(limit, maxHtmlFallbackMetadataFetches));
  if (bvids.length === 0) return [];
  return fetchTracksByBvids(bvids, Math.min(limit, maxHtmlFallbackMetadataFetches));
}

async function fetchSearchBvidsFromHtml(keyword, limit) {
  const pageCount = Math.min(2, Math.ceil(limit / bilibiliSearchPageSize));
  const bvids = [];
  const seen = new Set();

  for (let page = 1; page <= pageCount && bvids.length < limit; page += 1) {
    const requestUrl = new URL(bilibiliSearchPageUrl);
    requestUrl.searchParams.set('keyword', keyword);
    requestUrl.searchParams.set('page', String(page));

    try {
      const response = await fetchWithTimeout(requestUrl, {
        headers: createSearchRequestHeaders(keyword, 'text/html,application/xhtml+xml')
      });
      if (!response.ok) break;

      const html = await response.text();
      for (const match of html.matchAll(/\bBV[0-9A-Za-z]{10}\b/g)) {
        const bvid = `BV${match[0].slice(2)}`;
        if (seen.has(bvid)) continue;
        seen.add(bvid);
        bvids.push(bvid);
        if (bvids.length >= limit) break;
      }
    } catch {
      break;
    }
  }

  return bvids;
}

async function fetchTracksByBvids(bvids, limit) {
  const orderedTracks = [];
  let cursor = 0;

  async function worker() {
    while (cursor < bvids.length) {
      const index = cursor;
      cursor += 1;

      try {
        const videoData = await fetchVideoMetadata({
          type: 'bv',
          value: bvids[index]
        });
        orderedTracks[index] = toTrack(videoData);
      } catch {
        // Skip individual fallback items that are no longer public or accessible.
      }
    }
  }

  const workerCount = Math.min(htmlFallbackConcurrency, bvids.length);
  await Promise.all(Array.from({ length: workerCount }, worker));
  return orderedTracks.filter(Boolean).slice(0, limit);
}

async function fetchVideoMetadataFromApi(query) {
  const requestUrl = new URL(bilibiliViewApi);
  if (query.type === 'bv') {
    requestUrl.searchParams.set('bvid', query.value);
  } else {
    requestUrl.searchParams.set('aid', query.value.replace(/^av/i, ''));
  }

  const payload = await fetchJson(requestUrl);
  if (!payload || payload.code !== 0 || !payload.data) return null;
  return payload.data;
}

async function fetchVideoMetadataFromPage(bvid) {
  const sourceUrl = `${bilibiliVideoBaseUrl}/${bvid}/`;
  const response = await fetchWithTimeout(sourceUrl, {
    headers: requestHeaders
  });

  if (!response.ok) return null;
  const html = await response.text();
  const initialState = parseInitialState(html);
  if (initialState?.videoData) return initialState.videoData;

  const title = decodeHtml(getMetaContent(html, 'name="title"') || getTitle(html));
  if (!title) return null;

  return {
    bvid,
    title: stripBilibiliSuffix(title),
    pic: normalizeBilibiliImageUrl(
      getMetaContent(html, 'property="og:image"') || getMetaContent(html, 'itemprop="image"')
    ),
    desc: decodeHtml(getMetaContent(html, 'name="description"') || ''),
    owner: {
      name: decodeHtml(getMetaContent(html, 'name="author"') || 'Bilibili UP 主')
    },
    stat: {
      view: extractViewCount(html)
    },
    duration: extractDurationFromPlayInfo(html),
    pubdate: Date.now() / 1000
  };
}

async function fetchJson(url, headers = requestHeaders) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, { headers });
      return await response.json();
    } catch {
      if (attempt === 1) return null;
      await delay(bilibiliRetryDelayMs);
    }
  }

  return null;
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), bilibiliRequestTimeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createSearchRequestHeaders(keyword, accept = 'application/json, text/plain, */*') {
  const refererUrl = new URL(bilibiliSearchPageUrl);
  refererUrl.searchParams.set('keyword', keyword);

  return {
    ...requestHeaders,
    Accept: accept,
    Referer: refererUrl.toString(),
    Origin: 'https://search.bilibili.com',
    Cookie: anonymousBilibiliCookie
  };
}

function createAnonymousBilibiliCookie() {
  const timestamp = Math.floor(Date.now() / 1000);
  const uuid = `${randomHex(8)}-${randomHex(4)}-${randomHex(4)}-${randomHex(4)}-${randomHex(12)}`;

  return [
    `buvid3=${randomHex(32)}infoc`,
    `b_nut=${timestamp}`,
    `_uuid=${uuid}infoc`,
    `buvid4=${randomHex(32)}-${Date.now()}-0-0`,
    `b_lsid=${randomHex(8)}_${timestamp.toString(16).toUpperCase()}`
  ].join('; ');
}

function randomHex(length) {
  return Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16).toUpperCase()).join('');
}

function parseInitialState(html) {
  const marker = 'window.__INITIAL_STATE__=';
  const start = html.indexOf(marker);
  if (start < 0) return null;

  const jsonStart = start + marker.length;
  const jsonEnd = html.indexOf(';(function()', jsonStart);
  if (jsonEnd < 0) return null;

  try {
    return JSON.parse(html.slice(jsonStart, jsonEnd));
  } catch {
    return null;
  }
}

function toTrack(videoData) {
  const bvid = videoData.bvid || '';
  const aid = videoData.aid ? `av${videoData.aid}` : '';
  const parts = getVideoParts(videoData);
  const durationSeconds = getDurationSeconds(videoData);
  const sourceUrl = `${bilibiliVideoBaseUrl}/${bvid || aid}/`;
  const viewCount = Number(videoData.stat?.view || videoData.play || 0);
  const title = cleanSearchText(videoData.title || 'Bilibili 视频');
  const uploader = cleanSearchText(videoData.owner?.name || videoData.author || 'Bilibili UP 主');
  const description = cleanSearchText(videoData.desc || videoData.description || '');

  return {
    id: `bilibili-${bvid || aid}`,
    title,
    rawTitle: title,
    artist: `UP 主：${uploader}`,
    uploader,
    category: cleanSearchText(videoData.typename || videoData.tname || 'B站视频'),
    duration: formatDuration(durationSeconds),
    durationSeconds,
    viewCount,
    views: formatViews(viewCount),
    publishedAt: formatPublishedAt(videoData.pubdate || videoData.ctime),
    bv: bvid,
    aid,
    page: 1,
    cid: parts[0]?.cid || videoData.cid || null,
    parts,
    sourceUrl,
    cover: toImageProxyUrl(videoData.pic),
    rawCover: normalizeBilibiliImageUrl(videoData.pic),
    audioUrl: '',
    playable: false,
    externalOnly: true,
    lyric: description || '该结果来自 Bilibili 公开视频元数据。请打开原视频在 B站观看或播放。',
    compliance: {
      sourceLabel: 'Bilibili 公开视频',
      downloadable: false,
      externalOnly: true,
      notice: bilibiliProvider.complianceNotice
    }
  };
}

function getVideoParts(videoData) {
  const seasonParts = getSeasonParts(videoData);
  if (seasonParts.length > 1) return seasonParts;

  const pages = Array.isArray(videoData.pages) ? videoData.pages : [];
  return pages
    .map((page, index) => {
      const pageNumber = Number(page.page || index + 1);
      const durationSeconds = getDurationSeconds(page);
      const title = cleanSearchText(page.part || page.title || `P${pageNumber}`);

      return {
        page: Number.isFinite(pageNumber) && pageNumber > 0 ? pageNumber : index + 1,
        cid: page.cid || null,
        title,
        duration: formatDuration(durationSeconds),
        durationSeconds
      };
    })
    .filter((part) => part.title || part.cid);
}

function getSeasonParts(videoData) {
  const sections = Array.isArray(videoData.ugc_season?.sections) ? videoData.ugc_season.sections : [];
  const episodes = sections.flatMap((section) => (Array.isArray(section.episodes) ? section.episodes : []));

  return episodes
    .map((episode, index) => {
      const pageNumber = index + 1;
      const arc = episode.arc || {};
      const durationSeconds = getDurationSeconds(episode) || getDurationSeconds(arc);
      const bvid = episode.bvid || arc.bvid || '';
      const aid = episode.aid || arc.aid || '';
      const title = cleanSearchText(episode.title || arc.title || `选集 ${pageNumber}`);

      return {
        page: pageNumber,
        cid: episode.cid || arc.cid || null,
        bvid,
        aid: aid ? `av${aid}` : '',
        title,
        duration: formatDuration(durationSeconds),
        durationSeconds,
        cover: toImageProxyUrl(episode.cover || arc.pic),
        rawCover: normalizeBilibiliImageUrl(episode.cover || arc.pic),
        sourceUrl: bvid ? `${bilibiliVideoBaseUrl}/${bvid}/` : aid ? `${bilibiliVideoBaseUrl}/av${aid}/` : ''
      };
    })
    .filter((part) => part.title || part.bvid || part.cid);
}

function getDurationSeconds(videoData) {
  const duration = videoData.duration || videoData.pages?.[0]?.duration || videoData.duration_seconds || 0;
  if (typeof duration === 'number') return duration;
  if (typeof duration !== 'string') return 0;

  const parts = duration.split(':').map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part))) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

function cleanSearchText(value) {
  return decodeHtml(String(value || '').replace(/<[^>]+>/g, '')).trim();
}

function formatPublishedAt(timestamp) {
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || seconds <= 0) return new Date().toISOString();
  return new Date(seconds * 1000).toISOString();
}

function getMetaContent(html, selectorFragment) {
  const pattern = new RegExp(`<meta[^>]+${selectorFragment}[^>]+content=["']([^"']+)["'][^>]*>`, 'i');
  return html.match(pattern)?.[1] || '';
}

function getTitle(html) {
  return html.match(/<title>(.*?)<\/title>/i)?.[1] || '';
}

function stripBilibiliSuffix(title) {
  return title.replace(/_哔哩哔哩_bilibili$/i, '').trim();
}

function decodeHtml(value) {
  return String(value)
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function extractViewCount(html) {
  const description = getMetaContent(html, 'name="description"');
  const match = description.match(/视频播放量\s*([0-9.]+)(万)?/);
  if (!match) return 0;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return 0;
  return match[2] ? Math.round(value * 10000) : Math.round(value);
}

function extractDurationFromPlayInfo(html) {
  const marker = 'window.__playinfo__=';
  const start = html.indexOf(marker);
  if (start < 0) return 0;
  const jsonStart = start + marker.length;
  const jsonEnd = html.indexOf('</script>', jsonStart);
  if (jsonEnd < 0) return 0;

  try {
    const playInfo = JSON.parse(html.slice(jsonStart, jsonEnd));
    const milliseconds = Number(playInfo?.data?.timelength || 0);
    return milliseconds > 0 ? Math.round(milliseconds / 1000) : 0;
  } catch {
    return 0;
  }
}
