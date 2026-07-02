const storageKey = 'biliwave.preferences.v1';
const exportSchemaVersion = 1;
const allowedModes = new Set(['list', 'single', 'shuffle']);
const allowedSorts = new Set(['relevance', 'latest', 'views']);
const allowedDurations = new Set(['all', 'short', 'medium', 'long']);
const bilibiliVideoBaseUrl = 'https://www.bilibili.com/video';
const bilibiliVideoUrlPattern = /bilibili\.com\/video\//i;
const bvidTokenPattern = /\bBV[0-9A-Za-z]{6,20}\b/i;
const avTokenPattern = /(?:^|[^\w])av(\d+)(?:$|[^\w])/i;

const defaults = {
  selectedProvider: 'bilibili',
  providerDefaultMigratedToBilibili: true,
  volume: 72,
  mode: 'list',
  queue: [],
  history: [],
  playlists: [
    {
      id: 'playlist-default',
      name: '我的 B 站音乐',
      description: '本地收藏的 Bilibili 音乐内容',
      tracks: [],
      createdAt: new Date(0).toISOString()
    }
  ],
  selectedPlaylistId: 'playlist-default',
  desktopSettings: {
    closeToTray: true,
    startMinimized: false,
    defaultProvider: 'bilibili',
    providerDefaultMigratedToBilibili: true
  },
  currentTrack: null,
  playbackState: {
    trackId: '',
    positionSeconds: 0,
    source: 'none',
    updatedAt: ''
  },
  lyricsByTrackId: {},
  query: 'Bilibili 音乐',
  sort: 'relevance',
  duration: 'all'
};

export function loadPreferences() {
  if (typeof window === 'undefined') return defaults;

  try {
    const rawValue = window.localStorage.getItem(storageKey);
    if (!rawValue) return defaults;
    return sanitizePreferences(JSON.parse(rawValue));
  } catch {
    return defaults;
  }
}

export function savePreferences(preferences) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(sanitizePreferences(preferences)));
  } catch {
    // Local storage can be unavailable in private or restricted browser contexts.
  }
}

export function resetPreferences() {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // Local storage can be unavailable in private or restricted browser contexts.
    }
  }

  return createDefaultPreferences();
}

export function createDefaultPreferences() {
  return sanitizePreferences(defaults);
}

export function createPreferencesExport(preferences, appInfo = {}) {
  return {
    app: 'BiliWave',
    schemaVersion: exportSchemaVersion,
    exportedAt: new Date().toISOString(),
    appVersion: typeof appInfo.version === 'string' ? appInfo.version : '',
    preferences: sanitizePreferences(preferences)
  };
}

export function parsePreferencesExport(value) {
  let parsedValue = value;

  if (typeof value === 'string') {
    try {
      parsedValue = JSON.parse(value);
    } catch {
      throw new Error('导入文件不是有效的 JSON');
    }
  }

  const raw = parsedValue && typeof parsedValue === 'object' ? parsedValue : {};
  const importablePreferences = raw.preferences && typeof raw.preferences === 'object' ? raw.preferences : raw;
  const preferences = sanitizePreferences(importablePreferences);

  return {
    schemaVersion: Number(raw.schemaVersion) || 0,
    appVersion: typeof raw.appVersion === 'string' ? raw.appVersion : '',
    exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '',
    preferences
  };
}

export function clearPreferenceData(preferences, dataType) {
  const currentPreferences = sanitizePreferences(preferences);

  if (dataType === 'history') {
    return {
      ...currentPreferences,
      history: []
    };
  }

  if (dataType === 'playlists') {
    const defaultPreferences = createDefaultPreferences();
    return {
      ...currentPreferences,
      playlists: defaultPreferences.playlists,
      selectedPlaylistId: defaultPreferences.selectedPlaylistId
    };
  }

  if (dataType === 'queue') {
    return {
      ...currentPreferences,
      queue: []
    };
  }

  if (dataType === 'playback') {
    return {
      ...currentPreferences,
      currentTrack: null,
      playbackState: defaults.playbackState
    };
  }

  if (dataType === 'lyrics') {
    return {
      ...currentPreferences,
      lyricsByTrackId: {}
    };
  }

  return currentPreferences;
}

