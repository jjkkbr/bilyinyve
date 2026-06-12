const allowedImageHosts = new Set(['i0.hdslb.com', 'i1.hdslb.com', 'i2.hdslb.com']);
const fallbackImageUrl = 'https://i0.hdslb.com/bfs/archive/transparent.png';

const imageHeaders = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
  Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
  Referer: 'https://www.bilibili.com/'
};

export function toImageProxyUrl(rawUrl) {
  const imageUrl = normalizeBilibiliImageUrl(rawUrl);
  if (isFallbackImageUrl(imageUrl)) return '';
  return `/api/image-proxy?url=${encodeURIComponent(imageUrl)}`;
}

export function normalizeBilibiliImageUrl(rawUrl) {
  if (!rawUrl) return fallbackImageUrl;
  if (rawUrl.startsWith('//')) return `https:${rawUrl}`;
  if (rawUrl.startsWith('http://')) return rawUrl.replace(/^http:\/\//, 'https://');
  return rawUrl;
}

export function isFallbackImageUrl(url) {
  return String(url || '').includes('/bfs/archive/transparent.png');
}

export async function proxyImage(requestUrl, response) {
  const rawTarget = requestUrl.searchParams.get('url') || '';
  let targetUrl;

  try {
    targetUrl = new URL(normalizeBilibiliImageUrl(rawTarget));
  } catch {
    return sendImageError(response, 400, '图片地址无效');
  }

  if (targetUrl.protocol !== 'https:' || !allowedImageHosts.has(targetUrl.hostname)) {
    return sendImageError(response, 400, '图片域名不允许代理');
  }

  try {
    const upstream = await fetch(targetUrl, {
      headers: imageHeaders
    });

    if (!upstream.ok) {
      return sendImageError(response, upstream.status, '图片加载失败');
    }

    const contentType = upstream.headers.get('content-type') || 'image/jpeg';
    const buffer = Buffer.from(await upstream.arrayBuffer());

    response.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400',
      'Access-Control-Allow-Origin': '*'
    });
    response.end(buffer);
  } catch {
    sendImageError(response, 502, '图片代理请求失败');
  }
}

function sendImageError(response, statusCode, message) {
  response.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*'
  });
  response.end(message);
}
