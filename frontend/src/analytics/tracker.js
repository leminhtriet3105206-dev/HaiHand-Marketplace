const CONSENT_KEY = 'hh_analytics_consent';
const ANON_ID_KEY = 'hh_aid';
const SESSION_ID_KEY = 'hh_sid';
const SESSION_TS_KEY = 'hh_sid_ts';
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 phút
const FLUSH_INTERVAL_MS = 5000;
const BATCH_SIZE = 10;
const MAX_QUEUE_SIZE = 100;

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000';
const TRACK_URL = `${API_URL}/api/track`;

let queue = [];
let flushTimer = null;
let initialized = false;
let retryDelayMs = 2000;
const impressedKeys = new Set();

function generateUuid() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {}
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function isDoNotTrackEnabled() {
  try {
    const dnt =
      navigator.doNotTrack ||
      window.doNotTrack ||
      navigator.msDoNotTrack;
    return dnt === '1' || dnt === 'yes';
  } catch {
    return false;
  }
}

export function getConsent() {
  try {
    const val = localStorage.getItem(CONSENT_KEY);
    if (val === 'granted' || val === 'denied') return val;
    return null;
  } catch {
    return null;
  }
}

export function isTrackingAllowed() {
  return getConsent() === 'granted' && !isDoNotTrackEnabled();
}

export function setConsent(granted) {
  try {
    const value = granted ? 'granted' : 'denied';
    localStorage.setItem(CONSENT_KEY, value);
    if (!granted) {
      queue = [];
      localStorage.removeItem(ANON_ID_KEY);
      localStorage.removeItem(SESSION_ID_KEY);
      localStorage.removeItem(SESSION_TS_KEY);
    } else {
      ensureIds();
    }
    window.dispatchEvent(new CustomEvent('hhAnalyticsConsentChanged', { detail: { consent: value } }));
  } catch {}
}

function ensureIds() {
  if (!isTrackingAllowed()) return { anonymousId: null, sessionId: null };
  try {
    let anonymousId = localStorage.getItem(ANON_ID_KEY);
    if (!anonymousId) {
      anonymousId = generateUuid();
      localStorage.setItem(ANON_ID_KEY, anonymousId);
    }

    const now = Date.now();
    let sessionId = localStorage.getItem(SESSION_ID_KEY);
    const lastActive = Number(localStorage.getItem(SESSION_TS_KEY) || 0);

    if (!sessionId || !lastActive || now - lastActive > SESSION_TIMEOUT_MS) {
      sessionId = generateUuid();
      localStorage.setItem(SESSION_ID_KEY, sessionId);
    }
    localStorage.setItem(SESSION_TS_KEY, String(now));
    return { anonymousId, sessionId };
  } catch {
    return { anonymousId: null, sessionId: null };
  }
}

export function getAnalyticsIds() {
  return ensureIds();
}

function getStoredToken() {
  try {
    const raw = localStorage.getItem('user');
    if (!raw || raw === 'undefined') return null;
    const parsed = JSON.parse(raw);
    return parsed?.token || null;
  } catch {
    return null;
  }
}

function sendBatch(batch, { useBeacon = false } = {}) {
  if (!batch || batch.length === 0 || !isTrackingAllowed()) return Promise.resolve(true);

  const { anonymousId, sessionId } = ensureIds();
  if (!anonymousId || !sessionId) return Promise.resolve(false);

  const token = getStoredToken();
  const payloadObj = {
    anonymousId,
    sessionId,
    events: batch
  };
  if (useBeacon && token) {
    payloadObj.auth = token;
  }
  const body = JSON.stringify(payloadObj);

  if (useBeacon && !token && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    try {
      const blob = new Blob([body], { type: 'application/json' });
      const ok = navigator.sendBeacon(TRACK_URL, blob);
      if (ok) return Promise.resolve(true);
    } catch {}
  }

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    return fetch(TRACK_URL, {
      method: 'POST',
      headers,
      body,
      keepalive: Boolean(useBeacon)
    })
      .then((res) => res.ok || res.status === 204 || res.status === 413 || res.status === 400)
      .catch(() => false);
  } catch {
    return Promise.resolve(false);
  }
}

