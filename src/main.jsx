import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Clock,
  Database,
  Disc3,
  Download,
  ExternalLink,
  Filter,
  Heart,
  History,
  Home,
  Library,
  Maximize2,
  Minus,
  ListMusic,
  Loader2,
  Mic2,
  MoreHorizontal,
  Music2,
  PanelBottom,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Repeat,
  RotateCcw,
  Search,
  Settings,
  Shuffle,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Trash2,
  Upload,
  Volume2,
  X
} from 'lucide-react';
import './styles.css';
import { clearSearchCache, getMusicProviders, searchBilibiliMusic } from './services/bilibiliMusic.js';
import { createLyricEntry, getActiveLyricIndex, getLyricPreview } from './services/lyrics.js';
import {
  clearPreferenceData,
  createDefaultPreferences,
  createPreferencesExport,
  loadPreferences,
  parsePreferencesExport,
  resetPreferences,
  savePreferences,
  sanitizePreferences
} from './services/preferences.js';
import {
  appendUniqueTrack,
  appendUniqueTracks,
  canPlayFromQueue,
  canPlayInApp,
  getCurrentBilibiliPartIndex,
  getNextBilibiliPart,
  getNextQueueTrack,
  getPreviousQueueTrack,
  getRandomQueueTrack,
  moveQueueTrack,
  prependNewTrack
} from './services/queueLogic.js';

const navItems = [
  { id: 'discover', label: '发现音乐', icon: Home },
  { id: 'search', label: '搜索结果', icon: Search },
  { id: 'playlists', label: '我的歌单', icon: Library },
  { id: 'history', label: '播放历史', icon: History },
  { id: 'settings', label: '设置', icon: Settings }
];

const featuredKeywords = ['洛天依', '周杰伦 翻唱', '游戏 OST', 'city pop', 'livehouse', '钢琴纯音乐'];
const initialSearchLimit = 40;
const searchLoadMoreStep = 20;
const maxSearchLimit = 100;
const virtualTrackRowHeight = 79;
const virtualQueueRowHeight = 74;
const playbackPreferenceSaveIntervalMs = 10_000;
const bilibiliAudibleStartupCheckMs = 1_000;
const bilibiliAudibleWatchdogMs = 8_000;
const bilibiliAudibleStartupAttempts = 24;
const bilibiliAudibleWatchdogMisses = 4;
const desktopApi = typeof window !== 'undefined' ? window.biliwaveDesktop : null;
const fallbackCover =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="12" fill="#edf4f0"/><circle cx="48" cy="48" r="28" fill="#d4e4da"/><circle cx="48" cy="48" r="8" fill="#0f463d"/><path d="M59 22v31.5a9.5 9.5 0 1 1-5-8.4V27l20-4v7l-15 3z" fill="#0f463d"/></svg>'
  );

function handleImageError(event) {
  if (event.currentTarget.src === fallbackCover) return;
  event.currentTarget.src = fallbackCover;
}

function getCoverSrc(track) {
  return track?.cover || fallbackCover;
}

function getTrackBaseId(track) {
  return String(track?.parentId || track?.id || '').replace(/-p\d+(?:-[^-]+)?$/i, '');
}

function withBilibiliPageUrl(sourceUrl, page) {
  if (!sourceUrl || !page) return sourceUrl;
  try {
    const url = new URL(sourceUrl);
    url.searchParams.set('p', String(page));
    return url.toString();
  } catch {
    const separator = sourceUrl.includes('?') ? '&' : '?';
    return `${sourceUrl}${separator}p=${page}`;
  }
}

