// sweep runs on macOS and Linux; Windows paths and tools differ (out of scope for v1).
export const supported = (platform) => platform === 'darwin' || platform === 'linux';