export function sanitizePreferences(value) {
  const raw = value && typeof value === 'object' ? value : {};
  const playlists = sanitizePlaylists(raw.playlists);
  const hasMigratedProviderDefault =
    raw.providerDefaultMigratedToBilibili === true || raw.desktopSettings?.providerDefaultMigratedToBilibili === true;
  const selectedProvider =
    raw.selectedProvider === 'demo' && !hasMigratedProviderDefault
      ? 'bilibili'
      : typeof raw.selectedProvider === 'string'
        ? raw.selectedProvider
        : defaults.selectedProvider;
  const rawSelectedPlaylistId =
    typeof raw.selectedPlaylistId === 'string' ? raw.selectedPlaylistId : defaults.selectedPlaylistId;
  const selectedPlaylistId = playlists.some((playlist) => playlist.id === rawSelectedPlaylistId)
    ? rawSelectedPlaylistId
    : playlists[0]?.id || defaults.selectedPlaylistId;

  return {
    selectedProvider,
    providerDefaultMigratedToBilibili: true,
    volume: clampNumber(raw.volume, 0, 100, defaults.volume),
    mode: allowedModes.has(raw.mode) ? raw.mode : defaults.mode,
    queue: sanitizeTrackList(raw.queue, 40),
    history: sanitizeTrackList(raw.history, 20),
    playlists,
    selectedPlaylistId,
    desktopSettings: sanitizeDesktopSettings(raw.desktopSettings),
    currentTrack: normalizeSavedTrack(raw.currentTrack),
    playbackState: sanitizePlaybackState(raw.playbackState),
    lyricsByTrackId: sanitizeLyricsMap(raw.lyricsByTrackId),
    query: typeof raw.query === 'string' && raw.query.trim() ? raw.query : defaults.query,
    sort: allowedSorts.has(raw.sort) ? raw.sort : defaults.sort,
    duration: allowedDurations.has(raw.duration) ? raw.duration : defaults.duration
  };
}

export function sanitizePlaybackState(value) {
  const raw = value && typeof value === 'object' ? value : {};
  const source = ['none', 'native', 'bilibili'].includes(raw.source) ? raw.source : defaults.playbackState.source;

  return {
    trackId: typeof raw.trackId === 'string' ? raw.trackId : defaults.playbackState.trackId,
    positionSeconds: clampNumber(raw.positionSeconds, 0, 60 * 60 * 8, defaults.playbackState.positionSeconds),
    source,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : defaults.playbackState.updatedAt
  };
}

function sanitizeDesktopSettings(value) {
  const raw = value && typeof value === 'object' ? value : {};
  const requestedDefaultProvider =
    typeof raw.defaultProvider === 'string' && raw.defaultProvider.trim()
      ? raw.defaultProvider
      : defaults.desktopSettings.defaultProvider;
  const shouldMigrateLegacyDefaultProvider =
    requestedDefaultProvider === 'demo' && raw.providerDefaultMigratedToBilibili !== true;

  return {
    closeToTray: typeof raw.closeToTray === 'boolean' ? raw.closeToTray : defaults.desktopSettings.closeToTray,
    startMinimized: typeof raw.startMinimized === 'boolean' ? raw.startMinimized : defaults.desktopSettings.startMinimized,
    defaultProvider: shouldMigrateLegacyDefaultProvider ? 'bilibili' : requestedDefaultProvider,
    providerDefaultMigratedToBilibili: true
  };
}

function sanitizePlaylists(value) {
  const source = Array.isArray(value) && value.length > 0 ? value : defaults.playlists;
  const seen = new Set();
  const playlists = source
    .filter((playlist) => playlist && typeof playlist === 'object')
    .map((playlist, index) => {
      const fallbackId = `playlist-${index + 1}`;
      const id = typeof playlist.id === 'string' && playlist.id.trim() ? playlist.id : fallbackId;
      if (seen.has(id)) return null;
      seen.add(id);

      return {
        id,
        name: typeof playlist.name === 'string' && playlist.name.trim() ? playlist.name.trim().slice(0, 36) : '未命名歌单',
        description:
          typeof playlist.description === 'string'
            ? playlist.description.trim().slice(0, 120)
            : '',
        tracks: sanitizeTrackList(playlist.tracks, 200),
        createdAt: typeof playlist.createdAt === 'string' ? playlist.createdAt : new Date().toISOString()
      };
    })
    .filter(Boolean);

  return playlists.length > 0 ? playlists : defaults.playlists;
}

function sanitizeTrackList(value, limit) {
  if (!Array.isArray(value)) return [];

  const tracks = [];
  for (const item of value) {
    const track = normalizeSavedTrack(item);
    if (!track) continue;
    tracks.push(track);
    if (tracks.length >= limit) break;
  }

  return tracks;
}

function sanitizeLyricsMap(value) {
  const raw = value && typeof value === 'object' ? value : {};
  const entries = Object.entries(raw)
    .filter(([trackId, lyric]) => typeof trackId === 'string' && trackId.trim() && lyric && typeof lyric === 'object')
    .map(([trackId, lyric]) => {
      const lines = Array.isArray(lyric.lines)
        ? lyric.lines
            .map((line, index) => ({
              id: typeof line?.id === 'string' ? line.id : `line-${index}`,
              time: Number.isFinite(Number(line?.time)) ? Number(line.time) : null,
              text: typeof line?.text === 'string' ? line.text.slice(0, 500) : ''
            }))
            .filter((line) => line.text.trim())
            .slice(0, 500)
        : [];
      const rawText = typeof lyric.raw === 'string' ? lyric.raw.slice(0, 80_000) : '';

      if (!rawText && lines.length === 0) return null;

      return [
        trackId,
        {
          source: typeof lyric.source === 'string' ? lyric.source.slice(0, 40) : 'manual',
          raw: rawText,
          type: lyric.type === 'lrc' ? 'lrc' : lyric.type === 'text' ? 'text' : lines.some((line) => line.time !== null) ? 'lrc' : 'text',
          lines,
          offsetMs: clampNumber(lyric.offsetMs, -30_000, 30_000, 0),
          updatedAt: typeof lyric.updatedAt === 'string' ? lyric.updatedAt : ''
        }
      ];
    })
    .filter(Boolean)
    .slice(0, 500);

  return Object.fromEntries(entries);
}