function createBilibiliPartTrack(track, part) {
  const baseId = getTrackBaseId(track);
  const page = Number(part?.page || 1);
  const title = part?.title || track.title;
  const bvid = part?.bvid || track.bv;
  const aid = part?.aid || track.aid;
  const sourceUrl = part?.sourceUrl || withBilibiliPageUrl(track.sourceUrl, page);

  return {
    ...track,
    id: `${baseId}-p${page}-${bvid || aid || ''}`,
    parentId: baseId,
    title,
    rawTitle: title,
    page,
    bv: bvid,
    aid,
    cid: part?.cid || track.cid,
    cover: part?.cover || track.cover,
    rawCover: part?.rawCover || track.rawCover,
    duration: part?.duration || track.duration,
    durationSeconds: part?.durationSeconds || track.durationSeconds,
    sourceUrl,
    isCollectionPart: Boolean(part?.isCollectionPart)
  };
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '00:00';
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60).toString().padStart(2, '0');
  const rest = (safeSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${rest}`;
}

function formatLyricOffset(offsetMs = 0) {
  const seconds = (Number(offsetMs) || 0) / 1000;
  if (seconds === 0) return '0.0s';
  return `${seconds > 0 ? '+' : ''}${seconds.toFixed(1)}s`;
}

function clampLyricOffset(offsetMs) {
  const numberValue = Number(offsetMs);
  if (!Number.isFinite(numberValue)) return 0;
  return Math.min(30_000, Math.max(-30_000, Math.round(numberValue)));
}

function getRestoredPlayback(track, playbackState) {
  const emptyState = {
    source: 'none',
    trackId: '',
    positionSeconds: 0,
    progressPercent: 0
  };

  if (!track || !playbackState || playbackState.trackId !== track.id) return emptyState;

  const source = track.externalOnly ? 'bilibili' : canPlayInApp(track) ? 'native' : 'none';
  if (source === 'none' || playbackState.source !== source) return emptyState;

  const durationSeconds = Number(track.durationSeconds) || 0;
  const savedSeconds = Math.max(0, Math.floor(Number(playbackState.positionSeconds) || 0));
  const positionSeconds = durationSeconds > 0 ? Math.min(savedSeconds, Math.max(0, durationSeconds - 1)) : savedSeconds;
  const progressPercent = durationSeconds > 0 ? Math.min(100, (positionSeconds / durationSeconds) * 100) : 0;

  return {
    source,
    trackId: track.id,
    positionSeconds,
    progressPercent
  };
}

function createRestoreStatusText(track, restoredPlayback) {
  if (!track) return '正在连接本地搜索服务';
  if (restoredPlayback.source !== 'none' && restoredPlayback.positionSeconds > 0) {
    return `已恢复上次播放到 ${formatTime(restoredPlayback.positionSeconds)}，点击播放继续`;
  }
  return '已恢复上次播放状态，点击播放继续';
}

function createPlaybackState(track, { nativePlaybackTime = 0, bilibiliPlaybackTime = 0 } = {}) {
  if (!track) {
    return {
      trackId: '',
      positionSeconds: 0,
      source: 'none',
      updatedAt: new Date().toISOString()
    };
  }

  const source = track.externalOnly ? 'bilibili' : canPlayInApp(track) ? 'native' : 'none';
  const positionSeconds =
    source === 'bilibili'
      ? Math.max(0, Math.floor(Number(bilibiliPlaybackTime) || 0))
      : source === 'native'
        ? Math.max(0, Math.floor(Number(nativePlaybackTime) || 0))
        : 0;

  return {
    trackId: source === 'none' ? '' : track.id,
    positionSeconds,
    source,
    updatedAt: new Date().toISOString()
  };
}

function createDesktopPlaybackState(track, { currentTime = 0, durationSeconds = 0, isPlaying = false, statusText = '' } = {}) {
  if (!track) {
    return {
      hasTrack: false,
      trackId: '',
      title: '',
      artist: '',
      source: 'none',
      isPlaying: false,
      positionText: '00:00',
      durationText: '00:00',
      statusText
    };
  }

  return {
    hasTrack: true,
    trackId: track.id,
    title: track.title || '未知曲目',
    artist: track.artist || track.uploader || '',
    source: track.externalOnly ? 'bilibili' : 'native',
    isPlaying,
    positionText: formatTime(currentTime),
    durationText: formatTime(durationSeconds),
    statusText
  };
}

function downloadJsonFile(fileName, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function createExportFileName() {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\..+$/, '')
    .replace('T', '-');
  return `BiliWave-data-${timestamp}.json`;
}

function getClearDataStatusText(dataType) {
  if (dataType === 'history') return '播放历史已清空';
  if (dataType === 'playlists') return '所有歌单已重置';
  if (dataType === 'queue') return '播放队列已清空';
  if (dataType === 'playback') return '当前播放状态已清空';
  if (dataType === 'lyrics') return '本地歌词已清空';
  return '本地数据已更新';
}

function useStableEvent(handler) {
  const handlerRef = React.useRef(handler);

  React.useLayoutEffect(() => {
    handlerRef.current = handler;
  });

  return React.useCallback((...args) => handlerRef.current?.(...args), []);
}

function App() {
  const savedPreferences = React.useMemo(() => loadPreferences(), []);
  const restoredPlayback = React.useMemo(
    () => getRestoredPlayback(savedPreferences.currentTrack, savedPreferences.playbackState),
    [savedPreferences]
  );
  const initialPlaybackRestoreRef = React.useRef(restoredPlayback);
  const preserveRestoreStatusRef = React.useRef(Boolean(savedPreferences.currentTrack));
  const [activeNav, setActiveNav] = React.useState('discover');
  const [query, setQuery] = React.useState(savedPreferences.query);
  const [sort, setSort] = React.useState(savedPreferences.sort);
  const [duration, setDuration] = React.useState(savedPreferences.duration);
  const [results, setResults] = React.useState([]);
  const [searchResetKey, setSearchResetKey] = React.useState(0);
  const [searchLimit, setSearchLimit] = React.useState(initialSearchLimit);
  const [canLoadMore, setCanLoadMore] = React.useState(false);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [loadMoreError, setLoadMoreError] = React.useState('');
  const [queue, setQueue] = React.useState(savedPreferences.queue);
  const [history, setHistory] = React.useState(savedPreferences.history);
  const [playlists, setPlaylists] = React.useState(savedPreferences.playlists);
  const [selectedPlaylistId, setSelectedPlaylistId] = React.useState(savedPreferences.selectedPlaylistId);
  const [desktopSettings, setDesktopSettings] = React.useState(savedPreferences.desktopSettings);
  const [currentTrack, setCurrentTrack] = React.useState(savedPreferences.currentTrack);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [progress, setProgress] = React.useState(restoredPlayback.progressPercent);
  const [volume, setVolume] = React.useState(savedPreferences.volume);
  const [mode, setMode] = React.useState(savedPreferences.mode);
  const [isLoading, setIsLoading] = React.useState(false);
  const [statusText, setStatusText] = React.useState(createRestoreStatusText(savedPreferences.currentTrack, restoredPlayback));
  const [isMiniMode, setIsMiniMode] = React.useState(
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('mini')
  );
  const [providerInfo, setProviderInfo] = React.useState(null);
  const [providers, setProviders] = React.useState([]);
  const [selectedProvider, setSelectedProvider] = React.useState(savedPreferences.selectedProvider);
  const [cacheInfo, setCacheInfo] = React.useState({ hit: false });
  const [searchError, setSearchError] = React.useState(null);
  const [settingsStatus, setSettingsStatus] = React.useState('');
  const [desktopSettingsLoaded, setDesktopSettingsLoaded] = React.useState(!desktopApi?.getSettings);
  const [isWindowMaximized, setIsWindowMaximized] = React.useState(false);
  const [bilibiliAudioTrack, setBilibiliAudioTrack] = React.useState(null);
  const [isBilibiliPanelOpen, setIsBilibiliPanelOpen] = React.useState(false);
  const [bilibiliPlayerRevision, setBilibiliPlayerRevision] = React.useState(0);
  const [bilibiliPlaybackTime, setBilibiliPlaybackTime] = React.useState(
    restoredPlayback.source === 'bilibili' ? restoredPlayback.positionSeconds : 0
  );
  const [bilibiliSeekTime, setBilibiliSeekTime] = React.useState(
    restoredPlayback.source === 'bilibili' ? restoredPlayback.positionSeconds : 0
  );
  const [nativePlaybackTime, setNativePlaybackTime] = React.useState(
    restoredPlayback.source === 'native' ? restoredPlayback.positionSeconds : 0
  );
  const [nativeDuration, setNativeDuration] = React.useState(
    savedPreferences.currentTrack && !savedPreferences.currentTrack.externalOnly
      ? Number(savedPreferences.currentTrack.durationSeconds) || 0
      : 0
  );
  const [bilibiliAudioStatus, setBilibiliAudioStatus] = React.useState({
    phase: restoredPlayback.source === 'bilibili' ? 'paused' : 'idle',
    message:
      restoredPlayback.source === 'bilibili'
        ? createRestoreStatusText(savedPreferences.currentTrack, restoredPlayback)
        : '等待选择 B站音频'
  }, []);
  const [isBilibiliAudioAudible, setIsBilibiliAudioAudible] = React.useState(false);
  const [lyricsByTrackId, setLyricsByTrackId] = React.useState(savedPreferences.lyricsByTrackId);
  const [isLyricsPanelOpen, setIsLyricsPanelOpen] = React.useState(false);
  const [lyricDraft, setLyricDraft] = React.useState('');
  const [lyricStatus, setLyricStatus] = React.useState('');
  const [appInfo, setAppInfo] = React.useState({
    name: 'BiliWave',
    version: 'Web 调试',
    apiUrl: window.location.origin,
    userDataPath: '仅桌面端可用',
    cachePath: '仅桌面端可用',
    settingsPath: '仅桌面端可用',
    apiStatus: {
      preferredPort: 8787,
      actualPort: 8787,
      apiUrl: window.location.origin,
      conflictDetected: false,
      usingFallback: false,
      managedByApp: false,
      message: ''
    },
    isDev: true
  });
  const audioRef = React.useRef(null);
  const importFileInputRef = React.useRef(null);
  const lyricFileInputRef = React.useRef(null);
  const workspaceRef = React.useRef(null);
  const bilibiliPlaybackStartedAtRef = React.useRef(null);
  const bilibiliAutoReconnectRef = React.useRef({
    trackId: '',
    attempted: false
  });
  const bilibiliAutoAdvanceRef = React.useRef({
    trackId: '',
    completedAt: 0
  });
  const isDesktopApp = Boolean(desktopApi?.isDesktop);
  const playbackState = React.useMemo(
    () => createPlaybackState(currentTrack, {
      nativePlaybackTime,
      bilibiliPlaybackTime
    }),
    [bilibiliPlaybackTime, currentTrack, nativePlaybackTime]
  );
  const currentTime = currentTrack?.externalOnly ? bilibiliPlaybackTime : nativePlaybackTime;
  const durationSeconds = currentTrack?.externalOnly ? currentTrack?.durationSeconds || 0 : nativeDuration || currentTrack?.durationSeconds || 0;
  const currentLyricEntry = React.useMemo(() => {
    if (!currentTrack) return null;
    if (lyricsByTrackId[currentTrack.id]) return lyricsByTrackId[currentTrack.id];
    if (currentTrack.lyric) return createLyricEntry(currentTrack.lyric, { source: 'embedded' });
    return null;
  }, [currentTrack, lyricsByTrackId]);
  const activeLyricIndex = React.useMemo(
    () => getActiveLyricIndex(currentLyricEntry, currentTime),
    [currentLyricEntry, currentTime]
  );
  const lyricPreview = React.useMemo(() => getLyricPreview(currentLyricEntry, 4), [currentLyricEntry]);
  const desktopPlaybackState = React.useMemo(
    () => createDesktopPlaybackState(currentTrack, { currentTime, durationSeconds, isPlaying, statusText }),
    [currentTime, currentTrack, durationSeconds, isPlaying, statusText]
  );
  const currentPreferences = React.useMemo(
    () => ({
      selectedProvider,
      volume,
      mode,
      queue,
      history,
      playlists,
      selectedPlaylistId,
      desktopSettings,
      currentTrack,
      playbackState,
      lyricsByTrackId,
      query,
      sort,
      duration
    }),
    [currentTrack, desktopSettings, duration, history, lyricsByTrackId, mode, playbackState, playlists, query, queue, selectedPlaylistId, selectedProvider, sort, volume]
  );
  const immediatePreferencesKey = React.useMemo(
    () =>
      JSON.stringify({
        selectedProvider,
        volume,
        mode,
        queue,
        history,
        playlists,
        selectedPlaylistId,
        desktopSettings,
        currentTrack,
        lyricsByTrackId,
        query,
        sort,
        duration
      }),
    [currentTrack, desktopSettings, duration, history, lyricsByTrackId, mode, playlists, query, queue, selectedPlaylistId, selectedProvider, sort, volume]
  );
  const latestPreferencesRef = React.useRef(currentPreferences);
  const preferencesSaveRef = React.useRef({
    immediateKey: '',
    lastPlaybackSavedAt: 0,
    timeoutId: null
  });
  const stablePlayNextBilibiliItem = useStableEvent(playNextBilibiliItem);

  const updateBilibiliAudioStatus = React.useCallback((phase, message) => {
    setBilibiliAudioStatus({
      phase,
      message,
      updatedAt: Date.now()
    });
  }, []);

  const handleBilibiliAudioReady = React.useCallback(
    (track) => {
      if (!track) return;
      const message = `B站官方播放器已加载，正在确认声音输出：${track.title}`;
      updateBilibiliAudioStatus('ready', message);
      setStatusText(message);
    },
    [updateBilibiliAudioStatus]
  );

  const handleBilibiliAudioSlow = React.useCallback(
    (track) => {
      if (!track) return;
      const message = `B站官方播放器连接较慢，仍在等待：${track.title}`;
      updateBilibiliAudioStatus('slow', message);
      setStatusText(message);
    },
    [updateBilibiliAudioStatus]
  );

  const handleBilibiliAudioError = React.useCallback(
    (track) => {
      if (!track) return;
      const message = `B站官方播放器连接失败，可重新连接或打开原视频：${track.title}`;
      updateBilibiliAudioStatus('error', message);
      setIsBilibiliAudioAudible(false);
      setIsPlaying(false);
      setStatusText(message);
    },
    [updateBilibiliAudioStatus]
  );

  const performSearch = React.useCallback(
    async (nextQuery = query, options = {}) => {
      const trimmed = nextQuery.trim();
      const preserveStatus = options.preserveStatus === true;
      const appendResults = options.append === true;
      const requestedLimit = Math.min(
        maxSearchLimit,
        Math.max(initialSearchLimit, Math.floor(Number(options.limit) || initialSearchLimit))
      );
      if (!trimmed) {
        if (!preserveStatus) setStatusText('请输入关键词、BV 号或 UP 主名称');
        return;
      }

      setActiveNav('search');
      if (appendResults) {
        setIsLoadingMore(true);
        setLoadMoreError('');
        setStatusText(`正在加载更多“${trimmed}”结果`);
      } else {
        setIsLoading(true);
        setSearchResetKey((key) => key + 1);
        setSearchError(null);
        setLoadMoreError('');
        setSearchLimit(requestedLimit);
        setCanLoadMore(false);
        workspaceRef.current?.scrollTo?.({ top: 0, behavior: 'smooth' });
        if (!preserveStatus) setStatusText(`正在搜索“${trimmed}”`);
      }

      try {
        const searchResult = await searchBilibiliMusic({
          keyword: trimmed,
          sort,
          duration,
          provider: selectedProvider,
          limit: requestedLimit
        });
        const nextResults = searchResult.tracks;
        setResults(nextResults);
        setProviderInfo(searchResult.provider);
        setCacheInfo(searchResult.cache);
        setSearchLimit(requestedLimit);
        const hasMoreResults =
          typeof searchResult.pagination?.hasMore === 'boolean'
            ? searchResult.pagination.hasMore
            : nextResults.length >= requestedLimit;
        setCanLoadMore(
          searchResult.provider?.id === 'bilibili' &&
            hasMoreResults &&
            requestedLimit < maxSearchLimit
        );
        if (!preserveStatus) {
          setStatusText(
            searchResult.provider?.mode === 'demo'
              ? `本地演示 API 返回 ${nextResults.length} 条结果${searchResult.cache?.hit ? '，来自缓存' : ''}`
              : searchResult.provider?.mode === 'external'
                ? `已连接 B站，返回 ${nextResults.length} 条公开视频结果`
              : `找到 ${nextResults.length} 条可试听结果`
          );
        }
      } catch (error) {
        if (appendResults) {
          const message = error.message || '加载更多失败，请稍后重试';
          setLoadMoreError(message);
          setStatusText(message);
        } else {
          setResults([]);
          setCanLoadMore(false);
          setCacheInfo({ hit: false });
          setSearchError({
            message: error.message || '搜索失败，请稍后重试',
            code: error.code,
            details: error.details
          });
          if (!preserveStatus) setStatusText(error.message || '搜索失败，请稍后重试');
        }
      } finally {
        if (appendResults) {
          setIsLoadingMore(false);
        } else {
          setIsLoading(false);
        }
      }
    },
    [duration, query, selectedProvider, sort]
  );

  React.useEffect(() => {
    getMusicProviders()
      .then((nextProviders) => {
        setProviders(nextProviders);
        const matchedProvider = nextProviders.find((provider) => provider.id === selectedProvider);
        if (!matchedProvider && nextProviders[0]) {
          setSelectedProvider(nextProviders[0].id);
        }
        setProviderInfo(matchedProvider || nextProviders[0] || null);
      })
      .catch((error) => {
        if (!savedPreferences.currentTrack) {
          setStatusText(error.message || '数据源列表加载失败');
        }
      });
  }, []);

  React.useEffect(() => {
    const matchedProvider = providers.find((provider) => provider.id === selectedProvider);
    if (matchedProvider) setProviderInfo(matchedProvider);
  }, [providers, selectedProvider]);

  React.useEffect(() => {
    const preserveStatus = preserveRestoreStatusRef.current;
    preserveRestoreStatusRef.current = false;
    performSearch(query, { preserveStatus });
  }, [selectedProvider]);

  React.useEffect(() => {
    if (!isLyricsPanelOpen) return;
    setLyricDraft(currentLyricEntry?.raw || currentTrack?.lyric || '');
    setLyricStatus(currentTrack ? (currentLyricEntry ? '已切换到当前歌曲歌词' : '当前歌曲还没有歌词') : '请先选择一首歌曲');
  }, [currentTrack?.id, isLyricsPanelOpen]);

  React.useEffect(() => {
    latestPreferencesRef.current = currentPreferences;
    const saveState = preferencesSaveRef.current;
    const now = Date.now();

    const saveNow = () => {
      if (saveState.timeoutId) {
        window.clearTimeout(saveState.timeoutId);
        saveState.timeoutId = null;
      }
      savePreferences(latestPreferencesRef.current);
      saveState.lastPlaybackSavedAt = Date.now();
    };

    if (saveState.immediateKey !== immediatePreferencesKey) {
      saveState.immediateKey = immediatePreferencesKey;
      saveNow();
      return;
    }

    const elapsedMs = now - saveState.lastPlaybackSavedAt;
    if (!isPlaying || elapsedMs >= playbackPreferenceSaveIntervalMs) {
      saveNow();
      return;
    }

    if (!saveState.timeoutId) {
      saveState.timeoutId = window.setTimeout(() => {
        saveState.timeoutId = null;
        savePreferences(latestPreferencesRef.current);
        saveState.lastPlaybackSavedAt = Date.now();
      }, playbackPreferenceSaveIntervalMs - elapsedMs);
    }
  }, [currentPreferences, immediatePreferencesKey, isPlaying]);

  React.useEffect(() => {
    const flushPreferences = () => {
      const saveState = preferencesSaveRef.current;
      if (saveState.timeoutId) {
        window.clearTimeout(saveState.timeoutId);
        saveState.timeoutId = null;
      }
      savePreferences(latestPreferencesRef.current);
      saveState.lastPlaybackSavedAt = Date.now();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushPreferences();
    };

    window.addEventListener('beforeunload', flushPreferences);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('beforeunload', flushPreferences);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      flushPreferences();
    };
  }, []);

  React.useEffect(() => {
    if (!desktopSettingsLoaded) return;
    desktopApi?.updateSettings?.(desktopSettings).catch(() => {
      setStatusText('桌面设置同步失败');
    });
  }, [desktopSettings, desktopSettingsLoaded]);

  React.useEffect(() => {
    if (!desktopApi?.updatePlaybackState) return;
    desktopApi.updatePlaybackState(desktopPlaybackState).catch(() => {
      // The desktop shell can be unavailable in web debug mode.
    });
  }, [desktopPlaybackState]);

  React.useEffect(() => {
    if (!desktopApi?.getSettings) return;
    desktopApi?.getSettings?.()
      .then((settings) => {
        if (!settings) {
          setDesktopSettingsLoaded(true);
          return;
        }
        setDesktopSettings((currentSettings) => ({
          ...currentSettings,
          ...settings
        }));
        if (settings.defaultProvider) {
          setSelectedProvider(settings.defaultProvider);
        }
        setDesktopSettingsLoaded(true);
      })
      .catch(() => {
        setDesktopSettingsLoaded(true);
        setStatusText('桌面设置读取失败');
      });
  }, []);

  React.useEffect(() => {
    if (!desktopApi?.getWindowState) return;
    desktopApi
      .getWindowState()
      .then((state) => {
        setIsWindowMaximized(Boolean(state?.isMaximized));
      })
      .catch(() => {
        setIsWindowMaximized(false);
      });
  }, []);

  React.useEffect(() => {
    if (!desktopApi?.onWindowStateChange) return undefined;
    return desktopApi.onWindowStateChange((state) => {
      setIsWindowMaximized(Boolean(state?.isMaximized));
    });
  }, []);

  React.useEffect(() => {
    if (!desktopApi?.getAppInfo) return;
    desktopApi.getAppInfo()
      .then((info) => {
        if (!info) return;
        setAppInfo((currentInfo) => ({
          ...currentInfo,
          ...info
        }));
      })
      .catch(() => {
        setStatusText('应用信息读取失败');
      });
  }, []);

  React.useEffect(() => {
    if (!desktopApi?.getApiStatus) return;
    desktopApi.getApiStatus()
      .then((apiStatus) => {
        if (!apiStatus) return;
        setAppInfo((currentInfo) => ({
          ...currentInfo,
          apiStatus,
          apiPort: apiStatus.actualPort || currentInfo.apiPort,
          apiUrl: apiStatus.apiUrl || currentInfo.apiUrl
        }));
      })
      .catch(() => {
        // Older desktop builds do not expose API status; keep the app info fallback.
      });
  }, []);

  React.useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;

    if (!canPlayInApp(currentTrack)) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      setNativeDuration(0);
      setNativePlaybackTime(0);
      return undefined;
    }

    const restore = initialPlaybackRestoreRef.current;
    const shouldRestorePosition =
      restore.source === 'native' && restore.trackId === currentTrack.id && restore.positionSeconds > 0;

    if (audio.src !== currentTrack.audioUrl) {
      audio.src = currentTrack.audioUrl;
      audio.load();
    }

    setNativeDuration(Number(currentTrack.durationSeconds) || 0);

    if (!shouldRestorePosition) {
      setNativePlaybackTime(0);
      return undefined;
    }

    const applyRestorePosition = () => {
      const maxPosition =
        Number.isFinite(audio.duration) && audio.duration > 0
          ? Math.max(0, audio.duration - 1)
          : restore.positionSeconds;
      const nextPosition = Math.min(restore.positionSeconds, maxPosition);
      audio.currentTime = nextPosition;
      setNativePlaybackTime(Math.floor(nextPosition));
      if (audio.duration) setProgress((nextPosition / audio.duration) * 100);
      initialPlaybackRestoreRef.current = {
        source: 'none',
        trackId: '',
        positionSeconds: 0,
        progressPercent: 0
      };
    };

    if (audio.readyState >= 1) {
      applyRestorePosition();
      return undefined;
    }

    audio.addEventListener('loadedmetadata', applyRestorePosition, { once: true });
    return () => audio.removeEventListener('loadedmetadata', applyRestorePosition);
  }, [currentTrack]);

  React.useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const syncMetadata = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setNativeDuration(audio.duration);
      }
    };

    const syncProgress = () => {
      const nextTime = Math.max(0, Math.floor(audio.currentTime || 0));
      setNativePlaybackTime((currentValue) => (currentValue === nextTime ? currentValue : nextTime));
      if (!audio.duration) return;
      setProgress((audio.currentTime / audio.duration) * 100);
    };

    const syncEnded = () => {
      setNativePlaybackTime(0);
      setProgress(0);
      playNext();
    };

    audio.addEventListener('loadedmetadata', syncMetadata);
    audio.addEventListener('timeupdate', syncProgress);
    audio.addEventListener('ended', syncEnded);
    return () => {
      audio.removeEventListener('loadedmetadata', syncMetadata);
      audio.removeEventListener('timeupdate', syncProgress);
      audio.removeEventListener('ended', syncEnded);
    };
  });

  React.useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.volume = volume / 100;
  }, [volume]);

  React.useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    if (!canPlayInApp(currentTrack)) {
      audio.pause();
      return;
    }

    if (isPlaying) {
      audio.play().catch(() => {
        setIsPlaying(false);
        setStatusText('当前音频无法自动播放，请手动重试');
      });
    } else {
      audio.pause();
    }
  }, [currentTrack, isPlaying]);

  React.useEffect(() => {
    if (!bilibiliAudioTrack) {
      bilibiliPlaybackStartedAtRef.current = null;
      return undefined;
    }

    if (!isPlaying || !isBilibiliAudioAudible) {
      bilibiliPlaybackStartedAtRef.current = null;
      return undefined;
    }

    bilibiliPlaybackStartedAtRef.current = Date.now() - bilibiliPlaybackTime * 1000;
    const intervalId = window.setInterval(() => {
      const startedAt = bilibiliPlaybackStartedAtRef.current;
      if (!startedAt) return;
      const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
      const maxSeconds = Number(bilibiliAudioTrack.durationSeconds) || elapsedSeconds;
      setBilibiliPlaybackTime((currentValue) => {
        const nextValue = Math.min(elapsedSeconds, maxSeconds);
        return nextValue === currentValue ? currentValue : nextValue;
      });

      if (maxSeconds > 0 && elapsedSeconds >= maxSeconds) {
        const autoAdvanceState = bilibiliAutoAdvanceRef.current;
        if (autoAdvanceState.trackId !== bilibiliAudioTrack.id || Date.now() - autoAdvanceState.completedAt > 2500) {
          bilibiliAutoAdvanceRef.current = {
            trackId: bilibiliAudioTrack.id,
            completedAt: Date.now()
          };
          setBilibiliPlaybackTime(maxSeconds);
          setProgress(0);
          stablePlayNextBilibiliItem(bilibiliAudioTrack);
        }
      }
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [bilibiliAudioTrack, bilibiliPlayerRevision, isBilibiliAudioAudible, isPlaying, stablePlayNextBilibiliItem]);

  React.useEffect(() => {
    if (!currentTrack?.externalOnly || !isPlaying || !bilibiliAudioTrack) {
      setIsBilibiliAudioAudible(false);
      return undefined;
    }

    if (!desktopApi?.getAudibleState) {
      setIsBilibiliAudioAudible(true);
      return undefined;
    }

    let isDisposed = false;
    let attempts = 0;
    let missedAudibleChecks = 0;
    let intervalId;
    let watchdogIntervalId;
    let hasReportedPlaying = false;
    let hasReportedStartupWait = false;
    let hasReportedAudibleLoss = false;

    const reportWaitingForAudibleOutput = (message) => {
      setIsBilibiliAudioAudible(false);
      updateBilibiliAudioStatus('slow', message);
      setStatusText(message);
    };

    const checkAudibleState = async (mode = 'startup') => {
      attempts += 1;
      try {
        const audibleState = await desktopApi.getAudibleState();
        if (isDisposed) return;

        if (audibleState?.audible) {
          setIsBilibiliAudioAudible(true);
          missedAudibleChecks = 0;
          hasReportedAudibleLoss = false;
          if (!hasReportedPlaying) {
            hasReportedPlaying = true;
            updateBilibiliAudioStatus('playing', `B站官方播放器正在输出声音：${bilibiliAudioTrack.title}`);
            setStatusText(`B站音频正在播放：${bilibiliAudioTrack.title}`);
          }
          if (intervalId) {
            window.clearInterval(intervalId);
            intervalId = null;
          }
          if (!watchdogIntervalId) {
            watchdogIntervalId = window.setInterval(() => checkAudibleState('watchdog'), bilibiliAudibleWatchdogMs);
          }
          return;
        }
      } catch {
        if (isDisposed) return;
      }

      if (mode === 'watchdog') {
        missedAudibleChecks += 1;
        if (missedAudibleChecks >= bilibiliAudibleWatchdogMisses) {
          if (!hasReportedAudibleLoss) {
            hasReportedAudibleLoss = true;
            reportWaitingForAudibleOutput(
              `暂时未检测到 B站播放器声音，已保持连接，可重新连接或打开原视频：${bilibiliAudioTrack.title}`
            );
          }
        }
        return;
      }

      if (attempts >= bilibiliAudibleStartupAttempts && !hasReportedStartupWait) {
        hasReportedStartupWait = true;
        reportWaitingForAudibleOutput(
          `B站官方播放器已加载较久但暂未检测到声音，仍在保持连接：${bilibiliAudioTrack.title}`
        );
      }
    };

    setIsBilibiliAudioAudible(false);
    intervalId = window.setInterval(() => checkAudibleState('startup'), bilibiliAudibleStartupCheckMs);
    checkAudibleState();

    return () => {
      isDisposed = true;
      if (intervalId) window.clearInterval(intervalId);
      if (watchdogIntervalId) window.clearInterval(watchdogIntervalId);
    };
  }, [bilibiliAudioTrack, currentTrack, isPlaying, updateBilibiliAudioStatus]);

  React.useEffect(() => {
    if (!desktopApi?.onMediaCommand) return undefined;

    return desktopApi.onMediaCommand((command) => {
      if (command === 'toggle-play') togglePlay();
      if (command === 'next') playNext();
      if (command === 'previous') playPrevious();
      if (command === 'flush-playback-state') {
        savePreferences(latestPreferencesRef.current);
      }
      if (command === 'mini-mode-on') {
        setIsMiniMode(true);
        setStatusText('已进入迷你播放器模式');
      }
      if (command === 'mini-mode-off') {
        setIsMiniMode(false);
        setStatusText('已退出迷你播放器模式');
      }
    });
  });

  function addToQueue(track) {
    if (!canPlayFromQueue(track)) {
      setStatusText('该内容暂不能加入播放队列');
      return;
    }

    if (queue.some((item) => item.id === track.id)) {
      setStatusText(`已在播放队列中：${track.title}`);
      return;
    }

    setQueue((items) => appendUniqueTrack(items, track));
    setStatusText(`已加入播放队列：${track.title}`);
  }

  function addTracksToQueue(tracks, sourceName = '列表') {
    const playableTracks = Array.isArray(tracks) ? tracks.filter(canPlayFromQueue) : [];
    if (playableTracks.length === 0) {
      setStatusText(`${sourceName}没有可加入队列的内容`);
      return;
    }

    const queuedIds = new Set(queue.map((item) => item.id));
    const additions = playableTracks.filter((track) => !queuedIds.has(track.id));
    if (additions.length === 0) {
      setStatusText(`${sourceName}中的内容已在播放队列中`);
      return;
    }

    setQueue((items) => appendUniqueTracks(items, additions));
    setStatusText(`已从${sourceName}加入 ${additions.length} 首到播放队列`);
  }

  function getPlaybackStarterTrack(tracks) {
    const playableTracks = Array.isArray(tracks) ? tracks.filter(canPlayFromQueue) : [];
    if (playableTracks.length === 0) return null;
    if (mode === 'shuffle') {
      return getRandomQueueTrack({
        currentTrack: null,
        queue: playableTracks
      });
    }
    return playableTracks[0];
  }

  async function playTrackCollection(tracks, sourceName = '列表') {
    const playableTracks = Array.isArray(tracks) ? tracks.filter(canPlayFromQueue) : [];
    if (playableTracks.length === 0) {
      setStatusText(`${sourceName}没有可播放内容`);
      return;
    }

    setQueue((items) => appendUniqueTracks(items, playableTracks));
    await playTrack(getPlaybackStarterTrack(playableTracks));
  }

  async function playTrack(track) {
    if (!canPlayInApp(track)) {
      const playableTrack = await enrichBilibiliTrack(track);
      startBilibiliAudio(playableTrack, { resetTime: true });
      setCurrentTrack(playableTrack);
      setIsPlaying(true);
      setProgress(0);
      setQueue((items) => prependNewTrack(items, playableTrack));
      setHistory((items) => {
        const deduped = items.filter((item) => item.id !== playableTrack.id);
        return [playableTrack, ...deduped].slice(0, 12);
      });
      setStatusText(`正在连接 B站官方播放器：${playableTrack.title}`);
      return;
    }

    const audio = audioRef.current;
    clearBilibiliAudioSource();
    setCurrentTrack(track);
    setIsPlaying(true);
    setProgress(0);
    setQueue((items) => prependNewTrack(items, track));
    setHistory((items) => {
      const deduped = items.filter((item) => item.id !== track.id);
      return [track, ...deduped].slice(0, 12);
    });
    setStatusText(`正在播放：${track.title}`);

    if (audio) {
      if (audio.src !== track.audioUrl) {
        audio.src = track.audioUrl;
        audio.load();
      }
      audio.play().catch(() => {
        setIsPlaying(false);
        setStatusText('当前音频无法自动播放，请手动重试');
      });
    }
  }

  async function enrichBilibiliTrack(track) {
    if (!track?.externalOnly || !track.bv || track.parts?.length > 1) {
      return track;
    }

    try {
      setStatusText(`正在读取 B站选集信息：${track.title}`);
      const detailResult = await searchBilibiliMusic({
        keyword: track.bv,
        provider: 'bilibili',
        sort: 'relevance',
        duration: 'all',
        limit: 1
      });
      const detailTrack = detailResult.tracks?.[0];

      if (!detailTrack) return track;
      if (track.bv && detailTrack.bv && String(track.bv).toLowerCase() !== String(detailTrack.bv).toLowerCase()) {
        return track;
      }
      const trackAid = String(track.aid || '').replace(/^av/i, '').toLowerCase();
      const detailAid = String(detailTrack.aid || '').replace(/^av/i, '').toLowerCase();
      if (trackAid && detailAid && trackAid !== detailAid) {
        return track;
      }
      const trackViewCount = Number(track.viewCount);
      return {
        ...track,
        ...detailTrack,
        id: track.id || detailTrack.id,
        title: track.title || detailTrack.title,
        rawTitle: track.rawTitle || detailTrack.rawTitle,
        artist: track.artist || detailTrack.artist,
        uploader: track.uploader || detailTrack.uploader,
        category: track.category || detailTrack.category,
        views: track.views || detailTrack.views,
        viewCount: Number.isFinite(trackViewCount) && trackViewCount > 0 ? trackViewCount : detailTrack.viewCount,
        bv: track.bv || detailTrack.bv,
        aid: track.aid || detailTrack.aid,
        sourceUrl: track.sourceUrl || detailTrack.sourceUrl,
        cover: track.cover || detailTrack.cover,
        rawCover: track.rawCover || detailTrack.rawCover
      };
    } catch {
      setStatusText(`B站选集信息暂不可用，已按单条播放：${track.title}`);
      return track;
    }
  }

  function togglePlay() {
    if (!currentTrack) {
      const starterTrack = getPlaybackStarterTrack(queue.length > 0 ? queue : visibleResults);
      if (starterTrack) {
        if (queue.length === 0) {
          setQueue((items) => appendUniqueTracks(items, visibleResults.filter(canPlayFromQueue)));
        }
        playTrack(starterTrack);
      }
      return;
    }
    if (!canPlayInApp(currentTrack)) {
      if (bilibiliAudioTrack?.id === currentTrack.id && isPlaying) {
        pauseBilibiliAudio();
      } else {
        resumeBilibiliAudio(currentTrack);
      }
      return;
    }
    setIsPlaying((value) => !value);
  }

  function playNext() {
    if (queue.length === 0) {
      setIsPlaying(false);
      return;
    }

    const nextTrack = getNextQueueTrack({ currentTrack, mode, queue });

    if (nextTrack) playTrack(nextTrack);
  }

  function playPrevious() {
    if (queue.length === 0) return;
    const previousTrack = getPreviousQueueTrack({ currentTrack, queue });
    playTrack(previousTrack);
  }

  function playNextBilibiliItem(track = currentTrack) {
    if (!track?.externalOnly) {
      playNext();
      return;
    }

    const nextPart = getNextBilibiliPart(track);

    if (nextPart) {
      playBilibiliPart(nextPart);
      return;
    }

    playNext();
  }

  function removeFromQueue(trackId) {
    setQueue((items) => items.filter((item) => item.id !== trackId));
  }

  function moveTrackInQueue(trackId, direction) {
    const beforeIndex = queue.findIndex((item) => item.id === trackId);
    const canMove =
      beforeIndex >= 0 &&
      ((direction === 'up' && beforeIndex > 0) || (direction === 'down' && beforeIndex < queue.length - 1));

    if (!canMove) return;
    setQueue((items) => moveQueueTrack(items, trackId, direction));
    setStatusText('播放队列顺序已调整');
  }

  function clearQueue() {
    setQueue([]);
    setStatusText('播放队列已清空');
  }

  function clearHistory() {
    setHistory([]);
    setStatusText('播放历史已清空');
  }

  function seek(value) {
    if (currentTrack?.externalOnly) {
      const nextTime = Math.round((Number(value) / 100) * (currentTrack.durationSeconds || 0));
      setBilibiliPlaybackTime(nextTime);
      setBilibiliSeekTime(nextTime);
      setBilibiliPlayerRevision((revision) => revision + 1);
      setIsPlaying(true);
      setStatusText(`已跳转到 ${formatTime(nextTime)}：${currentTrack.title}`);
      return;
    }

    const audio = audioRef.current;
    setProgress(Number(value));
    if (audio?.duration) {
      audio.currentTime = (Number(value) / 100) * audio.duration;
    }
  }

  function cycleMode() {
    const nextMode = mode === 'list' ? 'single' : mode === 'single' ? 'shuffle' : 'list';
    setMode(nextMode);
  }

  function loadMoreResults() {
    const nextLimit = Math.min(maxSearchLimit, searchLimit + searchLoadMoreStep);
    if (nextLimit <= searchLimit || isLoading || isLoadingMore) return;
    performSearch(query, {
      append: true,
      limit: nextLimit
    });
  }

  function toggleMiniMode() {
    desktopApi?.toggleMiniMode?.().catch(() => {
      setStatusText('迷你模式暂不可用');
    });
  }

  function minimizeWindow() {
    desktopApi?.minimizeWindow?.().catch(() => {
      setStatusText('窗口最小化暂不可用');
    });
  }

  function toggleMaximizeWindow() {
    desktopApi?.toggleMaximizeWindow?.()
      .then((state) => {
        setIsWindowMaximized(Boolean(state?.isMaximized));
      })
      .catch(() => {
        setStatusText('窗口缩放暂不可用');
      });
  }

  function closeWindow() {
    desktopApi?.closeWindow?.().catch(() => {
      setStatusText('窗口关闭暂不可用');
    });
  }

  function openLyricsPanel() {
    if (!currentTrack) {
      setStatusText('请先选择一首歌曲再打开歌词');
      return;
    }

    setLyricDraft(currentLyricEntry?.raw || currentTrack.lyric || '');
    setLyricStatus(currentLyricEntry ? '已加载当前歌曲歌词' : '可导入 LRC 或粘贴歌词');
    setIsLyricsPanelOpen(true);
  }

  function toggleLyricsPanel() {
    if (isLyricsPanelOpen) {
      setIsLyricsPanelOpen(false);
      return;
    }
    openLyricsPanel();
  }

  function saveCurrentLyricDraft() {
    if (!currentTrack) {
      setLyricStatus('请先选择一首歌曲');
      return;
    }

    const entry = createLyricEntry(lyricDraft, {
      source: 'manual',
      offsetMs: currentLyricEntry?.offsetMs || 0
    });

    if (!entry.raw || entry.lines.length === 0) {
      setLyricStatus('歌词内容为空，无法保存');
      return;
    }

    setLyricsByTrackId((items) => ({
      ...items,
      [currentTrack.id]: entry
    }));
    const message = entry.type === 'lrc' ? `已保存滚动歌词：${currentTrack.title}` : `已保存文本歌词：${currentTrack.title}`;
    setLyricStatus(message);
    setStatusText(message);
  }

  function clearCurrentLyrics() {
    if (!currentTrack) return;

    setLyricsByTrackId((items) => {
      const nextItems = { ...items };
      delete nextItems[currentTrack.id];
      return nextItems;
    });
    setLyricDraft('');
    setLyricStatus('已清空当前歌曲歌词');
    setStatusText(`已清空歌词：${currentTrack.title}`);
  }

  function updateCurrentLyricOffset(nextOffsetMs) {
    if (!currentTrack || !currentLyricEntry) {
      setLyricStatus('当前歌曲还没有可调整的歌词');
      return;
    }

    const offsetMs = clampLyricOffset(nextOffsetMs);
    setLyricsByTrackId((items) => ({
      ...items,
      [currentTrack.id]: {
        ...currentLyricEntry,
        offsetMs,
        updatedAt: new Date().toISOString()
      }
    }));
    setLyricStatus(`歌词时间偏移已调整为 ${formatLyricOffset(offsetMs)}`);
  }

  function openLyricFilePicker() {
    if (!currentTrack) {
      setStatusText('请先选择一首歌曲再导入歌词');
      return;
    }
    lyricFileInputRef.current?.click();
  }

  async function handleLyricFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !currentTrack) return;

    try {
      const content = await file.text();
      const entry = createLyricEntry(content, {
        source: file.name.toLowerCase().endsWith('.lrc') ? 'local-lrc' : 'local-text',
        offsetMs: currentLyricEntry?.offsetMs || 0
      });

      if (!entry.raw || entry.lines.length === 0) {
        setLyricStatus('导入文件没有可用歌词内容');
        return;
      }

      setLyricsByTrackId((items) => ({
        ...items,
        [currentTrack.id]: entry
      }));
      setLyricDraft(entry.raw);
      setIsLyricsPanelOpen(true);
      const message = `已导入歌词：${file.name}`;
      setLyricStatus(message);
      setStatusText(message);
    } catch (error) {
      const message = error.message || '歌词导入失败';
      setLyricStatus(message);
      setStatusText(message);
    }
  }

  function updateDesktopSetting(key, value) {
    setDesktopSettings((settings) => ({
      ...settings,
      [key]: value
    }));
    setSettingsStatus('设置已保存');
    if (key === 'defaultProvider') {
      setSelectedProvider(value);
    }
  }

  async function handleClearCache() {
    try {
      const cache = await clearSearchCache();
      setCacheInfo({ hit: false });
      const message = `已清理搜索缓存：${cache.clearedEntries || 0} 条`;
      setSettingsStatus(message);
      setStatusText(message);
    } catch (error) {
      const message = error.message || '缓存清理失败';
      setSettingsStatus(message);
      setStatusText(message);
    }
  }

  function applyPreferences(nextPreferences, message = '本地数据已导入') {
    const preferences = sanitizePreferences(nextPreferences);
    setSelectedProvider(preferences.selectedProvider);
    setVolume(preferences.volume);
    setMode(preferences.mode);
    setQueue(preferences.queue);
    setHistory(preferences.history);
    setPlaylists(preferences.playlists);
    setSelectedPlaylistId(preferences.selectedPlaylistId);
    setDesktopSettings(preferences.desktopSettings);
    setCurrentTrack(preferences.currentTrack);
    setLyricsByTrackId(preferences.lyricsByTrackId);
    setQuery(preferences.query);
    setSort(preferences.sort);
    setDuration(preferences.duration);
    setIsPlaying(false);

    const restoredState = getRestoredPlayback(preferences.currentTrack, preferences.playbackState);
    initialPlaybackRestoreRef.current = restoredState;
    if (preferences.currentTrack?.externalOnly) {
      setBilibiliAudioTrack(preferences.currentTrack);
      setBilibiliPlaybackTime(restoredState.positionSeconds);
      setBilibiliSeekTime(restoredState.positionSeconds);
      setBilibiliAudioStatus({
        phase: 'paused',
        message: createRestoreStatusText(preferences.currentTrack, restoredState)
      });
      setIsBilibiliPanelOpen(false);
    } else {
      clearBilibiliAudioSource();
      setNativePlaybackTime(restoredState.source === 'native' ? restoredState.positionSeconds : 0);
      setNativeDuration(preferences.currentTrack ? Number(preferences.currentTrack.durationSeconds) || 0 : 0);
    }
    setProgress(restoredState.progressPercent);
    savePreferences(preferences);
    setSettingsStatus(message);
    setStatusText(message);
  }

  async function handleExportPreferences() {
    const exportPayload = createPreferencesExport(currentPreferences, appInfo);

    try {
      if (desktopApi?.exportPreferences) {
        const result = await desktopApi.exportPreferences(exportPayload);
        if (result?.canceled) {
          setSettingsStatus('已取消导出');
          return;
        }
        const message = `已导出本地数据：${result?.filePath || '备份文件'}`;
        setSettingsStatus(message);
        setStatusText(message);
        return;
      }

      downloadJsonFile(createExportFileName(), exportPayload);
      setSettingsStatus('已下载本地数据备份');
      setStatusText('已下载本地数据备份');
    } catch (error) {
      const message = error.message || '本地数据导出失败';
      setSettingsStatus(message);
      setStatusText(message);
    }
  }

  async function handleImportPreferences() {
    try {
      if (desktopApi?.importPreferences) {
        const result = await desktopApi.importPreferences();
        if (result?.canceled) {
          setSettingsStatus('已取消导入');
          return;
        }
        const parsedExport = parsePreferencesExport(result.content);
        applyPreferences(parsedExport.preferences, `已导入本地数据：${result.filePath || '备份文件'}`);
        return;
      }

      importFileInputRef.current?.click();
    } catch (error) {
      const message = error.message || '本地数据导入失败';
      setSettingsStatus(message);
      setStatusText(message);
    }
  }

  async function handleImportFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const content = await file.text();
      const parsedExport = parsePreferencesExport(content);
      applyPreferences(parsedExport.preferences, `已导入本地数据：${file.name}`);
    } catch (error) {
      const message = error.message || '本地数据导入失败';
      setSettingsStatus(message);
      setStatusText(message);
    }
  }

  function handleClearLocalData(dataType) {
    const nextPreferences = clearPreferenceData(currentPreferences, dataType);
    applyPreferences(nextPreferences, getClearDataStatusText(dataType));
  }

  function handleResetPreferences() {
    const nextPreferences = resetPreferences();
    applyPreferences(nextPreferences, '应用偏好已重置');
  }

  function createPlaylist() {
    const nextIndex = playlists.length + 1;
    const playlist = {
      id: `playlist-${Date.now()}`,
      name: `新歌单 ${nextIndex}`,
      description: '本地创建的歌单',
      tracks: [],
      createdAt: new Date().toISOString()
    };

    setPlaylists((items) => [...items, playlist]);
    setSelectedPlaylistId(playlist.id);
    setActiveNav('playlists');
    setStatusText(`已创建歌单：${playlist.name}`);
  }

  function deleteSelectedPlaylist() {
    if (playlists.length <= 1) {
      setStatusText('至少保留一个歌单');
      return;
    }

    const deletingPlaylist = selectedPlaylist;
    setPlaylists((items) => items.filter((playlist) => playlist.id !== selectedPlaylistId));
    const nextPlaylist = playlists.find((playlist) => playlist.id !== selectedPlaylistId);
    if (nextPlaylist) setSelectedPlaylistId(nextPlaylist.id);
    setStatusText(`已删除歌单：${deletingPlaylist?.name || ''}`);
  }

  function favoriteTrack(track) {
    if (!track) return;
    if (selectedPlaylist?.tracks.some((item) => item.id === track.id)) {
      setStatusText(`已在歌单中：${track.title}`);
      return;
    }

    setPlaylists((items) =>
      items.map((playlist) => {
        if (playlist.id !== selectedPlaylistId) return playlist;
        if (playlist.tracks.some((item) => item.id === track.id)) return playlist;
        return {
          ...playlist,
          tracks: [track, ...playlist.tracks]
        };
      })
    );
    setStatusText(`已收藏到歌单：${selectedPlaylist?.name || '我的歌单'}`);
  }

  function saveQueueAsPlaylist() {
    if (queue.length === 0) {
      setStatusText('播放队列为空，无法保存为歌单');
      return;
    }

    const createdAt = new Date();
    const playlist = {
      id: `playlist-queue-${createdAt.getTime()}`,
      name: `播放队列 ${createdAt.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}`,
      description: '由当前播放队列保存',
      tracks: queue.slice(0, 200),
      createdAt: createdAt.toISOString()
    };

    setPlaylists((items) => [...items, playlist]);
    setSelectedPlaylistId(playlist.id);
    setActiveNav('playlists');
    setStatusText(`已保存为歌单：${playlist.name}`);
  }

  function openSourceVideo(track) {
    if (!track?.sourceUrl) return;
    window.open(track.sourceUrl, '_blank', 'noopener,noreferrer');
  }

  function startBilibiliAudio(track, { resetTime = false, seekTime = null } = {}) {
    if (!track?.bv && !track?.aid) {
      openSourceVideo(track);
      return;
    }
    const isDifferentTrack = bilibiliAudioTrack?.id !== track.id;
    const nextSeekTime = Number.isFinite(seekTime) ? Math.max(0, Math.floor(seekTime)) : resetTime || isDifferentTrack ? 0 : bilibiliPlaybackTime;

    if (isDifferentTrack || resetTime || Number.isFinite(seekTime)) {
      setBilibiliPlayerRevision((revision) => revision + 1);
    }
    if (isDifferentTrack || resetTime) {
      bilibiliAutoReconnectRef.current = {
        trackId: track.id,
        attempted: false
      };
    }
    bilibiliAutoAdvanceRef.current = {
      trackId: '',
      completedAt: 0
    };
    setIsBilibiliAudioAudible(false);
    setBilibiliPlaybackTime(nextSeekTime);
    setBilibiliSeekTime(nextSeekTime);
    setBilibiliAudioTrack(track);
    updateBilibiliAudioStatus(
      'connecting',
      `正在连接 B站官方播放器：${track.title}${nextSeekTime > 0 ? `，从 ${formatTime(nextSeekTime)} 继续` : ''}`
    );
  }

  function clearBilibiliAudioSource() {
    setBilibiliAudioTrack(null);
    setIsBilibiliPanelOpen(false);
    bilibiliAutoReconnectRef.current = {
      trackId: '',
      attempted: false
    };
    bilibiliAutoAdvanceRef.current = {
      trackId: '',
      completedAt: 0
    };
    setIsBilibiliAudioAudible(false);
    setBilibiliPlaybackTime(0);
    setBilibiliSeekTime(0);
    updateBilibiliAudioStatus('idle', '等待选择 B站音频');
  }

  function hideBilibiliPanel() {
    setIsBilibiliPanelOpen(false);
    if (bilibiliAudioTrack) {
      setStatusText(
        isPlaying
          ? `B站音频后台播放中：${bilibiliAudioTrack.title}`
          : `B站音频面板已隐藏：${bilibiliAudioTrack.title}`
      );
    }
  }

  function toggleBilibiliPanel() {
    if (!bilibiliAudioTrack) {
      if (currentTrack?.externalOnly) {
        resumeBilibiliAudio(currentTrack);
      }
      return;
    }

    if (isBilibiliPanelOpen) {
      hideBilibiliPanel();
    } else {
      setIsBilibiliPanelOpen(true);
      setStatusText(`已打开 B站音频面板：${bilibiliAudioTrack.title}`);
    }
  }

  function stopBilibiliAudio() {
    const stoppingTrack = bilibiliAudioTrack || currentTrack;
    clearBilibiliAudioSource();
    setIsPlaying(false);
    setProgress(0);
    if (stoppingTrack?.externalOnly) {
      setStatusText(`已停止 B站音频：${stoppingTrack.title}`);
    }
  }

  function pauseBilibiliAudio() {
    if (!currentTrack?.externalOnly) return;
    setIsPlaying(false);
    setIsBilibiliAudioAudible(false);
    updateBilibiliAudioStatus('paused', `已暂停，继续播放会从 ${formatTime(bilibiliPlaybackTime)} 恢复`);
    setStatusText(`已暂停 B站音频：${currentTrack.title}`);
  }

  function resumeBilibiliAudio(track = currentTrack) {
    if (!track) return;
    startBilibiliAudio(track, { seekTime: bilibiliPlaybackTime });
    setIsPlaying(true);
    setStatusText(`正在从 ${formatTime(bilibiliPlaybackTime)} 继续连接 B站音频：${track.title}`);
  }

  function reconnectBilibiliAudio() {
    if (!bilibiliAudioTrack) return;
    bilibiliAutoReconnectRef.current = {
      trackId: bilibiliAudioTrack.id,
      attempted: false
    };
    setBilibiliSeekTime(bilibiliPlaybackTime);
    setBilibiliPlayerRevision((revision) => revision + 1);
    updateBilibiliAudioStatus(
      'connecting',
      `正在从 ${formatTime(bilibiliPlaybackTime)} 重新连接 B站官方播放器`
    );
    setIsPlaying(true);
    setStatusText(`正在从 ${formatTime(bilibiliPlaybackTime)} 重新连接 B站音频：${bilibiliAudioTrack.title}`);
  }

  function playBilibiliPart(part) {
    const sourceTrack = bilibiliAudioTrack || currentTrack;
    if (!sourceTrack || !part) return;
    const nextTrack = createBilibiliPartTrack(sourceTrack, part);
    startBilibiliAudio(nextTrack, { resetTime: true });
    setCurrentTrack(nextTrack);
    setIsPlaying(true);
    setProgress(0);
    setHistory((items) => {
      const deduped = items.filter((item) => item.id !== nextTrack.id);
      return [nextTrack, ...deduped].slice(0, 12);
    });
    setStatusText(`正在连接选集：${nextTrack.title}`);
  }

  function removeTrackFromPlaylist(trackId) {
    setPlaylists((items) =>
      items.map((playlist) => {
        if (playlist.id !== selectedPlaylistId) return playlist;
        return {
          ...playlist,
          tracks: playlist.tracks.filter((track) => track.id !== trackId)
        };
      })
    );
    setStatusText('已从歌单移除');
  }

  const visibleResults = React.useMemo(
    () =>
      results.filter((track) => {
        if (duration === 'short') return track.durationSeconds <= 240;
        if (duration === 'medium') return track.durationSeconds > 240 && track.durationSeconds <= 600;
        if (duration === 'long') return track.durationSeconds > 600;
        return true;
      }),
    [duration, results]
  );

  const playerProgress = durationSeconds > 0 ? Math.min(100, (currentTime / durationSeconds) * 100) : currentTrack?.externalOnly ? 0 : progress;
  const titlebarSearchRef = React.useRef(null);
  const selectedPlaylist = playlists.find((playlist) => playlist.id === selectedPlaylistId) || playlists[0];
  const selectedPlaylistTrackIds = React.useMemo(
    () => new Set((selectedPlaylist?.tracks || []).map((track) => track.id)),
    [selectedPlaylist]
  );
  const stableAddToQueue = useStableEvent(addToQueue);
  const stableFavoriteTrack = useStableEvent(favoriteTrack);
  const stableMoveTrackInQueue = useStableEvent(moveTrackInQueue);
  const stablePlayTrack = useStableEvent(playTrack);
  const stableRemoveFromQueue = useStableEvent(removeFromQueue);
  const stableRemoveTrackFromPlaylist = useStableEvent(removeTrackFromPlaylist);

  React.useEffect(() => {
    function handleGlobalSearchShortcut(event) {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'k') return;
      event.preventDefault();
      titlebarSearchRef.current?.focus();
    }

    window.addEventListener('keydown', handleGlobalSearchShortcut);
    return () => window.removeEventListener('keydown', handleGlobalSearchShortcut);
  }, []);

  const persistentPlaybackSource = (
    <>
      <audio ref={audioRef} src={canPlayInApp(currentTrack) ? currentTrack.audioUrl : undefined} preload="metadata" />
      {bilibiliAudioTrack && (
        <BilibiliAudioSource
          isPlaying={isPlaying}
          onError={handleBilibiliAudioError}
          onReady={handleBilibiliAudioReady}
          onSlow={handleBilibiliAudioSlow}
          revision={bilibiliPlayerRevision}
          seekTime={bilibiliSeekTime}
          track={bilibiliAudioTrack}
        />
      )}
    </>
  );

  const miniPlayer = (
    <div className="mini-player-shell">
      <div className="mini-player-cover">
        {currentTrack ? (
          <img alt={currentTrack.title} onError={handleImageError} src={getCoverSrc(currentTrack)} />
        ) : (
          <Music2 size={30} />
        )}
      </div>

      <div className="mini-player-main">
        <div className="mini-player-title-row">
          <div>
            <strong>{currentTrack?.title || '尚未播放'}</strong>
            <span>{currentTrack?.artist || statusText}</span>
          </div>
          <button className="icon-button small" onClick={toggleMiniMode} type="button" title="退出迷你模式">
            <PanelBottom size={15} />
          </button>
        </div>

        <div className="mini-player-progress">
          <span>{formatTime(currentTime)}</span>
          <input
            aria-label="播放进度"
            disabled={!currentTrack}
            max="100"
            min="0"
            onChange={(event) => seek(event.target.value)}
            type="range"
            value={playerProgress}
          />
          <span>{formatTime(durationSeconds)}</span>
        </div>

        <div className="mini-player-controls">
          <button className="icon-button small" onClick={playPrevious} type="button" title="上一首">
            <SkipBack size={16} />
          </button>
          <button
            className="play-button mini"
            onClick={togglePlay}
            type="button"
            title={currentTrack?.externalOnly ? (isPlaying ? '暂停 B站音频' : '继续 B站音频') : isPlaying ? '暂停' : '播放'}
          >
            {isPlaying ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <button className="icon-button small" onClick={playNext} type="button" title="下一首">
            <SkipForward size={16} />
          </button>
          <div className="mini-player-volume">
            <Volume2 size={15} />
            <input aria-label="音量" max="100" min="0" onChange={(event) => setVolume(Number(event.target.value))} type="range" value={volume} />
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {persistentPlaybackSource}
      {isMiniMode ? (
        miniPlayer
      ) : (
        <div className={`app-shell${isWindowMaximized ? ' is-window-maximized' : ''}`}>
          <DesktopTitleBar
            appInfo={appInfo}
            isDesktopApp={isDesktopApp}
            isMaximized={isWindowMaximized}
            isLoading={isLoading}
            query={query}
            queueCount={queue.length}
            searchInputRef={titlebarSearchRef}
            statusText={statusText}
            onClose={closeWindow}
            onMaximize={toggleMaximizeWindow}
            onMinimize={minimizeWindow}
            onQueryChange={setQuery}
            onSearch={performSearch}
          />
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Music2 size={22} />
          </div>
          <div>
            <strong>BiliWave</strong>
            <span>Bilibili Music</span>
          </div>
        </div>

        <nav className="nav-list" aria-label="主导航">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={activeNav === item.id ? 'nav-item active' : 'nav-item'}
                key={item.id}
                onClick={() => setActiveNav(item.id)}
                type="button"
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <section className="playlist-block">
          <div className="block-heading">
            <span>我的歌单</span>
            <button className="icon-button small" onClick={createPlaylist} type="button" title="新建歌单">
              <Plus size={15} />
            </button>
          </div>
          {playlists.map((playlist) => (
            <button
              className={playlist.id === selectedPlaylistId ? 'playlist-link active' : 'playlist-link'}
              key={playlist.id}
              onClick={() => {
                setSelectedPlaylistId(playlist.id);
                setActiveNav('playlists');
              }}
              type="button"
            >
              <span className="playlist-dot" />
              <span>{playlist.name}</span>
              <em>{playlist.tracks.length}</em>
            </button>
          ))}
        </section>
      </aside>

      <main className="workspace" ref={workspaceRef}>
        <section className="library-toolbar" aria-label="音乐发现">
          <div className="library-toolbar-main">
            <div className="library-title">
              <p>发现好音乐</p>
              <h1>音乐，因为你而动</h1>
              <span>在这里，从 B 站公开视频里发现更多适合收听的音乐内容。</span>
            </div>
            <div className="library-visual" aria-hidden="true">
              <div className="library-visual-disc">
                <Music2 size={104} />
              </div>
              <i />
              <i />
              <i />
              <span />
              <span />
            </div>

          </div>

          <div className="library-toolbar-side">
            <div className="toolbar-stat">
              <Disc3 size={17} />
              <div>
                <strong>{visibleResults.length}</strong>
                <span>当前结果</span>
              </div>
            </div>
            <label className="provider-picker">
              <SlidersHorizontal size={13} />
              <select
                aria-label="选择数据源"
                value={selectedProvider}
                onChange={(event) => setSelectedProvider(event.target.value)}
              >
                {(providers.length > 0 ? providers : [{ id: 'demo', name: '本地演示数据源' }]).map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="toolbar-badges">
              <span>{providerInfo?.mode === 'demo' ? '演示' : providerInfo?.mode === 'external' ? '外部' : '实时'}</span>
              <span>{cacheInfo?.hit ? '缓存' : '在线'}</span>
            </div>
            <div className="filters compact">
              <label>
                <Filter size={14} />
                <select
                  value={sort}
                  onChange={(event) => {
                    setSort(event.target.value);
                    setSearchResetKey((key) => key + 1);
                  }}
                >
                  <option value="relevance">相关度</option>
                  <option value="latest">发布时间</option>
                  <option value="views">播放量</option>
                </select>
              </label>
              <label>
                <Clock size={14} />
                <select
                  value={duration}
                  onChange={(event) => {
                    setDuration(event.target.value);
                    setSearchResetKey((key) => key + 1);
                  }}
                >
                  <option value="all">全部时长</option>
                  <option value="short">4 分钟内</option>
                  <option value="medium">4-10 分钟</option>
                  <option value="long">10 分钟以上</option>
                </select>
              </label>
            </div>
          </div>
        </section>

        <ApiPortNotice status={appInfo.apiStatus} />

        <section className="keyword-row" aria-label="热门关键词">
          <button
            className="keyword-chip active"
            onClick={() => {
              setQuery('');
              setActiveNav('discover');
            }}
            type="button"
          >
            全部
          </button>
          {featuredKeywords.map((word) => (
            <button
              className="keyword-chip"
              key={word}
              onClick={() => {
                setQuery(word);
                performSearch(word);
              }}
              type="button"
            >
              {word}
            </button>
          ))}
        </section>

        <section className={activeNav === 'settings' ? 'content-grid settings-mode' : 'content-grid'}>
          <div className="main-panel">
            <div className="section-head">
              <div>
                <p>{activeNav === 'history' ? '最近播放' : activeNav === 'playlists' ? '歌单详情' : activeNav === 'settings' ? '桌面偏好' : '搜索结果'}</p>
                <h2>{activeNav === 'history' ? '听过的内容' : activeNav === 'playlists' ? selectedPlaylist?.name : activeNav === 'settings' ? '设置' : query || '全部音乐'}</h2>
              </div>
              {activeNav === 'playlists' ? (
                <div className="playlist-actions">
                  <span>{selectedPlaylist?.tracks.length || 0} 首收藏</span>
                  <button
                    className="text-button"
                    disabled={!selectedPlaylist?.tracks.length}
                    onClick={() => playTrackCollection(selectedPlaylist?.tracks, selectedPlaylist?.name || '歌单')}
                    type="button"
                  >
                    <Play size={14} />
                    播放全部
                  </button>
                  <button
                    className="text-button"
                    disabled={!selectedPlaylist?.tracks.length}
                    onClick={() => addTracksToQueue(selectedPlaylist?.tracks, selectedPlaylist?.name || '歌单')}
                    type="button"
                  >
                    <Plus size={14} />
                    加入队列
                  </button>
                  <button className="text-button" onClick={deleteSelectedPlaylist} type="button">
                    删除歌单
                  </button>
                </div>
              ) : activeNav === 'history' ? (
                <div className="playlist-actions">
                  <span>{history.length} 条记录</span>
                  <button
                    className="text-button"
                    disabled={history.length === 0}
                    onClick={() => addTracksToQueue(history, '播放历史')}
                    type="button"
                  >
                    <Plus size={14} />
                    重新入队
                  </button>
                  <button className="text-button" disabled={history.length === 0} onClick={clearHistory} type="button">
                    清空历史
                  </button>
                </div>
              ) : null}
            </div>

            {isLoading ? (
              <SkeletonList />
            ) : searchError ? (
              <ErrorState
                error={searchError}
                provider={providerInfo}
                onRetry={() => performSearch()}
              />
            ) : activeNav === 'history' ? (
              <TrackTable
                emptyText="还没有播放历史"
                tracks={history}
                currentTrack={currentTrack}
                favoriteTrackIds={selectedPlaylistTrackIds}
                resetKey="history"
                scrollContainerRef={workspaceRef}
                onAdd={stableAddToQueue}
                onFavorite={stableFavoriteTrack}
                onPlay={stablePlayTrack}
              />
            ) : activeNav === 'playlists' ? (
              <PlaylistDetail
                playlist={selectedPlaylist}
                currentTrack={currentTrack}
                scrollContainerRef={workspaceRef}
                onAdd={stableAddToQueue}
                onPlay={stablePlayTrack}
                onRemove={stableRemoveTrackFromPlaylist}
              />
            ) : activeNav === 'settings' ? (
              <SettingsPanel
                isDesktopApp={isDesktopApp}
                providers={providers}
                settings={desktopSettings}
                status={settingsStatus}
                appInfo={appInfo}
                selectedProvider={selectedProvider}
                onClearCache={handleClearCache}
                onClearData={handleClearLocalData}
                onExportPreferences={handleExportPreferences}
                onImportPreferences={handleImportPreferences}
                onResetPreferences={handleResetPreferences}
                onUpdateSetting={updateDesktopSetting}
              />
            ) : (
              <>
                <TrackTable
                  emptyText="没有找到匹配内容"
                  tracks={visibleResults}
                  currentTrack={currentTrack}
                  favoriteTrackIds={selectedPlaylistTrackIds}
                  resetScrollToItem={false}
                  resetKey={`search-${searchResetKey}`}
                  scrollContainerRef={workspaceRef}
                  onAdd={stableAddToQueue}
                  onFavorite={stableFavoriteTrack}
                  onPlay={stablePlayTrack}
                />
                <SearchLoadMore
                  canLoadMore={canLoadMore}
                  error={loadMoreError}
                  isLoading={isLoadingMore}
                  limit={searchLimit}
                  maxLimit={maxSearchLimit}
                  onLoadMore={loadMoreResults}
                  resultCount={visibleResults.length}
                />
              </>
            )}
          </div>

          {activeNav !== 'settings' && (
            <aside className="now-panel">
              <div className="section-head compact">
                <div>
                  <p>{currentTrack?.externalOnly ? 'B站音频' : '当前播放'}</p>
                  <h2>{currentTrack ? (currentTrack.externalOnly ? '音频模式' : '正在收听') : '等待选择'}</h2>
                </div>
                <button className="icon-button" type="button" title="更多">
                  <MoreHorizontal size={18} />
                </button>
              </div>

              <div className="cover-stage">
                {currentTrack ? (
                  <img alt={currentTrack.title} onError={handleImageError} src={getCoverSrc(currentTrack)} />
                ) : (
                  <div className="cover-empty">
                    <Music2 size={42} />
                  </div>
                )}
              </div>

              <div className="now-info">
                <h3>{currentTrack?.title || '选择一首音乐开始播放'}</h3>
                <p>{currentTrack?.artist || '搜索、试听、加入队列'}</p>
                {currentTrack?.externalOnly && (
                  <button className="inline-link-button audio-panel-toggle" onClick={toggleBilibiliPanel} type="button">
                    <PanelBottom size={14} />
                    {isBilibiliPanelOpen ? '隐藏音频模式' : '打开音频模式'}
                  </button>
                )}
                {currentTrack?.externalOnly && (
                  <BilibiliAudioStatusLine
                    compact
                    isPlaying={isPlaying}
                    onReconnect={reconnectBilibiliAudio}
                    status={bilibiliAudioStatus}
                  />
                )}
                {currentTrack && (
                  <a href={currentTrack.sourceUrl} rel="noreferrer" target="_blank">
                    <ExternalLink size={14} />
                    原视频
                  </a>
                )}
              </div>

              <div className="lyrics-box">
                <div className="lyrics-heading">
                  <Mic2 size={16} />
                  <span>歌词预览</span>
                  {currentLyricEntry && <em>{currentLyricEntry.type === 'lrc' ? '滚动' : '文本'}</em>}
                </div>
                <p>{lyricPreview || '暂未匹配歌词，可导入 LRC 或粘贴歌词。'}</p>
                <button className="text-button mini" disabled={!currentTrack} onClick={openLyricsPanel} type="button">
                  <Mic2 size={13} />
                  <span>{currentLyricEntry ? '查看歌词' : '添加歌词'}</span>
                </button>
              </div>

              {currentTrack?.externalOnly && (
                <BilibiliPartList
                  className="now-part-panel"
                  onPlayPart={playBilibiliPart}
                  track={currentTrack}
                />
              )}
            </aside>
          )}
        </section>
      </main>

      <aside className="queue-panel">
        <div className="queue-head">
          <div>
            <p>播放队列</p>
            <h2>{queue.length} 首</h2>
          </div>
          <div className="queue-actions">
            <button className="text-button" disabled={queue.length === 0} onClick={saveQueueAsPlaylist} type="button">
              存为歌单
            </button>
            <button className="text-button" disabled={queue.length === 0} onClick={clearQueue} type="button">
              清空
            </button>
          </div>
        </div>

        {queue.length === 0 ? (
          <div className="empty-state queue-empty">
            <ListMusic size={26} />
            <span>从搜索结果添加歌曲</span>
          </div>
        ) : (
          <VirtualList
            className="queue-list"
            itemCount={queue.length}
            itemHeight={virtualQueueRowHeight}
            overscan={4}
            resetKey="queue"
            renderItem={(index) => (
              <QueueItem
                currentTrackId={currentTrack?.id}
                index={index}
                isFirst={index === 0}
                isLast={index === queue.length - 1}
                key={queue[index].id}
                onMove={stableMoveTrackInQueue}
                onPlay={stablePlayTrack}
                onRemove={stableRemoveFromQueue}
                track={queue[index]}
              />
            )}
          />
        )}
      </aside>

      <footer className="player-bar">
        <div className="mini-track">
          {currentTrack ? <img alt={currentTrack.title} onError={handleImageError} src={getCoverSrc(currentTrack)} /> : <div className="mini-cover" />}
          <div>
            <strong>{currentTrack?.title || '尚未播放'}</strong>
            <span>{currentTrack?.artist || statusText}</span>
          </div>
          <button
            className={currentTrack && selectedPlaylistTrackIds.has(currentTrack.id) ? 'icon-button small active' : 'icon-button small'}
            onClick={() => favoriteTrack(currentTrack)}
            type="button"
            title={currentTrack && selectedPlaylistTrackIds.has(currentTrack.id) ? '已收藏到当前歌单' : '收藏到当前歌单'}
          >
            <Heart fill={currentTrack && selectedPlaylistTrackIds.has(currentTrack.id) ? 'currentColor' : 'none'} size={15} />
          </button>
        </div>

        <div className="transport">
          <div className="transport-buttons">
            <button className="icon-button" onClick={cycleMode} type="button" title={mode === 'list' ? '列表循环' : mode === 'single' ? '单曲循环' : '随机播放'}>
              {mode === 'shuffle' ? <Shuffle size={17} /> : <Repeat size={17} />}
            </button>
            <button className="icon-button" onClick={playPrevious} type="button" title="上一首">
              <SkipBack size={18} />
            </button>
            <button
              className="play-button"
              onClick={togglePlay}
              type="button"
              title={currentTrack?.externalOnly ? (isPlaying ? '暂停 B站音频' : '继续 B站音频') : isPlaying ? '暂停' : '播放'}
            >
              {currentTrack?.externalOnly ? isPlaying ? <Pause size={21} /> : <Play size={21} /> : isPlaying ? <Pause size={21} /> : <Play size={21} />}
            </button>
            <button className="icon-button" onClick={playNext} type="button" title="下一首">
              <SkipForward size={18} />
            </button>
            {isDesktopApp && (
              <button className="icon-button" onClick={toggleMiniMode} type="button" title="迷你模式">
                <PanelBottom size={17} />
              </button>
            )}
            {currentTrack?.externalOnly && (
              <button
                className={isBilibiliPanelOpen ? 'icon-button active' : 'icon-button'}
                onClick={toggleBilibiliPanel}
                type="button"
                title={isBilibiliPanelOpen ? '隐藏音频模式' : '打开音频模式'}
              >
                <Disc3 size={17} />
              </button>
            )}
            <button
              className={isLyricsPanelOpen ? 'icon-button active' : 'icon-button'}
              disabled={!currentTrack}
              onClick={toggleLyricsPanel}
              type="button"
              title={isLyricsPanelOpen ? '关闭歌词' : '打开歌词'}
            >
              <Mic2 size={17} />
            </button>
          </div>
          <div className="progress-row">
            <span>{formatTime(currentTime)}</span>
            <input
              aria-label="播放进度"
              disabled={!currentTrack}
              max="100"
              min="0"
              onChange={(event) => seek(event.target.value)}
              type="range"
              value={playerProgress}
            />
            <span>{formatTime(durationSeconds)}</span>
          </div>
        </div>

        <div className="volume-box">
          <RefreshCw size={15} />
          <span>{statusText}</span>
          <Volume2 size={17} />
          <input aria-label="音量" max="100" min="0" onChange={(event) => setVolume(Number(event.target.value))} type="range" value={volume} />
        </div>
      </footer>

      {isBilibiliPanelOpen && bilibiliAudioTrack && (
        <BilibiliPlayerModal
          isPlaying={isPlaying}
          status={bilibiliAudioStatus}
          track={bilibiliAudioTrack}
          onClose={hideBilibiliPanel}
          onOpenSource={() => openSourceVideo(bilibiliAudioTrack)}
          onPlayPart={playBilibiliPart}
          onReconnect={reconnectBilibiliAudio}
          onStop={stopBilibiliAudio}
        />
      )}
      {isLyricsPanelOpen && (
        <LyricsPanel
          activeIndex={activeLyricIndex}
          currentTime={currentTime}
          draft={lyricDraft}
          entry={currentLyricEntry}
          status={lyricStatus}
          track={currentTrack}
          onChangeDraft={setLyricDraft}
          onClear={clearCurrentLyrics}
          onClose={() => setIsLyricsPanelOpen(false)}
          onImport={openLyricFilePicker}
          onOffsetChange={updateCurrentLyricOffset}
          onSave={saveCurrentLyricDraft}
        />
      )}
      <input
        ref={importFileInputRef}
        accept="application/json,.json"
        className="visually-hidden"
        onChange={handleImportFileChange}
        type="file"
      />
      <input
        ref={lyricFileInputRef}
        accept=".lrc,.txt,text/plain"
        className="visually-hidden"
        onChange={handleLyricFileChange}
        type="file"
      />
        </div>
      )}
    </>
  );
}

function LyricsPanel({
  activeIndex,
  currentTime,
  draft,
  entry,
  status,
  track,
  onChangeDraft,
  onClear,
  onClose,
  onImport,
  onOffsetChange,
  onSave
}) {
  const activeLineRef = React.useRef(null);
  const lines = Array.isArray(entry?.lines) ? entry.lines : [];
  const hasTimedLyrics = entry?.type === 'lrc';
  const hasLyrics = lines.length > 0;
  const offsetMs = entry?.offsetMs || 0;

  React.useEffect(() => {
    if (!activeLineRef.current) return;
    activeLineRef.current.scrollIntoView({
      block: 'center',
      behavior: 'smooth'
    });
  }, [activeIndex, track?.id]);

  return (
    <div className="player-modal lyrics-drawer" role="dialog" aria-modal="false" aria-label="歌词">
      <div className="player-modal-panel lyrics-panel">
        <div className="player-modal-head">
          <div>
            <span>歌词</span>
            <strong>{track?.title || '未选择歌曲'}</strong>
          </div>
          <div className="player-modal-actions">
            <button className="text-button" onClick={onImport} type="button" disabled={!track}>
              <Upload size={15} />
              <span>导入 LRC</span>
            </button>
            <button className="icon-button small" onClick={onClose} type="button" title="关闭歌词">
              <X size={16} />
            </button>
          </div>
        </div>

        <section className="lyrics-panel-body">
          <div className="lyrics-live">
            <div className="lyrics-live-head">
              <div>
                <strong>{hasTimedLyrics ? '滚动歌词' : '文本歌词'}</strong>
                <span>{hasTimedLyrics ? `当前 ${formatTime(currentTime)}` : '无时间轴时按文本展示'}</span>
              </div>
              <em>{hasTimedLyrics ? `偏移 ${formatLyricOffset(offsetMs)}` : '静态'}</em>
            </div>

            {hasLyrics ? (
              <div className={hasTimedLyrics ? 'lyrics-lines' : 'lyrics-lines plain'}>
                {lines.map((line, index) => (
                  <div
                    className={hasTimedLyrics && index === activeIndex ? 'lyric-line active' : 'lyric-line'}
                    key={line.id || `${line.time}-${index}`}
                    ref={hasTimedLyrics && index === activeIndex ? activeLineRef : null}
                  >
                    {hasTimedLyrics && <span>{formatTime(line.time)}</span>}
                    <p>{line.text}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="lyrics-empty">
                <Mic2 size={28} />
                <strong>还没有歌词</strong>
                <p>导入本地 LRC，或在右侧粘贴歌词后保存。</p>
              </div>
            )}

            <div className="lyrics-offset-controls">
              <button className="text-button bordered" disabled={!hasTimedLyrics} onClick={() => onOffsetChange(offsetMs - 500)} type="button">
                -0.5s
              </button>
              <button className="text-button bordered" disabled={!hasTimedLyrics} onClick={() => onOffsetChange(0)} type="button">
                重置
              </button>
              <button className="text-button bordered" disabled={!hasTimedLyrics} onClick={() => onOffsetChange(offsetMs + 500)} type="button">
                +0.5s
              </button>
            </div>
          </div>

          <div className="lyrics-editor">
            <div className="lyrics-editor-head">
              <strong>粘贴歌词</strong>
              <span>LRC 会自动同步，普通文本会作为静态歌词保存。</span>
            </div>
            <textarea
              value={draft}
              onChange={(event) => onChangeDraft(event.target.value)}
              placeholder={'[00:12.34]第一句歌词\n[00:18.20]第二句歌词'}
            />
            <div className="lyrics-editor-actions">
              <button className="primary-button" disabled={!track} onClick={onSave} type="button">
                <Mic2 size={15} />
                <span>保存歌词</span>
              </button>
              <button className="text-button bordered" disabled={!track} onClick={onImport} type="button">
                <Upload size={15} />
                <span>导入文件</span>
              </button>
              <button className="text-button danger" disabled={!track || !entry} onClick={onClear} type="button">
                <Trash2 size={14} />
                <span>清空</span>
              </button>
            </div>
            {status && <p className="lyrics-status">{status}</p>}
          </div>
        </section>
      </div>
    </div>
  );
}

function DesktopTitleBar({
  appInfo,
  isDesktopApp,
  isMaximized,
  isLoading,
  query,
  queueCount,
  searchInputRef,
  statusText,
  onClose,
  onMaximize,
  onMinimize,
  onQueryChange,
  onSearch
}) {
  const versionLabel = appInfo?.version ? `v${appInfo.version}` : 'Desktop';

  return (
    <header className="desktop-titlebar">
      <div className="titlebar-brand">
        <div className="titlebar-logo">
          <Music2 size={16} />
        </div>
        <div>
          <strong>BiliWave</strong>
          <span>{versionLabel}</span>
        </div>
      </div>

      <form
        className="titlebar-search"
        onSubmit={(event) => {
          event.preventDefault();
          onSearch?.();
        }}
      >
        <button
          aria-label={isLoading ? '正在搜索' : '搜索'}
          className="titlebar-search-button"
          disabled={isLoading}
          title={isLoading ? '正在搜索' : '搜索'}
          type="submit"
        >
          {isLoading ? <Loader2 className="spin" size={17} /> : <Search size={17} />}
        </button>
        <input
          aria-label="搜索 Bilibili 音乐"
          ref={searchInputRef}
          type="search"
          value={query}
          onChange={(event) => onQueryChange?.(event.target.value)}
          placeholder="搜索音乐、歌手、专辑、歌单..."
        />
        <span className="titlebar-shortcut" aria-hidden="true">Ctrl K</span>
      </form>

      <div className="titlebar-status">
        <div className="titlebar-avatar">
          <Music2 size={15} />
        </div>
        <div>
          <strong>BiliWave</strong>
          <span>{queueCount > 0 ? `队列 ${queueCount} 首` : '本地模式'}</span>
        </div>
        <em>LOCAL</em>
      </div>

      {isDesktopApp ? (
        <div className="window-controls" aria-label="窗口控制">
          <button onClick={onMinimize} type="button" title="最小化">
            <Minus size={14} />
          </button>
          <button onClick={onMaximize} type="button" title={isMaximized ? '还原' : '最大化'}>
            <Maximize2 size={13} />
          </button>
          <button className="close" onClick={onClose} type="button" title="关闭">
            <X size={14} />
          </button>
        </div>
      ) : (
        <div className="window-controls preview" aria-hidden="true" />
      )}
    </header>
  );
}

function getBilibiliEmbedUrl(track, revision = 0, seekTime = 0) {
  const params = new URLSearchParams({
    autoplay: '1',
    danmaku: '0',
    high_quality: '1',
    muted: '0',
    t: String(Math.max(0, Math.floor(seekTime || 0)))
  });

  if (track?.bv) {
    params.set('bvid', track.bv);
  } else if (track?.aid) {
    params.set('aid', String(track.aid).replace(/^av/i, ''));
  }

  if (!track?.isCollectionPart && track?.page && Number(track.page) > 1) {
    params.set('p', String(track.page));
  }

  if (track?.cid) {
    params.set('cid', String(track.cid));
  }

  if (revision > 0) {
    params.set('_r', String(revision));
  }

  return `https://player.bilibili.com/player.html?${params.toString()}`;
}

