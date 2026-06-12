const {
  createTrayMenuTemplate,
  createTrayToolTip,
  createWindowTitle,
  sanitizeDesktopPlaybackState
} = require('../electron/playbackState.cjs');

const playingState = sanitizeDesktopPlaybackState({
  hasTrack: true,
  trackId: 'bilibili-BV1xx411c7mD',
  title: 'A very good Bilibili song',
  artist: 'UP 主：Tester',
  source: 'bilibili',
  isPlaying: true,
  positionText: '07:12',
  durationText: '34:15',
  statusText: 'B站官方播放器已连接'
});

assert(playingState.hasTrack === true, 'track state should keep hasTrack');
assert(playingState.source === 'bilibili', 'Bilibili source should persist');
assert(playingState.isPlaying === true, 'playing flag should persist');
assert(playingState.positionText === '07:12', 'position text should persist');
assert(playingState.durationText === '34:15', 'duration text should persist');

const invalidState = sanitizeDesktopPlaybackState({
  title: '',
  source: 'remote',
  positionText: 'bad',
  durationText: 'also-bad'
});

assert(invalidState.hasTrack === false, 'missing title should become empty desktop state');
assert(invalidState.source === 'none', 'invalid source should fallback');
assert(invalidState.positionText === '00:00', 'invalid position should fallback');
assert(invalidState.durationText === '00:00', 'invalid duration should fallback');

const fallbackTitleState = sanitizeDesktopPlaybackState({
  hasTrack: true,
  title: '',
  source: 'native'
});
assert(fallbackTitleState.hasTrack === true, 'explicit track state should keep hasTrack');
assert(fallbackTitleState.title === '未知曲目', 'explicit track state should use fallback title');

let toggled = false;
const trayTemplate = createTrayMenuTemplate({
  playbackState: playingState,
  isMiniMode: false,
  actions: {
    togglePlay: () => {
      toggled = true;
    }
  }
});

assert(trayTemplate[0].label === '正在播放：A very good Bilibili song', 'tray title should show playing track');
assert(trayTemplate.some((item) => item.label === '暂停' && item.enabled === true), 'tray should expose pause action');
assert(trayTemplate.some((item) => item.label === 'B站音频 · 07:12 / 34:15'), 'tray should expose Bilibili time');

const toggleItem = trayTemplate.find((item) => item.label === '暂停');
toggleItem.click();
assert(toggled === true, 'tray action should call handler');

const emptyTemplate = createTrayMenuTemplate({ playbackState: invalidState });
assert(emptyTemplate[0].label === '尚未播放', 'empty tray title should be clear');
assert(emptyTemplate.find((item) => item.label === '播放').enabled === false, 'empty tray playback action should be disabled');

assert(createTrayToolTip(playingState) === 'BiliWave - 正在播放：A very good Bilibili song', 'tooltip should include current track');
assert(createTrayToolTip(invalidState) === 'BiliWave', 'empty tooltip should use app name');
assert(createWindowTitle(playingState) === 'A very good Bilibili song - BiliWave', 'window title should include current track');
assert(createWindowTitle(invalidState) === 'BiliWave', 'empty window title should use app name');

console.log('Desktop playback state checks passed');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
