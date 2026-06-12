import { demoTracks } from '../demoCatalog.js';
import { normalizeTrack } from '../metadata.js';

export const demoProvider = {
  id: 'demo',
  name: '本地演示数据源',
  mode: 'demo',
  authorized: true,
  canStream: true,
  canDownload: false,
  description: '使用本地演示曲库和公开试听音频，用于开发播放器交互与服务边界。',
  complianceNotice: '当前为本地演示数据。真实接入时应使用官方或授权接口，不绕过会员、付费、版权或地区限制。',
  async search({ keyword }) {
    const normalizedKeyword = keyword.trim().toLowerCase();
    const normalizedTracks = demoTracks.map(normalizeTrack);

    if (!normalizedKeyword) {
      return [];
    }

    const matches = normalizedTracks.filter((track) => {
      const haystack = [
        track.title,
        track.rawTitle,
        track.artist,
        track.uploader,
        track.category,
        track.bv
      ]
        .join(' ')
        .toLowerCase();

      return (
        haystack.includes(normalizedKeyword) ||
        normalizedKeyword.includes('bilibili') ||
        normalizedKeyword.includes('音乐')
      );
    });

    return matches.length > 0 ? matches : normalizedTracks;
  }
};