function BilibiliAudioSource({ isPlaying, onError, onReady, onSlow, track, revision, seekTime }) {
  const sourceUrl = getBilibiliEmbedUrl(track, revision, seekTime);
  const timersRef = React.useRef({ slowTimer: null, errorTimer: null });

  React.useEffect(() => {
    if (!isPlaying || !track) return undefined;

    clearBilibiliSourceTimers(timersRef.current);
    timersRef.current.slowTimer = window.setTimeout(() => {
      onSlow?.(track);
    }, 8000);
    timersRef.current.errorTimer = window.setTimeout(() => {
      onError?.(track);
    }, 45000);

    return () => {
      clearBilibiliSourceTimers(timersRef.current);
    };
  }, [isPlaying, onError, onSlow, sourceUrl, track]);

  function handleIframeLoad() {
    clearBilibiliSourceTimers(timersRef.current);
    onReady?.(track);
  }

  return (
    <div className="bilibili-audio-source" aria-hidden="true">
      {isPlaying && (
        <iframe
          allow="autoplay"
          onError={() => onError?.(track)}
          onLoad={handleIframeLoad}
          referrerPolicy="no-referrer-when-downgrade"
          src={sourceUrl}
          tabIndex={-1}
          title={`Bilibili 后台音频来源：${track.title}`}
        />
      )}
    </div>
  );
}

