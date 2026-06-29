import { createLyricEntry, getActiveLyricIndex, getLyricPreview, parseLyrics } from '../src/services/lyrics.js';

const lrc = parseLyrics('[00:01.00][00:03.50]Hello\n[00:05.25]BiliWave');
assert(lrc.type === 'lrc', 'timestamped lyrics should parse as lrc');
assert(lrc.lines.length === 3, 'multiple timestamps should create multiple lyric lines');
assert(lrc.lines[1].time === 3.5, 'centisecond timestamps should normalize to seconds');
assert(lrc.lines[2].text === 'BiliWave', 'lyric text should persist');

const plain = parseLyrics('First line\n\nSecond line');
assert(plain.type === 'text', 'plain text should parse as text lyrics');
assert(plain.lines.length === 2, 'blank plain text lines should be ignored');
assert(plain.lines[0].time === null, 'plain text lyrics should not have timestamps');

const entry = createLyricEntry('[00:10.00]Line A\n[00:20.00]Line B', { offsetMs: -1000 });
assert(entry.type === 'lrc', 'created entry should keep lrc type');
assert(getActiveLyricIndex(entry, 11) === 0, 'negative offset should delay active lyric timing');
assert(getActiveLyricIndex(entry, 21) === 1, 'active lyric should follow adjusted playback time');
assert(getLyricPreview(entry, 1) === 'Line A', 'preview should return leading lyric lines');

console.log('Lyrics checks passed');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
