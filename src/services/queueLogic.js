export function canPlayInApp(track) {
  return Boolean(track?.audioUrl && !track.externalOnly && track.playable !== false);
}

export function canPlayFromQueue(track) {
  return canPlayInApp(track) || Boolean(track?.externalOnly && (track.bv || track.aid || track.sourceUrl));
}

export function appendUniqueTrack(items, track) {
  if (!track || items.some((item) => item.id === track.id)) return items;
  return [...items, track];
}

export function appendUniqueTracks(items, tracks) {
  const queue = Array.isArray(items) ? items : [];
  const incomingTracks = Array.isArray(tracks) ? tracks : [];
  const seenIds = new Set(queue.map((item) => item.id));
  const additions = [];

  for (const track of incomingTracks) {
    if (!canPlayFromQueue(track) || seenIds.has(track.id)) continue;
    seenIds.add(track.id);
    additions.push(track);
  }

  return additions.length > 0 ? [...queue, ...additions] : queue;
}

export function prependNewTrack(items, track) {
  if (!track) return items;
  if (items.some((item) => item.id === track.id)) return items;
  return [track, ...items];
}

export function moveQueueTrack(items, trackId, direction) {
  if (!Array.isArray(items) || items.length < 2) return items;

  const fromIndex = items.findIndex((item) => item.id === trackId);
  if (fromIndex < 0) return items;

  const offset = direction === 'up' ? -1 : direction === 'down' ? 1 : 0;
  if (offset === 0) return items;

  const toIndex = fromIndex + offset;
  if (toIndex < 0 || toIndex >= items.length) return items;

  const nextItems = [...items];
  const [movingTrack] = nextItems.splice(fromIndex, 1);
  nextItems.splice(toIndex, 0, movingTrack);
  return nextItems;
}

export function getNextQueueTrack({ currentTrack, mode, queue, random = Math.random }) {
  if (!Array.isArray(queue) || queue.length === 0) return null;

  const currentIndex = getCurrentQueueTrackIndex({ currentTrack, queue });

  if (mode === 'shuffle') {
    return getRandomQueueTrack({ currentTrack, queue, random });
  }

  if (mode === 'single') {
    return currentTrack || queue[0];
  }

  return queue[(currentIndex + 1 + queue.length) % queue.length];
}

export function getRandomQueueTrack({ currentTrack, queue, random = Math.random }) {
  if (!Array.isArray(queue) || queue.length === 0) return null;

  const currentIndex = getCurrentQueueTrackIndex({ currentTrack, queue });
  const candidates =
    currentTrack && queue.length > 1
      ? queue.filter((item, index) => index !== currentIndex && !isSameQueueIdentity(item, currentTrack))
      : queue;
  const safeRandom = Math.min(0.999999, Math.max(0, Number(random()) || 0));
  return candidates[Math.floor(safeRandom * candidates.length)] || candidates[0] || null;
}

export function getPreviousQueueTrack({ currentTrack, queue }) {
  if (!Array.isArray(queue) || queue.length === 0) return null;
  const currentIndex = currentTrack ? getCurrentQueueTrackIndex({ currentTrack, queue }) : 0;
  return queue[(currentIndex - 1 + queue.length) % queue.length];
}

export function getCurrentQueueTrackIndex({ currentTrack, queue }) {
  if (!currentTrack || !Array.isArray(queue) || queue.length === 0) return -1;

  const exactIds = getQueueIdentityValues(currentTrack);
  const exactIndex = queue.findIndex((item) => hasSharedIdentity(getQueueIdentityValues(item), exactIds));
  if (exactIndex >= 0) return exactIndex;

  const baseIds = getQueueBaseIdentityValues(currentTrack);
  if (baseIds.size === 0) return -1;

  return queue.findIndex((item) => hasSharedIdentity(getQueueBaseIdentityValues(item), baseIds));
}

export function getNextBilibiliPart(track) {
  if (!track?.externalOnly) return null;
  const parts = Array.isArray(track.parts) ? track.parts : [];
  if (parts.length < 2) return null;

  const currentPartIndex = getCurrentBilibiliPartIndex(track);
  return currentPartIndex >= 0 ? parts[currentPartIndex + 1] || null : null;
}

