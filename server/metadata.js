const noisePatterns = [
  /【.*?】/g,
  /\[.*?\]/g,
  /\s*-\s*原创电子音乐/g,
  /\s*1 小时学习版/g,
  /\s*全场收录/g
];

export function cleanTitle(rawTitle) {
  return noisePatterns
    .reduce((title, pattern) => title.replace(pattern, ''), rawTitle)
    .replace(/\s+/g, ' ')
    .trim();
}

export function formatDuration(seconds) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safeSeconds / 60).toString().padStart(2, '0');
  const rest = Math.floor(safeSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${rest}`;
}

export function formatViews(viewCount) {
  const count = Number(viewCount) || 0;
  if (count >= 10000) {
    const value = count / 10000;
    return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}万`;
  }
  return String(count);
}

export function normalizeTrack(track) {
  const title = cleanTitle(track.rawTitle);

  return {
    id: track.id,
    title,
    rawTitle: track.rawTitle,
    artist: `UP 主：${track.uploader}`,
    uploader: track.uploader,
    category: track.category,
    duration: formatDuration(track.durationSeconds),
    durationSeconds: track.durationSeconds,
    viewCount: track.viewCount,
    views: formatViews(track.viewCount),
    publishedAt: track.publishedAt,
    bv: track.bv,
    sourceUrl: track.sourceUrl,
    cover: track.cover,
    audioUrl: track.audioUrl,
    lyric: track.lyric,
    compliance: {
      sourceLabel: '演示数据',
      downloadable: false
    }
  };
}
