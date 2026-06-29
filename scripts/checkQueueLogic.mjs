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
} from '../src/services/queueLogic.js';

const localTrack = {
  id: 'demo-local',
  title: 'Local demo',
  audioUrl: 'https://example.test/audio.mp3'
};

const bilibiliTrack = {
  id: 'bilibili-BV1xx411c7mD',
  title: 'Bilibili demo',
  externalOnly: true,
  bv: 'BV1xx411c7mD',
  sourceUrl: 'https://www.bilibili.com/video/BV1xx411c7mD/'
};

const secondBilibiliTrack = {
  id: 'bilibili-BV1zz411c7mZ',
  title: 'Second Bilibili demo',
  externalOnly: true,
  bv: 'BV1zz411c7mZ',
  sourceUrl: 'https://www.bilibili.com/video/BV1zz411c7mZ/'
};

const multipartBilibiliTrack = {
  ...bilibiliTrack,
  id: 'bilibili-BV1xx411c7mD-p1',
  page: 1,
  parts: [
    { page: 1, cid: 1001, title: 'Part 1', duration: '01:00' },
    { page: 2, cid: 1002, title: 'Part 2', duration: '02:00' },
    { page: 3, cid: 1003, title: 'Part 3', duration: '03:00' }
  ]
};

const seasonBilibiliTrack = {
  ...bilibiliTrack,
  id: 'bilibili-BVcollection-p2-BVseason002',
  title: 'Part 2 collection title',
  bv: 'BVseason002',
  page: 1,
  cid: 1001,
  sourceUrl: 'https://www.bilibili.com/video/BVseason002/',
  isCollectionPart: true,
  parts: [
    {
      page: 1,
      cid: 1001,
      bvid: 'BVseason001',
      title: 'Part 1 collection title',
      sourceUrl: 'https://www.bilibili.com/video/BVseason001/'
    },
    {
      page: 2,
      cid: 1002,
      bvid: 'BVseason002',
      title: 'Part 2 collection title',
      sourceUrl: 'https://www.bilibili.com/video/BVseason002/'
    }
  ]
};

const invalidTrack = {
  id: 'missing-source',
  title: 'Missing source'
};

assert(canPlayInApp(localTrack) === true, 'local audio should play in app');
assert(canPlayInApp(bilibiliTrack) === false, 'Bilibili external track should not use native audio');
assert(canPlayFromQueue(localTrack) === true, 'local audio should be queueable');
assert(canPlayFromQueue(bilibiliTrack) === true, 'Bilibili external track should be queueable');

const queueWithBilibili = appendUniqueTrack([localTrack], bilibiliTrack);
assert(queueWithBilibili.length === 2, 'Bilibili track should append to queue');
assert(queueWithBilibili[1].id === bilibiliTrack.id, 'Bilibili track should keep queue order');
assert(
  appendUniqueTrack(queueWithBilibili, bilibiliTrack) === queueWithBilibili,
  'duplicate Bilibili track should not create a new queue array'
);

const bulkAppended = appendUniqueTracks([localTrack], [bilibiliTrack, localTrack, invalidTrack, secondBilibiliTrack]);
assert(bulkAppended.length === 3, 'bulk append should add only unique playable tracks');
assert(bulkAppended[1].id === bilibiliTrack.id, 'bulk append should preserve incoming order');
assert(bulkAppended[2].id === secondBilibiliTrack.id, 'bulk append should keep later unique tracks');
assert(
  appendUniqueTracks(bulkAppended, [localTrack, invalidTrack]) === bulkAppended,
  'bulk append without valid additions should keep the original queue array'
);

const movedDown = moveQueueTrack(bulkAppended, localTrack.id, 'down');
assert(movedDown[1].id === localTrack.id, 'queue move down should shift the selected track');
const movedUp = moveQueueTrack(movedDown, localTrack.id, 'up');
assert(movedUp[0].id === localTrack.id, 'queue move up should shift the selected track');
assert(moveQueueTrack(movedUp, localTrack.id, 'up') === movedUp, 'queue move up should not move past the first item');
assert(
  moveQueueTrack(movedUp, secondBilibiliTrack.id, 'down') === movedUp,
  'queue move down should not move past the last item'
);

const prepended = prependNewTrack([], bilibiliTrack);
assert(prepended.length === 1 && prepended[0].id === bilibiliTrack.id, 'Bilibili playback should seed empty queue');
assert(
  prependNewTrack(queueWithBilibili, bilibiliTrack) === queueWithBilibili,
  'playing queued Bilibili track should not move its position'
);

assert(
  getNextQueueTrack({ currentTrack: localTrack, mode: 'list', queue: queueWithBilibili }).id === bilibiliTrack.id,
  'next track should advance from local audio to Bilibili audio'
);
assert(
  getPreviousQueueTrack({ currentTrack: localTrack, queue: queueWithBilibili }).id === bilibiliTrack.id,
  'previous track should wrap from local audio to Bilibili audio'
);
assert(
  getRandomQueueTrack({ currentTrack: null, queue: bulkAppended, random: () => 0.75 }).id === secondBilibiliTrack.id,
  'shuffle starter should choose from the whole queue instead of always using the first track'
);
assert(
  getNextQueueTrack({ currentTrack: localTrack, mode: 'shuffle', queue: bulkAppended, random: () => 0 }).id === bilibiliTrack.id,
  'shuffle next should avoid replaying the current track when other tracks exist'
);
assert(getNextBilibiliPart(multipartBilibiliTrack).page === 2, 'multipart Bilibili track should advance to next part');
assert(
  getCurrentBilibiliPartIndex({ ...multipartBilibiliTrack, page: undefined, cid: 1003 }) === 2,
  'legacy Bilibili track should locate current part by cid when page is missing'
);
assert(
  getCurrentBilibiliPartIndex({ ...multipartBilibiliTrack, page: 1, cid: 1003 }) === 2,
  'legacy Bilibili track should prefer cid over stale page data'
);
assert(
  getCurrentBilibiliPartIndex(seasonBilibiliTrack) === 1,
  'Bilibili collection track should prefer bvid over stale cid and page data'
);
assert(
  getNextBilibiliPart(seasonBilibiliTrack) === null,
  'last matched Bilibili collection part should not advance to a missing part'
);
assert(
  getCurrentBilibiliPartIndex({ ...multipartBilibiliTrack, page: undefined, cid: null, title: 'Part 2' }) === 1,
  'legacy Bilibili track should locate current part by title when page is missing'
);
assert(
  getCurrentBilibiliPartIndex({ ...multipartBilibiliTrack, id: 'bilibili-BV1xx411c7mD-p3', page: undefined, cid: null, title: 'Unknown' }) === 2,
  'legacy Bilibili track should locate current part by id page marker'
);
assert(
  getNextBilibiliPart({
    ...multipartBilibiliTrack,
    id: 'bilibili-BV1xx411c7mD-p3',
    page: 3,
    cid: 1003,
    title: 'Part 3'
  }) === null,
  'last Bilibili part should not advance to a missing part'
);
assert(getNextBilibiliPart(bilibiliTrack) === null, 'single Bilibili track should not have a next part');

console.log('Queue logic checks passed');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
