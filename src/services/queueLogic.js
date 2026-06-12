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

export function getNextQueueTrack({ currentTrack, mode, queue }) {
  if (!Array.isArray(queue) || queue.length === 0) return null;

  const currentIndex = currentTrack ? queue.findIndex((item) => item.id === currentTrack.id) : -1;

  if (mode === 'shuffle') {
    return queue[Math.floor(Math.random() * queue.length)];
  }

  if (mode === 'single') {
    return currentTrack || queue[0];
  }

  return queue[(currentIndex + 1 + queue.length) % queue.length];
}

export function getPreviousQueueTrack({ currentTrack, queue }) {
  if (!Array.isArray(queue) || queue.length === 0) return null;
  const currentIndex = currentTrack ? queue.findIndex((item) => item.id === currentTrack.id) : 0;
  return queue[(currentIndex - 1 + queue.length) % queue.length];
}
