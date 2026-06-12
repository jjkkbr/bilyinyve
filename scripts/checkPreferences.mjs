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
  history: [nativeTrack]
});
assert(sanitizedPreferences.currentTrack.id === bilibiliTrack.id, 'current Bilibili track should persist');
assert(sanitizedPreferences.playbackState.trackId === bilibiliTrack.id, 'playback state should persist in preferences');
assert(sanitizedPreferences.queue[0].id === bilibiliTrack.id, 'Bilibili queue item should persist');
assert(sanitizedPreferences.history[0].id === nativeTrack.id, 'native history item should persist');

const exportPayload = createPreferencesExport(sanitizedPreferences, { version: '0.1.9' });
assert(exportPayload.app === 'BiliWave', 'export payload should identify BiliWave');
assert(exportPayload.schemaVersion === 1, 'export payload should include schema version');
assert(exportPayload.preferences.queue[0].id === bilibiliTrack.id, 'export payload should persist queue');

const parsedExport = parsePreferencesExport(JSON.stringify(exportPayload));
assert(parsedExport.preferences.currentTrack.id === bilibiliTrack.id, 'parsed export should restore current track');
assert(parsedExport.preferences.playbackState.source === 'bilibili', 'parsed export should restore playback source');

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
