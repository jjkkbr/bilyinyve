const requestBuckets = new Map();

export function isRateLimited(ip, { maxRequests = 30, windowMs = 60_000 } = {}) {
  const now = Date.now();
  const bucket = requestBuckets.get(ip) || [];
  const freshBucket = bucket.filter((timestamp) => now - timestamp < windowMs);

  freshBucket.push(now);
  requestBuckets.set(ip, freshBucket);

  return freshBucket.length > maxRequests;
}