function clampNumber(value, min, max, fallback) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  return Math.min(max, Math.max(min, numberValue));
}

function normalizeSavedTrack(value) {
  if (!value || typeof value !== 'object') return null;

  const bv =
    normalizeBilibiliBvid(value.bv) ||
    normalizeBilibiliBvid(value.bvid) ||
    extractBilibiliBvid(value.sourceUrl) ||
    extractBilibiliBvid(value.id);
  const aid =
    normalizeBilibiliAid(value.aid) ||
    extractBilibiliAid(value.sourceUrl) ||
    normalizeBilibiliAid(value.id);
  const sourceUrl = normalizeTrackSourceUrl(value.sourceUrl, bv, aid);
  const isBilibiliTrack = value.externalOnly === true || Boolean(bv || aid || isBilibiliVideoUrl(sourceUrl));
  const id = normalizeTrackId(value.id, bv, aid);
  const title = normalizeTrackTitle(value.title, value.rawTitle, isBilibiliTrack);

  if (!id || !title) return null;

  if (isBilibiliTrack) {
    return normalizeBilibiliSavedTrack(value, {
      id,
      title,
      bv,
      aid,
      sourceUrl
    });
  }

  if (typeof value.audioUrl !== 'string') return null;

  return {
    ...value,
    id,
    title
  };
}

function normalizeBilibiliSavedTrack(value, normalized) {
  const track = {
    ...value,
    id: normalized.id,
    title: normalized.title,
    rawTitle: normalizeString(value.rawTitle) || normalized.title,
    audioUrl: '',
    playable: false,
    externalOnly: true
  };
  const uploader = normalizeString(value.uploader);
  const artist = normalizeString(value.artist) || uploader;
  const viewCount = normalizeOptionalNumber(value.viewCount);
  const views = normalizeViewsLabel(value.views, viewCount);

  if (normalized.bv) track.bv = normalized.bv;
  if (normalized.aid) track.aid = normalized.aid;
  if (normalized.sourceUrl) track.sourceUrl = normalized.sourceUrl;
  if (uploader) track.uploader = uploader;
  if (artist) track.artist = artist;
  if (viewCount !== null) track.viewCount = viewCount;
  if (views) {
    track.views = views;
  } else if (typeof value.views !== 'string') {
    delete track.views;
  }

  return track;
}

function normalizeTrackId(value, bv, aid) {
  const id = normalizeString(value);
  if (id) return id;
  if (bv || aid) return `bilibili-${bv || aid}`;
  return '';
}

function normalizeTrackTitle(title, rawTitle, isBilibiliTrack) {
  return normalizeString(title) || normalizeString(rawTitle) || (isBilibiliTrack ? 'Bilibili video' : '');
}

function normalizeTrackSourceUrl(value, bv, aid) {
  const sourceUrl = normalizeString(value);
  if (sourceUrl) return sourceUrl;
  if (bv || aid) return `${bilibiliVideoBaseUrl}/${bv || aid}/`;
  return '';
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isBilibiliVideoUrl(value) {
  return bilibiliVideoUrlPattern.test(String(value || ''));
}

function normalizeBilibiliBvid(value) {
  const text = normalizeString(value);
  if (!text) return '';
  const match = text.match(bvidTokenPattern);
  if (match) return `BV${match[0].slice(2)}`;
  return '';
}

function extractBilibiliBvid(value) {
  const match = String(value || '').match(bvidTokenPattern);
  return match ? `BV${match[0].slice(2)}` : '';
}

function normalizeBilibiliAid(value) {
  if (value === null || value === undefined) return '';
  const text = String(value).trim();
  if (!text) return '';
  const match = text.match(/^(?:av)?(\d+)$/i);
  return match ? `av${match[1]}` : '';
}

function extractBilibiliAid(value) {
  const match = String(value || '').match(avTokenPattern);
  return match ? `av${match[1]}` : '';
}

function normalizeOptionalNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function normalizeViewsLabel(value, viewCount) {
  const label = normalizeString(value);
  if (label && label !== '0') return label;

  const numericValue = Number(value);
  if (Number.isFinite(numericValue) && numericValue > 0) return String(numericValue);
  if (viewCount !== null && viewCount > 0) return String(viewCount);
  return '';
}
