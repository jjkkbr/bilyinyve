import {
  clearPreferenceData,
  createDefaultPreferences,
  createPreferencesExport,
  loadPreferences,
  parsePreferencesExport,
  sanitizePlaybackState,
  sanitizePreferences,
  savePreferences
} from '../src/services/preferences.js';
import { canPlayFromQueue } from '../src/services/queueLogic.js';

const bilibiliTrack = {
  id: 'bilibili-BV1xx411c7mD',
  title: 'Bilibili demo',
  externalOnly: true,
  bv: 'BV1xx411c7mD',
  sourceUrl: 'https://www.bilibili.com/video/BV1xx411c7mD/',
  durationSeconds: 360
};

const nativeTrack = {
  id: 'demo-native',
  title: 'Native demo',
  audioUrl: 'https://example.test/audio.mp3',
  durationSeconds: 240
};

const legacyBilibiliUrlTrack = {
  id: 'legacy-fav-BV1xx411c7mD',
  title: 'Legacy favorite from old version',
  sourceUrl: 'https://www.bilibili.com/video/BV1xx411c7mD/',
  uploader: 'Original UP',
  artist: 'Original UP',
  viewCount: 123456,
  views: '12.3万',
  cover: 'https://example.test/cover.jpg'
};

const legacyBilibiliBvidTrack = {
  id: 'legacy-bvid-only',
  title: 'Legacy bvid field',
  bvid: 'BV1zz411c7mZ',
  uploader: 'BVID UP',
  views: '8.8万'
};

const legacyBilibiliAidTrack = {
  id: 'legacy-av-url',
  title: 'Legacy av url',
  sourceUrl: 'https://www.bilibili.com/video/av170001/',
  uploader: 'AV UP',
  views: '6.1万'
};

const legacyBilibiliZeroViewsTrack = {
  id: 'legacy-zero-views',
  title: 'Legacy zero views',
  sourceUrl: 'https://www.bilibili.com/video/BV1yy411c7mY/',
  uploader: 'Zero View UP',
  viewCount: 654321,
  views: '0'
};

const sanitizedBilibiliState = sanitizePlaybackState({
  trackId: bilibiliTrack.id,
  positionSeconds: 123.8,
  source: 'bilibili',
  updatedAt: '2026-06-08T00:00:00.000Z'
});
assert(sanitizedBilibiliState.trackId === bilibiliTrack.id, 'Bilibili track id should persist');
assert(sanitizedBilibiliState.positionSeconds === 123.8, 'Bilibili position should persist');
assert(sanitizedBilibiliState.source === 'bilibili', 'Bilibili source should persist');

const clampedState = sanitizePlaybackState({
  trackId: nativeTrack.id,
  positionSeconds: 60 * 60 * 12,
  source: 'native'
});
assert(clampedState.positionSeconds === 60 * 60 * 8, 'playback position should clamp to 8 hours');
assert(clampedState.source === 'native', 'native source should persist');

const invalidState = sanitizePlaybackState({
  trackId: 123,
  positionSeconds: 'not-a-number',
  source: 'remote'
});
assert(invalidState.trackId === '', 'invalid track id should fallback');
assert(invalidState.positionSeconds === 0, 'invalid position should fallback');
assert(invalidState.source === 'none', 'invalid source should fallback');

const sanitizedPreferences = sanitizePreferences({
  currentTrack: bilibiliTrack,
  playbackState: sanitizedBilibiliState,
  queue: [bilibiliTrack],
  history: [nativeTrack],
  lyricsByTrackId: {
    [bilibiliTrack.id]: {
      source: 'local-lrc',
      raw: '[00:01.00]Hello BiliWave',
      type: 'lrc',
      lines: [{ id: 'line-1', time: 1, text: 'Hello BiliWave' }],
      offsetMs: 500,
      updatedAt: '2026-06-15T00:00:00.000Z'
    }
  }
});
assert(sanitizedPreferences.currentTrack.id === bilibiliTrack.id, 'current Bilibili track should persist');
assert(sanitizedPreferences.playbackState.trackId === bilibiliTrack.id, 'playback state should persist in preferences');
assert(sanitizedPreferences.queue[0].id === bilibiliTrack.id, 'Bilibili queue item should persist');
assert(sanitizedPreferences.history[0].id === nativeTrack.id, 'native history item should persist');
assert(
  sanitizedPreferences.lyricsByTrackId[bilibiliTrack.id].lines[0].text === 'Hello BiliWave',
  'lyrics should persist by track id'
);
assert(sanitizedPreferences.lyricsByTrackId[bilibiliTrack.id].offsetMs === 500, 'lyrics offset should persist');

