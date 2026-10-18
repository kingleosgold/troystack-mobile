// Minimum version check. Runs beside launch instead of in front of it, so a
// slow or dead network never holds the loading screen. Fails open.

export const MIN_VERSION_URL = 'https://api.stacktrackergold.com/v1/min-version';
export const MIN_VERSION_TIMEOUT_MS = 5000;

export const isVersionBelow = (current, minimum) => {
  const cur = String(current).split('.').map(Number);
  const min = String(minimum).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((cur[i] || 0) < (min[i] || 0)) return true;
    if ((cur[i] || 0) > (min[i] || 0)) return false;
  }
  return false;
};

// The update screen's message and store link, or null when this version may run
export const requiredUpdate = (versionData, platform, appVersion) => {
  const platformData = versionData?.[platform];
  if (!versionData?.enforced || !platformData?.minVersion) return null;
  if (!isVersionBelow(appVersion, platformData.minVersion)) return null;
  return { message: versionData.message, storeUrl: platformData.store_url };
};

export const checkMinVersion = async ({ fetchFn, platform, appVersion, url = MIN_VERSION_URL, timeoutMs = MIN_VERSION_TIMEOUT_MS }) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn(url, { signal: controller.signal });
    if (!res.ok) return null;
    return requiredUpdate(await res.json(), platform, appVersion);
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};