export function getCurrentBilibiliPartIndex(track) {
  if (!track?.externalOnly) return -1;
  const parts = Array.isArray(track.parts) ? track.parts : [];
  if (parts.length === 0) return -1;

  const bvids = getBilibiliBvidValues(track);
  if (bvids.size > 0) {
    const bvidIndex = parts.findIndex((part) => {
      const partBvids = getBilibiliBvidValues(part);
      return [...partBvids].some((value) => bvids.has(value));
    });
    if (bvidIndex >= 0) return bvidIndex;
  }

  const aids = getBilibiliAidValues(track);
  if (aids.size > 0) {
    const aidIndex = parts.findIndex((part) => {
      const partAids = getBilibiliAidValues(part);
      return [...partAids].some((value) => aids.has(value));
    });
    if (aidIndex >= 0) return aidIndex;
  }

  const cid = normalizeComparableValue(track.cid);
  if (cid) {
    const cidIndex = parts.findIndex((part) => normalizeComparableValue(part.cid) === cid);
    if (cidIndex >= 0) return cidIndex;
  }

  const title = normalizeComparableTitle(track.rawTitle || track.title);
  if (title) {
    const titleIndex = parts.findIndex((part) => {
      const partTitle = normalizeComparableTitle(part.rawTitle || part.title);
      return partTitle && (partTitle === title || partTitle.includes(title) || title.includes(partTitle));
    });
    if (titleIndex >= 0) return titleIndex;
  }

  const id = normalizeComparableValue(track.id);
  if (id) {
    const idIndex = parts.findIndex((part) => {
      const page = Number(part.page || 1);
      return id.includes(`-p${page}-`) || id.endsWith(`-p${page}`);
    });
    if (idIndex >= 0) return idIndex;
  }

  const currentPage = Number(track.page || 1);
  return parts.findIndex((part) => Number(part.page || 1) === currentPage);
}

function normalizeComparableValue(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim().toLowerCase();
}

function isSameQueueIdentity(item, currentTrack) {
  return hasSharedIdentity(getQueueIdentityValues(item), getQueueIdentityValues(currentTrack)) ||
    hasSharedIdentity(getQueueBaseIdentityValues(item), getQueueBaseIdentityValues(currentTrack));
}

function getQueueIdentityValues(track) {
  return new Set(
    [track?.id, track?.queueParentId, track?.parentId]
      .map(normalizeComparableValue)
      .filter(Boolean)
  );
}

function getQueueBaseIdentityValues(track) {
  return new Set(
    [track?.id, track?.queueParentId, track?.parentId]
      .map(normalizeComparableValue)
      .map(stripBilibiliPartSuffix)
      .filter(Boolean)
  );
}

function hasSharedIdentity(leftValues, rightValues) {
  if (!leftValues?.size || !rightValues?.size) return false;
  return [...leftValues].some((value) => rightValues.has(value));
}

function stripBilibiliPartSuffix(value) {
  return normalizeComparableValue(value).replace(/-p\d+(?:-[^-]+)?$/i, '');
}

function getBilibiliBvidValues(item) {
  const values = [normalizeBilibiliBvid(item?.bv), normalizeBilibiliBvid(item?.bvid), extractBilibiliBvid(item?.sourceUrl)];
  return new Set(values.filter(Boolean));
}

function getBilibiliAidValues(item) {
  const values = [normalizeBilibiliAid(item?.aid), extractBilibiliAid(item?.sourceUrl)];
  return new Set(values.filter(Boolean));
}

function normalizeBilibiliBvid(value) {
  const text = normalizeComparableValue(value);
  if (!text) return '';
  const match = text.match(/\bbv[0-9a-z]+\b/i);
  return match ? match[0].toLowerCase() : text.startsWith('bv') ? text : '';
}

function normalizeBilibiliAid(value) {
  const text = normalizeComparableValue(value);
  if (!text) return '';
  const match = text.match(/^av?(\d+)$/i);
  return match ? `av${match[1]}` : '';
}

function extractBilibiliBvid(value) {
  const match = String(value || '').match(/\bBV[0-9A-Za-z]+\b/i);
  return match ? match[0].toLowerCase() : '';
}

function extractBilibiliAid(value) {
  const match = String(value || '').match(/(?:^|[^\w])av(\d+)(?:$|[^\w])/i);
  return match ? `av${match[1]}` : '';
}

function normalizeComparableTitle(value) {
  return normalizeComparableValue(value).replace(/[\s《》【】\[\]（）()「」『』"'“”‘’·,，.。!！?？:：;；_-]+/g, '');
}
