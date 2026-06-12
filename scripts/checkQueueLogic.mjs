import {
  appendUniqueTrack,
  appendUniqueTracks,
  canPlayFromQueue,
  canPlayInApp,
  getNextQueueTrack,
  getPreviousQueueTrack,
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

console.log('Queue logic checks passed');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
