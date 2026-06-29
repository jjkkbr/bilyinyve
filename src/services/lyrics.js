const timestampPattern = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

export function createLyricEntry(rawText, options = {}) {
  const parsed = parseLyrics(rawText);
  return {
    source: typeof options.source === 'string' ? options.source : parsed.type,
    raw: parsed.raw,
    type: parsed.type,
    lines: parsed.lines,
    offsetMs: clampNumber(options.offsetMs, -30_000, 30_000, 0),
    updatedAt: typeof options.updatedAt === 'string' ? options.updatedAt : new Date().toISOString()
  };
}

export function parseLyrics(value) {
  const raw = typeof value === 'string' ? value.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim() : '';
  if (!raw) {
    return {
      raw: '',
      type: 'empty',
      lines: []
    };
  }

  const timedLines = parseTimedLyrics(raw);
  if (timedLines.length > 0) {
    return {
      raw,
      type: 'lrc',
      lines: timedLines
    };
  }

  return {
    raw,
    type: 'text',
    lines: raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((text, index) => ({
        id: `text-${index}`,
        time: null,
        text
      }))
  };
}

export function getActiveLyricIndex(entry, currentSeconds) {
  const lines = Array.isArray(entry?.lines) ? entry.lines : [];
  if (lines.length === 0 || entry?.type !== 'lrc') return -1;

  const adjustedSeconds = Math.max(0, Number(currentSeconds) + (Number(entry.offsetMs) || 0) / 1000);
  let activeIndex = -1;

  for (let index = 0; index < lines.length; index += 1) {
    const time = Number(lines[index].time);
    if (!Number.isFinite(time)) continue;
    if (time > adjustedSeconds) break;
    activeIndex = index;
  }

  return activeIndex;
}

export function getLyricPreview(entry, maxLines = 3) {
  const lines = Array.isArray(entry?.lines) ? entry.lines : [];
  return lines
    .slice(0, Math.max(1, Number(maxLines) || 3))
    .map((line) => line.text)
    .join('\n');
}

function parseTimedLyrics(raw) {
  const timedLines = [];

  raw.split('\n').forEach((sourceLine, sourceIndex) => {
    timestampPattern.lastIndex = 0;
    const timestamps = [];
    let match;

    while ((match = timestampPattern.exec(sourceLine)) !== null) {
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      const fraction = normalizeFraction(match[3]);
      const time = minutes * 60 + seconds + fraction;
      if (Number.isFinite(time)) timestamps.push(time);
    }

    if (timestamps.length === 0) return;

    const text = sourceLine.replace(timestampPattern, '').trim();
    timestamps.forEach((time, timeIndex) => {
      timedLines.push({
        id: `lrc-${sourceIndex}-${timeIndex}`,
        time,
        text: text || '...'
      });
    });
  });

  return timedLines.sort((left, right) => left.time - right.time);
}

function normalizeFraction(value) {
  if (!value) return 0;
  const padded = value.padEnd(3, '0').slice(0, 3);
  return Number(`0.${padded}`) || 0;
}

function clampNumber(value, min, max, fallback) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  return Math.min(max, Math.max(min, numberValue));
}