export async function flush({ useBeacon = false } = {}) {
  try {
    if (!isTrackingAllowed() || queue.length === 0) return;

    while (queue.length > 0) {
      const batch = queue.splice(0, 20);
      const ok = await sendBatch(batch, { useBeacon });
      if (!ok) {
        // Đẩy lại vào đầu hàng đợi nếu lỗi mạng, giữ tối đa MAX_QUEUE_SIZE
        queue = [...batch, ...queue].slice(0, MAX_QUEUE_SIZE);
        const delay = retryDelayMs;
        retryDelayMs = Math.min(retryDelayMs * 2, 30000);
        setTimeout(() => {
          flush();
        }, delay);
        break;
      } else {
        retryDelayMs = 2000;
      }
    }
  } catch {}
}

export function track(name, props = {}, contextOverride = {}) {
  try {
    if (!name || !isTrackingAllowed()) return;
    ensureIds();

    const event = {
      eventId: generateUuid(),
      name: String(name),
      ts: new Date().toISOString(),
      props: props && typeof props === 'object' ? props : {},
      context: {
        path: typeof window !== 'undefined' ? window.location.pathname : '',
        locale: typeof navigator !== 'undefined' ? navigator.language || '' : '',
        viewport: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : '',
        ...contextOverride
      }
    };

    if (queue.length >= MAX_QUEUE_SIZE) {
      queue.shift();
    }
    queue.push(event);

    if (queue.length >= BATCH_SIZE) {
      flush();
    }
  } catch {}
}

export function identify() {
  try {
    if (!isTrackingAllowed()) return;
    ensureIds();
    flush();
  } catch {}
}

export function initTracker() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  if (!flushTimer) {
    flushTimer = setInterval(() => {
      flush();
    }, FLUSH_INTERVAL_MS);
  }

  const handleHide = () => {
    if (document.visibilityState === 'hidden') {
      flush({ useBeacon: true });
    }
  };
  const handlePageHide = () => {
    flush({ useBeacon: true });
  };

  document.addEventListener('visibilitychange', handleHide);
  window.addEventListener('pagehide', handlePageHide);
}

/**
 * Throttle product_impression bằng IntersectionObserver (≥50% thẻ hiện trong ≥1 giây).
 * Mỗi sản phẩm tối đa 1 lần / phiên / list.
 */
export function observeProductImpressions(elements, listName = 'home') {
  if (typeof IntersectionObserver === 'undefined' || !isTrackingAllowed()) {
    return () => {};
  }

  const pendingTimers = new Map();
  let impressionBuffer = [];
  let bufferTimer = null;

  const flushImpressions = () => {
    if (impressionBuffer.length === 0) return;
    const batch = impressionBuffer.splice(0, 20);
    track('product_impression', { productIds: batch, list: listName });
  };

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const pid = entry.target?.getAttribute?.('data-product-id');
        if (!pid) return;
        const key = `${listName}:${pid}`;
        if (impressedKeys.has(key)) return;

        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
          if (!pendingTimers.has(pid)) {
            const t = setTimeout(() => {
              impressedKeys.add(key);
              impressionBuffer.push(pid);
              if (impressionBuffer.length >= 20) {
                flushImpressions();
              } else if (!bufferTimer) {
                bufferTimer = setTimeout(() => {
                  bufferTimer = null;
                  flushImpressions();
                }, 1200);
              }
              pendingTimers.delete(pid);
            }, 1000);
            pendingTimers.set(pid, t);
          }
        } else if (pendingTimers.has(pid)) {
          clearTimeout(pendingTimers.get(pid));
          pendingTimers.delete(pid);
        }
      });
    },
    { threshold: [0.5] }
  );

  elements.forEach((el) => {
    if (el) observer.observe(el);
  });

  return () => {
    observer.disconnect();
    pendingTimers.forEach((t) => clearTimeout(t));
    pendingTimers.clear();
    if (bufferTimer) clearTimeout(bufferTimer);
    flushImpressions();
  };
}

export function __resetTrackerForTests() {
  queue = [];
  impressedKeys.clear();
  initialized = false;
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}
