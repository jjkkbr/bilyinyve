function createApiUrl(host, port) {
  return `http://${host}:${port}`;
}

function createApiPortStatus({
  preferredPort = 8787,
  actualPort,
  host = '127.0.0.1',
  conflictDetected = false,
  managedByApp = true,
  message = ''
} = {}) {
  const resolvedPort = Number.isFinite(actualPort) ? actualPort : preferredPort;
  const usingFallback = resolvedPort !== preferredPort;

  return {
    preferredPort,
    actualPort: resolvedPort,
    apiUrl: createApiUrl(host, resolvedPort),
    conflictDetected: Boolean(conflictDetected),
    usingFallback,
    managedByApp: Boolean(managedByApp),
    message:
      message ||
      (usingFallback
        ? `本地 API 已切换到备用端口 ${resolvedPort}。`
        : `本地 API 已在端口 ${resolvedPort} 启动。`)
  };
}

module.exports = {
  createApiPortStatus,
  createApiUrl
};