const sanitizedLegacyPreferences = sanitizePreferences({
  currentTrack: legacyBilibiliUrlTrack,
  queue: [legacyBilibiliBvidTrack, legacyBilibiliZeroViewsTrack],
  history: [legacyBilibiliAidTrack],
  playlists: [
    {
      id: 'playlist-default',
      name: 'Legacy favorites',
      tracks: [legacyBilibiliUrlTrack],
      createdAt: '2026-06-01T00:00:00.000Z'
    }
  ]
});
const sanitizedLegacyTrack = sanitizedLegacyPreferences.playlists[0].tracks[0];
assert(sanitizedLegacyPreferences.currentTrack?.bv === 'BV1xx411c7mD', 'legacy current track should extract BV from source URL');
assert(sanitizedLegacyPreferences.currentTrack.externalOnly === true, 'legacy current track should become Bilibili audio track');
assert(sanitizedLegacyTrack.bv === 'BV1xx411c7mD', 'legacy favorite should extract BV from source URL');
assert(sanitizedLegacyTrack.externalOnly === true, 'legacy favorite should be marked external-only');
assert(sanitizedLegacyTrack.sourceUrl === legacyBilibiliUrlTrack.sourceUrl, 'legacy favorite source URL should persist');
assert(sanitizedLegacyTrack.uploader === 'Original UP', 'legacy favorite uploader should persist');
assert(sanitizedLegacyTrack.artist === 'Original UP', 'legacy favorite artist should persist');
assert(sanitizedLegacyTrack.views === '12.3万', 'legacy favorite views label should persist');
assert(sanitizedLegacyTrack.viewCount === 123456, 'legacy favorite view count should persist');
assert(canPlayFromQueue(sanitizedLegacyTrack) === true, 'legacy favorite should be playable from queue');
assert(sanitizedLegacyPreferences.queue[0].bv === 'BV1zz411c7mZ', 'legacy bvid field should normalize to bv');
assert(
  sanitizedLegacyPreferences.queue[0].sourceUrl === 'https://www.bilibili.com/video/BV1zz411c7mZ/',
  'legacy bvid track should get a source URL'
);
assert(sanitizedLegacyPreferences.queue[1].views === '654321', 'legacy zero views label should fallback to real view count');
assert(sanitizedLegacyPreferences.history[0].aid === 'av170001', 'legacy av URL should extract aid');
assert(sanitizedLegacyPreferences.history[0].externalOnly === true, 'legacy av URL should become external-only');

const exportPayload = createPreferencesExport(sanitizedPreferences, { version: '0.1.9' });
assert(exportPayload.app === 'BiliWave', 'export payload should identify BiliWave');
assert(exportPayload.schemaVersion === 1, 'export payload should include schema version');
assert(exportPayload.preferences.queue[0].id === bilibiliTrack.id, 'export payload should persist queue');
assert(exportPayload.preferences.lyricsByTrackId[bilibiliTrack.id], 'export payload should persist lyrics');

const parsedExport = parsePreferencesExport(JSON.stringify(exportPayload));
assert(parsedExport.preferences.currentTrack.id === bilibiliTrack.id, 'parsed export should restore current track');
assert(parsedExport.preferences.playbackState.source === 'bilibili', 'parsed export should restore playback source');
assert(parsedExport.preferences.lyricsByTrackId[bilibiliTrack.id].type === 'lrc', 'parsed export should restore lyrics');

const parsedLegacyExport = parsePreferencesExport(sanitizedPreferences);
assert(parsedLegacyExport.preferences.history[0].id === nativeTrack.id, 'legacy preference import should still work');

const clearedHistory = clearPreferenceData(sanitizedPreferences, 'history');
assert(clearedHistory.history.length === 0, 'history clearing should remove history');
assert(clearedHistory.queue.length === 1, 'history clearing should keep queue');

const clearedQueue = clearPreferenceData(sanitizedPreferences, 'queue');
assert(clearedQueue.queue.length === 0, 'queue clearing should remove queue');

const clearedPlayback = clearPreferenceData(sanitizedPreferences, 'playback');
assert(clearedPlayback.currentTrack === null, 'playback clearing should remove current track');
assert(clearedPlayback.playbackState.source === 'none', 'playback clearing should reset source');

const clearedLyrics = clearPreferenceData(sanitizedPreferences, 'lyrics');
assert(Object.keys(clearedLyrics.lyricsByTrackId).length === 0, 'lyrics clearing should remove saved lyrics');

const resetPlaylists = clearPreferenceData(sanitizedPreferences, 'playlists');
assert(resetPlaylists.playlists.length === 1, 'playlist reset should keep a default playlist');
assert(resetPlaylists.playlists[0].tracks.length === 0, 'playlist reset should clear saved tracks');
assert(
  resetPlaylists.selectedPlaylistId === createDefaultPreferences().selectedPlaylistId,
  'playlist reset should select the default playlist'
);

let invalidImportFailed = false;
try {
  parsePreferencesExport('{bad json');
} catch {
  invalidImportFailed = true;
}
assert(invalidImportFailed, 'invalid JSON import should fail clearly');

const storage = new Map();
globalThis.window = {
  localStorage: {
    getItem(key) {
      return storage.has(key) ? storage.get(key) : null;
    },
    setItem(key, value) {
      storage.set(key, value);
    }
  }
};

savePreferences({
  ...sanitizedPreferences,
  playbackState: {
    trackId: bilibiliTrack.id,
    positionSeconds: 98,
    source: 'bilibili',
    updatedAt: '2026-06-08T00:00:00.000Z'
  }
});

const loadedPreferences = loadPreferences();
assert(loadedPreferences.currentTrack.id === bilibiliTrack.id, 'saved current track should load');
assert(loadedPreferences.playbackState.trackId === bilibiliTrack.id, 'saved playback track id should load');
assert(loadedPreferences.playbackState.positionSeconds === 98, 'saved playback position should load');
assert(loadedPreferences.playbackState.source === 'bilibili', 'saved playback source should load');

console.log('Preference persistence checks passed');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
