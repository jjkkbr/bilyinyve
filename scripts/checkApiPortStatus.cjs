const { createApiPortStatus, createApiUrl } = require('../electron/apiPortStatus.cjs');

const primary = createApiPortStatus({
  preferredPort: 8787,
  actualPort: 8787,
  host: '127.0.0.1'
});

assert(primary.apiUrl === 'http://127.0.0.1:8787', 'primary API URL should use preferred port');
assert(primary.usingFallback === false, 'primary port should not report fallback');
assert(primary.conflictDetected === false, 'primary port should not report conflict by default');
assert(primary.managedByApp === true, 'primary status should be managed by default');

const fallback = createApiPortStatus({
  preferredPort: 8787,
  actualPort: 19001,
  host: '127.0.0.1',
  conflictDetected: true
});

assert(fallback.apiUrl === 'http://127.0.0.1:19001', 'fallback API URL should use actual port');
assert(fallback.usingFallback === true, 'fallback port should report fallback');
assert(fallback.conflictDetected === true, 'fallback port should report conflict');
assert(fallback.message.includes('19001'), 'fallback message should include actual port');

const occupied = createApiPortStatus({
  preferredPort: 8787,
  actualPort: 8787,
  host: '127.0.0.1',
  conflictDetected: true,
  managedByApp: false,
  message: '端口被旧版本占用'
});

assert(occupied.managedByApp === false, 'occupied status should preserve unmanaged flag');
assert(occupied.conflictDetected === true, 'occupied status should report conflict');
assert(occupied.message === '端口被旧版本占用', 'occupied status should preserve custom message');
assert(createApiUrl('127.0.0.1', 8787) === 'http://127.0.0.1:8787', 'createApiUrl should format localhost URL');

console.log('API port status checks passed');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