function clearBilibiliSourceTimers(timers) {
  if (!timers) return;
  window.clearTimeout(timers.slowTimer);
  window.clearTimeout(timers.errorTimer);
  timers.slowTimer = null;
  timers.errorTimer = null;
}

function BilibiliAudioStatusLine({ compact = false, isPlaying, onReconnect, status }) {
  const phase = status?.phase || 'idle';
  const isBusy = phase === 'connecting' || phase === 'slow' || phase === 'reconnecting';
  const isError = phase === 'error';
  const Icon = isBusy ? Loader2 : isPlaying ? Play : Pause;

  return (
    <div className={`audio-status-line ${compact ? 'compact' : ''} ${isError ? 'error' : ''}`}>
      <Icon className={isBusy ? 'spin' : ''} size={compact ? 14 : 16} />
      <span>{status?.message || '等待 B站官方播放器'}</span>
      {isError && (
        <button className="text-button mini" onClick={onReconnect} type="button">
          <RefreshCw size={13} />
          <span>重试</span>
        </button>
      )}
    </div>
  );
}

function BilibiliPlayerModal({ isPlaying, status, track, onClose, onOpenSource, onPlayPart, onReconnect, onStop }) {
  const metaItems = [
    { label: 'UP主', value: track.uploader || track.artist?.replace(/^UP 主：/, '') },
    { label: '播放量', value: track.views },
    { label: '时长', value: track.duration },
    { label: '分区', value: track.category }
  ].filter((item) => item.value);

  return (
    <div className="player-modal audio-drawer" role="dialog" aria-modal="false" aria-label="Bilibili 音频模式">
      <div className="player-modal-panel audio-mode-panel">
        <div className="player-modal-head">
          <div>
            <span>Bilibili 音频模式</span>
            <strong>{track.title}</strong>
          </div>
          <div className="player-modal-actions">
            <button className="text-button" onClick={onReconnect} type="button">
              <RefreshCw size={15} />
              <span>重新连接</span>
            </button>
            <button className="icon-button" onClick={onClose} type="button" title="隐藏面板">
              <X size={18} />
            </button>
          </div>
        </div>

        <section className="audio-player-body">
          <div className="audio-cover-shell">
            {track.cover ? (
              <img alt={track.title} onError={handleImageError} src={getCoverSrc(track)} />
            ) : (
              <div className="audio-cover-empty">
                <Music2 size={46} />
              </div>
            )}
          </div>
          <div className="audio-detail">
            <div className="audio-mode-pill">
              <Disc3 size={15} />
              <span>官方来源</span>
            </div>
            <h3>{track.title}</h3>
            <p>{track.artist || 'Bilibili 公开视频'}</p>
            <div className="audio-meta-grid">
              {metaItems.map((item) => (
                <div key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
            <BilibiliAudioStatusLine isPlaying={isPlaying} onReconnect={onReconnect} status={status} />
            <div className="audio-mode-actions">
              <button className="primary-button" onClick={onStop} type="button">
                <Pause size={15} />
                <span>停止</span>
              </button>
              <button className="text-button" onClick={onOpenSource} type="button">
                <ExternalLink size={15} />
                <span>打开原视频</span>
              </button>
            </div>
          </div>
        </section>

        <BilibiliPartList onPlayPart={onPlayPart} track={track} />
      </div>
    </div>
  );
}

function BilibiliPartList({ className = '', onPlayPart, track }) {
  const parts = Array.isArray(track?.parts) ? track.parts : [];
  const hasParts = parts.length > 1;
  const activePartIndex = getCurrentBilibiliPartIndex(track);
  const activePart = activePartIndex >= 0 ? parts[activePartIndex] : null;
  const currentPage = Number(activePart?.page || track?.page || 1);
  const activePartRef = React.useRef(null);
  const panelClassName = className ? `bilibili-part-panel ${className}` : 'bilibili-part-panel';

  React.useEffect(() => {
    if (!hasParts || !activePartRef.current) return;
    activePartRef.current.scrollIntoView({
      block: 'center',
      behavior: 'smooth'
    });
  }, [activePartIndex, currentPage, hasParts, track?.cid, track?.id, track?.title]);

  if (!track?.externalOnly) return null;

  return (
    <section className={panelClassName} aria-label="视频选集">
      <div className="part-panel-head">
        <strong>视频选集</strong>
        <span>{hasParts ? `当前 ${activePartIndex >= 0 ? activePartIndex + 1 : currentPage}/${parts.length}` : '无选集'}</span>
      </div>
      {hasParts ? (
        <div className="part-list">
          {parts.map((part, index) => {
            const isActive = index === activePartIndex;

            return (
              <button
                className={isActive ? 'part-item active' : 'part-item'}
                key={`${part.page}-${part.cid || part.title}`}
                onClick={() => onPlayPart(part)}
                ref={isActive ? activePartRef : null}
                type="button"
              >
                <span>{String(part.page).padStart(2, '0')}</span>
                <strong>{part.title}</strong>
                <em>{part.duration}</em>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="part-empty">当前视频没有返回分 P 或合集列表。</p>
      )}
    </section>
  );
}

function SettingsPanel({
  isDesktopApp,
  providers,
  settings,
  status,
  appInfo,
  selectedProvider,
  onUpdateSetting,
  onClearCache,
  onClearData,
  onExportPreferences,
  onImportPreferences,
  onResetPreferences
}) {
  return (
    <div className="settings-panel">
      {status && <div className="settings-status">{status}</div>}
      <section className="settings-section">
        <div className="settings-copy">
          <strong>窗口行为</strong>
          <p>控制 PC 桌面窗口的关闭与启动方式。</p>
        </div>
        <div className="settings-controls">
          <label className="toggle-row">
            <input
              checked={settings.closeToTray}
              onChange={(event) => onUpdateSetting('closeToTray', event.target.checked)}
              type="checkbox"
            />
            <span>关闭窗口时隐藏到托盘</span>
          </label>
          <label className="toggle-row">
            <input
              checked={settings.startMinimized}
              onChange={(event) => onUpdateSetting('startMinimized', event.target.checked)}
              type="checkbox"
            />
            <span>启动时最小化</span>
          </label>
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-copy">
          <strong>默认数据源</strong>
          <p>选择应用启动和搜索时优先使用的数据源。</p>
        </div>
        <label className="settings-select">
          <select
            value={settings.defaultProvider || selectedProvider}
            onChange={(event) => onUpdateSetting('defaultProvider', event.target.value)}
          >
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="settings-section">
        <div className="settings-copy">
          <strong>缓存</strong>
          <p>清理本地搜索服务缓存，不会删除歌单、队列或播放历史。</p>
        </div>
        <button className="primary-button" onClick={onClearCache} type="button">
          <RefreshCw size={15} />
          <span>清理搜索缓存</span>
        </button>
      </section>

      <section className="settings-section data-section">
        <div className="settings-copy">
          <strong>数据管理</strong>
          <p>导出或恢复歌单、播放历史、队列和偏好设置。导入后不会自动开始播放。</p>
        </div>
        <div className="data-actions">
          <button className="primary-button" onClick={onExportPreferences} type="button">
            <Download size={15} />
            <span>导出本地数据</span>
          </button>
          <button className="text-button bordered" onClick={onImportPreferences} type="button">
            <Upload size={15} />
            <span>导入本地数据</span>
          </button>
          <button className="text-button bordered" onClick={() => onClearData('history')} type="button">
            <Trash2 size={14} />
            <span>清空历史</span>
          </button>
          <button className="text-button bordered" onClick={() => onClearData('queue')} type="button">
            <ListMusic size={14} />
            <span>清空队列</span>
          </button>
          <button className="text-button bordered" onClick={() => onClearData('playback')} type="button">
            <Database size={14} />
            <span>清空当前播放</span>
          </button>
          <button className="text-button bordered" onClick={() => onClearData('lyrics')} type="button">
            <Mic2 size={14} />
            <span>清空歌词</span>
          </button>
          <button className="text-button danger" onClick={() => onClearData('playlists')} type="button">
            <Trash2 size={14} />
            <span>重置歌单</span>
          </button>
          <button className="text-button danger" onClick={onResetPreferences} type="button">
            <RotateCcw size={14} />
            <span>重置全部偏好</span>
          </button>
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-copy">
          <strong>快捷键</strong>
          <p>{isDesktopApp ? '桌面端已监听系统媒体键。' : 'Web 调试环境不启用系统媒体键。'}</p>
        </div>
        <div className="shortcut-list">
          <span>MediaPlayPause</span>
          <em>播放 / 暂停</em>
          <span>MediaNextTrack</span>
          <em>下一首</em>
          <span>MediaPreviousTrack</span>
          <em>上一首</em>
        </div>
      </section>

      <section className="settings-section about-section">
        <div className="settings-copy">
          <strong>关于</strong>
          <p>查看当前桌面应用版本、本地服务地址和数据目录。</p>
        </div>
        <div className="about-grid">
          <div>
            <span>应用名称</span>
            <em>{appInfo.name}</em>
          </div>
          <div>
            <span>当前版本</span>
            <em>{appInfo.version}</em>
          </div>
          <div>
            <span>本地 API</span>
            <em>{appInfo.apiUrl}</em>
          </div>
          <div>
            <span>数据目录</span>
            <em title={appInfo.userDataPath}>{appInfo.userDataPath}</em>
          </div>
          <div>
            <span>缓存目录</span>
            <em title={appInfo.cachePath}>{appInfo.cachePath}</em>
          </div>
          <div>
            <span>设置文件</span>
            <em title={appInfo.settingsPath}>{appInfo.settingsPath}</em>
          </div>
        </div>
      </section>
    </div>
  );
}

function IconActionButton({ children, className = 'icon-button small', label, onAction, title = label, ...dataAttributes }) {
  const lastPointerActionRef = React.useRef(0);

  function runAction(event) {
    event.preventDefault();
    event.stopPropagation();
    onAction?.();
  }

  function handleClick(event) {
    if (Date.now() - lastPointerActionRef.current < 250) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    runAction(event);
  }

  function handleKeyDown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    runAction(event);
  }

  function handlePointerDown(event) {
    lastPointerActionRef.current = Date.now();
    runAction(event);
  }

  return (
    <button
      aria-label={label}
      className={className}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      type="button"
      title={title}
      {...dataAttributes}
    >
      {children}
    </button>
  );
}

function VirtualList({
  className = '',
  itemCount,
  itemHeight,
  renderItem,
  overscan = 6,
  resetKey = '',
  resetScrollToItem = true,
  scrollContainerRef = null
}) {
  const scrollRef = React.useRef(null);
  const [viewportHeight, setViewportHeight] = React.useState(0);
  const [scrollTop, setScrollTop] = React.useState(0);
  const usesExternalScroll = Boolean(scrollContainerRef);

  React.useLayoutEffect(() => {
    const element = scrollRef.current;
    const scrollElement = scrollContainerRef?.current || element;
    if (!element || !scrollElement) return undefined;

    const syncViewport = () => {
      const nextViewportHeight = scrollElement.clientHeight;
      if (usesExternalScroll) {
        const elementRect = element.getBoundingClientRect();
        const scrollRect = scrollElement.getBoundingClientRect();
        const listTop = elementRect.top - scrollRect.top + scrollElement.scrollTop;
        setScrollTop(Math.max(0, scrollElement.scrollTop - listTop));
      } else {
        setScrollTop(scrollElement.scrollTop);
      }
      setViewportHeight(nextViewportHeight);
    };

    syncViewport();
    scrollElement.addEventListener('scroll', syncViewport, { passive: true });

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', syncViewport);
      return () => {
        scrollElement.removeEventListener('scroll', syncViewport);
        window.removeEventListener('resize', syncViewport);
      };
    }

    const observer = new ResizeObserver(syncViewport);
    observer.observe(element);
    if (scrollElement !== element) observer.observe(scrollElement);
    return () => {
      scrollElement.removeEventListener('scroll', syncViewport);
      observer.disconnect();
    };
  }, [scrollContainerRef, usesExternalScroll]);

  React.useEffect(() => {
    setScrollTop(0);
    const element = scrollRef.current;
    const scrollElement = scrollContainerRef?.current || element;
    if (!element || !scrollElement) return;

    if (usesExternalScroll && resetScrollToItem) {
      const elementRect = element.getBoundingClientRect();
      const scrollRect = scrollElement.getBoundingClientRect();
      const listTop = elementRect.top - scrollRect.top + scrollElement.scrollTop;
      scrollElement.scrollTop = Math.max(0, listTop);
    } else {
      scrollElement.scrollTop = 0;
    }
  }, [resetKey, resetScrollToItem, scrollContainerRef, usesExternalScroll]);

  function handleScroll(event) {
    if (usesExternalScroll) return;
    setScrollTop(event.currentTarget.scrollTop);
  }

  const safeItemCount = Math.max(0, itemCount);
  const safeItemHeight = Math.max(1, itemHeight);
  const visibleCount = viewportHeight > 0 ? Math.ceil(viewportHeight / safeItemHeight) : 10;
  const startIndex = Math.max(0, Math.floor(scrollTop / safeItemHeight) - overscan);
  const endIndex = Math.min(safeItemCount, startIndex + visibleCount + overscan * 2);
  const totalHeight = safeItemCount * safeItemHeight;
  const offsetTop = startIndex * safeItemHeight;
  const visibleItems = [];

  for (let index = startIndex; index < endIndex; index += 1) {
    visibleItems.push(renderItem(index));
  }

  return (
    <div className={`virtual-list ${usesExternalScroll ? 'external-scroll' : ''} ${className}`.trim()} onScroll={handleScroll} ref={scrollRef}>
      <div className="virtual-list-spacer" style={{ height: totalHeight }}>
        <div className="virtual-list-window" style={{ transform: `translateY(${offsetTop}px)` }}>
          {visibleItems}
        </div>
      </div>
    </div>
  );
}

const TrackRow = React.memo(function TrackRow({ currentTrackId, favoriteTrackIds, index, onAdd, onFavorite, onPlay, track }) {
  const isFavorite = favoriteTrackIds?.has(track.id);

  return (
    <article className={currentTrackId === track.id ? 'track-row active' : 'track-row'} key={track.id}>
      <button
        className={canPlayInApp(track) ? 'track-index' : 'track-index external'}
        onClick={() => onPlay(track)}
        type="button"
        title={canPlayInApp(track) ? '播放' : '播放 B站音频'}
      >
        <span>{String(index + 1).padStart(2, '0')}</span>
        <Play size={16} />
      </button>
      <img alt={track.title} loading="lazy" onError={handleImageError} src={getCoverSrc(track)} />
      <div className="track-title">
        <strong>{track.title}</strong>
        <span>{track.artist}</span>
      </div>
      <span className="track-meta">{track.category}</span>
      <span className="track-meta">{track.views}</span>
      <span className="track-time">{track.duration}</span>
      <div className="row-actions">
        {canPlayFromQueue(track) ? (
          <button
            aria-label="加入队列"
            className="queue-add-button"
            data-queue-track-id={track.id}
            data-queue-track-title={track.title}
            onClick={() => onAdd(track)}
            type="button"
            title="加入队列"
          >
            <Plus size={15} />
          </button>
        ) : null}
        <IconActionButton
          className={isFavorite ? 'icon-button small active' : 'icon-button small'}
          label={isFavorite ? '已收藏到当前歌单' : '收藏到当前歌单'}
          onAction={() => onFavorite(track)}
        >
          <Heart fill={isFavorite ? 'currentColor' : 'none'} size={15} />
        </IconActionButton>
        <a className="icon-button small" href={track.sourceUrl} rel="noreferrer" target="_blank" title="打开原视频">
          <ExternalLink size={15} />
        </a>
      </div>
    </article>
  );
});

function TrackTable({
  tracks,
  currentTrack,
  favoriteTrackIds,
  onPlay,
  onAdd,
  onFavorite,
  emptyText,
  resetKey = '',
  resetScrollToItem = true,
  scrollContainerRef = null
}) {
  if (tracks.length === 0) {
    return (
      <div className="empty-table">
        <Search size={28} />
        <p>{emptyText}</p>
      </div>
    );
  }

  return (
    <VirtualList
      className="track-table virtual-track-table"
      itemCount={tracks.length}
      itemHeight={virtualTrackRowHeight}
      resetKey={resetKey}
      resetScrollToItem={resetScrollToItem}
      scrollContainerRef={scrollContainerRef}
      renderItem={(index) => (
        <TrackRow
          currentTrackId={currentTrack?.id}
          favoriteTrackIds={favoriteTrackIds}
          index={index}
          key={tracks[index].id}
          onAdd={onAdd}
          onFavorite={onFavorite}
          onPlay={onPlay}
          track={tracks[index]}
        />
      )}
    />
  );
}

function PlaylistDetail({ playlist, currentTrack, onPlay, onAdd, onRemove, scrollContainerRef = null }) {
  if (!playlist) {
    return (
      <div className="empty-table">
        <Library size={28} />
        <p>还没有歌单</p>
      </div>
    );
  }

  if (playlist.tracks.length === 0) {
    return (
      <div className="playlist-empty">
        <Library size={30} />
        <strong>{playlist.name}</strong>
        <p>从搜索结果点击爱心收藏歌曲。</p>
      </div>
    );
  }

  return (
    <VirtualList
      className="track-table virtual-track-table"
      itemCount={playlist.tracks.length}
      itemHeight={virtualTrackRowHeight}
      resetKey={playlist.id}
      scrollContainerRef={scrollContainerRef}
      renderItem={(index) => {
        const track = playlist.tracks[index];

        return (
          <PlaylistTrackRow
            currentTrackId={currentTrack?.id}
            index={index}
            key={track.id}
            onAdd={onAdd}
            onPlay={onPlay}
            onRemove={onRemove}
            track={track}
          />
        );
      }}
    />
  );
}

const PlaylistTrackRow = React.memo(function PlaylistTrackRow({ currentTrackId, index, onAdd, onPlay, onRemove, track }) {
  return (
    <article className={currentTrackId === track.id ? 'track-row active' : 'track-row'}>
      <button
        className={canPlayInApp(track) ? 'track-index' : 'track-index external'}
        onClick={() => onPlay(track)}
        type="button"
        title={canPlayInApp(track) ? '播放' : '播放 B站音频'}
      >
        <span>{String(index + 1).padStart(2, '0')}</span>
        <Play size={16} />
      </button>
      <img alt={track.title} loading="lazy" onError={handleImageError} src={getCoverSrc(track)} />
      <div className="track-title">
        <strong>{track.title}</strong>
        <span>{track.artist}</span>
      </div>
      <span className="track-meta">{track.category}</span>
      <span className="track-meta">{track.views}</span>
      <span className="track-time">{track.duration}</span>
      <div className="row-actions">
        {canPlayFromQueue(track) ? (
          <button
            aria-label="加入队列"
            className="queue-add-button"
            data-queue-track-id={track.id}
            data-queue-track-title={track.title}
            onClick={() => onAdd(track)}
            type="button"
            title="加入队列"
          >
            <Plus size={15} />
          </button>
        ) : null}
        <IconActionButton label="从歌单移除" onAction={() => onRemove(track.id)}>
          <X size={15} />
        </IconActionButton>
      </div>
    </article>
  );
});

const QueueItem = React.memo(function QueueItem({ currentTrackId, index, isFirst, isLast, onMove, onPlay, onRemove, track }) {
  return (
    <div className={currentTrackId === track.id ? 'queue-item active' : 'queue-item'}>
      <button className="queue-main" onClick={() => onPlay(track)} type="button">
        <span>{String(index + 1).padStart(2, '0')}</span>
        <img alt="" loading="lazy" onError={handleImageError} src={getCoverSrc(track)} />
        <span className="queue-copy">
          <strong>{track.title}</strong>
          <em>{track.externalOnly ? 'B站音频' : '本地音频'}</em>
        </span>
      </button>
      <button className="icon-button small" onClick={() => onRemove(track.id)} type="button" title="移出队列">
        <X size={14} />
      </button>
      <div className="queue-reorder">
        <button
          className="icon-button tiny"
          disabled={isFirst}
          onClick={() => onMove(track.id, 'up')}
          type="button"
          title="上移"
        >
          <ArrowUp size={12} />
        </button>
        <button
          className="icon-button tiny"
          disabled={isLast}
          onClick={() => onMove(track.id, 'down')}
          type="button"
          title="下移"
        >
          <ArrowDown size={12} />
        </button>
      </div>
    </div>
  );
});

function SkeletonList() {
  return (
    <div className="skeleton-list">
      {Array.from({ length: 6 }).map((_, index) => (
        <div className="skeleton-row" key={index}>
          <span />
          <div />
          <p />
        </div>
      ))}
    </div>
  );
}

function ApiPortNotice({ status }) {
  if (!status?.conflictDetected && !status?.usingFallback && status?.managedByApp !== false) return null;

  return (
    <div className="api-port-notice" role="status">
      <AlertTriangle size={17} />
      <div>
        <strong>{status?.usingFallback ? '已自动切换本地 API 端口' : '检测到本地 API 端口占用'}</strong>
        <span>
          {status?.message ||
            `首选端口 ${status?.preferredPort || 8787} 当前不可用，正在使用 ${status?.apiUrl || '备用端口'}。`}
        </span>
      </div>
    </div>
  );
}

function SearchLoadMore({ canLoadMore, error, isLoading, limit, maxLimit, onLoadMore, resultCount }) {
  if (!canLoadMore && !error) return null;

  return (
    <div className="load-more-panel">
      <div>
        <strong>{error || `已显示 ${resultCount} 条结果`}</strong>
        <span>
          {error
            ? '已有结果已保留，可以稍后再次加载。'
            : limit >= maxLimit
              ? '已达到本次搜索上限。'
              : `继续加载会扩展到最多 ${Math.min(maxLimit, limit + searchLoadMoreStep)} 条。`}
        </span>
      </div>
      {canLoadMore && (
        <button className="text-button" disabled={isLoading} onClick={onLoadMore} type="button">
          {isLoading ? <Loader2 className="spin" size={15} /> : <Plus size={15} />}
          <span>{isLoading ? '加载中' : '加载更多'}</span>
        </button>
      )}
    </div>
  );
}

function ErrorState({ error, provider, onRetry }) {
  return (
    <div className="error-state">
      <RefreshCw size={28} />
      <div>
        <strong>{error.message}</strong>
        <p>
          {error.code === 'PROVIDER_NOT_CONFIGURED'
            ? `${provider?.name || '该数据源'} 尚未接入官方或授权接口。`
            : '请检查本地服务状态后重试。'}
        </p>
        {error.details?.queryType && <span>已识别查询类型：{error.details.queryType.toUpperCase()}</span>}
      </div>
      <button className="primary-button" onClick={onRetry} type="button">
        <RefreshCw size={15} />
        <span>重试</span>
      </button>
    </div>
  );
}

const rootElement = document.getElementById('root');
const appRoot = window.__biliwaveRoot || createRoot(rootElement);
window.__biliwaveRoot = appRoot;
appRoot.render(<App />);
