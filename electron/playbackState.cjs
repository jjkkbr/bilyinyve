const defaultDesktopPlaybackState = {
  hasTrack: false,
  trackId: '',
  title: '',
  artist: '',
  source: 'none',
  isPlaying: false,
  positionText: '00:00',
  durationText: '00:00',
  statusText: ''
};

function sanitizeDesktopPlaybackState(value = {}) {
  const raw = value && typeof value === 'object' ? value : {};
  const source = ['none', 'native', 'bilibili'].includes(raw.source) ? raw.source : defaultDesktopPlaybackState.source;
  const title = sanitizeText(raw.title, '', 80);
  const hasTrack = raw.hasTrack === true || Boolean(title);

  return {
    hasTrack,
    trackId: sanitizeText(raw.trackId, '', 120),
    title: hasTrack ? title || '未知曲目' : '',
    artist: sanitizeText(raw.artist, '', 80),
    source: hasTrack ? source : 'none',
    isPlaying: raw.isPlaying === true,
    positionText: sanitizeTimeText(raw.positionText),
    durationText: sanitizeTimeText(raw.durationText),
    statusText: sanitizeText(raw.statusText, '', 100)
  };
}

function createTrayMenuTemplate({ playbackState, isMiniMode = false, actions = {} } = {}) {
  const state = sanitizeDesktopPlaybackState(playbackState);
  const sourceLabel = getSourceLabel(state.source);
  const playbackLabel = state.isPlaying ? '暂停' : '播放';
  const timeLabel = state.hasTrack
    ? `${sourceLabel} · ${state.positionText} / ${state.durationText}`
    : '尚未播放';
  const titleLabel = state.hasTrack
    ? `${state.isPlaying ? '正在播放' : '已暂停'}：${truncateLabel(state.title, 32)}`
    : '尚未播放';

  return [
    {
      label: titleLabel,
      enabled: false
    },
    {
      label: state.hasTrack ? truncateLabel(state.artist || timeLabel, 36) : '选择一首音乐开始播放',
      enabled: false
    },
    {
      label: timeLabel,
      enabled: false
    },
    { type: 'separator' },
    {
      label: playbackLabel,
      enabled: state.hasTrack,
      click: actions.togglePlay || noop
    },
    {
      label: '上一首',
      enabled: state.hasTrack,
      click: actions.previous || noop
    },
    {
      label: '下一首',
      enabled: state.hasTrack,
      click: actions.next || noop
    },
    { type: 'separator' },
    {
      label: '显示 BiliWave',
      click: actions.showMainWindow || noop
    },
    {
      label: isMiniMode ? '退出迷你模式' : '迷你模式',
      click: actions.toggleMiniMode || noop
    },
    { type: 'separator' },
    {
      label: '退出',
      click: actions.quit || noop
    }
  ];
}

function createTrayToolTip(playbackState) {
  const state = sanitizeDesktopPlaybackState(playbackState);
  if (!state.hasTrack) return 'BiliWave';
  return truncateLabel(`BiliWave - ${state.isPlaying ? '正在播放' : '已暂停'}：${state.title}`, 120);
}

function createWindowTitle(playbackState) {
  const state = sanitizeDesktopPlaybackState(playbackState);
  if (!state.hasTrack) return 'BiliWave';
  return `${truncateLabel(state.title, 72)} - BiliWave`;
}

function getSourceLabel(source) {
  if (source === 'bilibili') return 'B站音频';
  if (source === 'native') return '本地音频';
  return '未播放';
}

function sanitizeTimeText(value) {
  const text = sanitizeText(value, defaultDesktopPlaybackState.positionText, 12);
  return /^\d{1,3}:\d{2}$/.test(text) ? text : defaultDesktopPlaybackState.positionText;
}

function sanitizeText(value, fallback, maxLength) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return truncateLabel(trimmed.replace(/\s+/g, ' '), maxLength);
}

function truncateLabel(value, maxLength) {
  const text = String(value || '');
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

function noop() {}

module.exports = {
  createTrayMenuTemplate,
  createTrayToolTip,
  createWindowTitle,
  defaultDesktopPlaybackState,
  sanitizeDesktopPlaybackState
};
