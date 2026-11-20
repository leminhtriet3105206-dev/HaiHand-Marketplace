/**
 * User Behavioral Tracker
 * HaiHand Marketplace
 * Non-blocking, privacy-first, batching behavioral analytics client
 */

import axiosClient from '../api/axiosClient';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000';
const TRACK_ENDPOINT = `${API_URL}/api/track`;
const OPTOUT_KEY = 'haihand_track_optout';
const ANON_ID_KEY = 'haihand_anon_id';
const SESSION_ID_KEY = 'haihand_session_id';
const VIEW_CACHE_PREFIX = 'hh_view_';

// LocalStorage key & limits for recently viewed
const LOCAL_RECENTLY_VIEWED_KEY = 'hh_recently_viewed';
const MAX_LOCAL_RECENTLY_VIEWED = 20;

// 30 minutes view deduplication window
const VIEW_DEDUPE_MS = 30 * 60 * 1000;

/**
 * ============================================================
 * LOCAL RECENTLY VIEWED — localStorage-first, instant display
 * ============================================================
 */

/**
 * Save a compact snapshot of a product to the local recently-viewed list.
 * Called right after the user views a product (no waiting for API).
 * Also fires a DOM event so any mounted component can react immediately.
 */
export function addToLocalRecentlyViewed(post) {
  try {
    if (!post) return;
    const id = post._id || post.id;
    if (!id) return;

    // Build a slim snapshot — just enough to render a ProductCard
    const snapshot = {
      _id: id,
      id,
      title: post.title || post.name || '',
      name: post.name || post.title || '',
      price: post.price || 0,
      images: Array.isArray(post.images) ? post.images.slice(0, 1) : (post.image ? [post.image] : []),
      image: post.image || (Array.isArray(post.images) && post.images[0]) || '',
      category: post.category || '',
      condition: post.condition || '',
      location: post.location || '',
      status: post.status || 'active',
      stockQuantity: post.stockQuantity != null ? post.stockQuantity : 1,
      quantity: post.quantity != null ? post.quantity : 1,
      soldCount: post.soldCount || 0,
      author: post.author || null,
      sellerId: post.sellerId || null,
      createdAt: post.createdAt || new Date().toISOString(),
      recoSource: 'recently_viewed',
      recoReason: 'Sản phẩm bạn vừa xem',
      _viewedAt: Date.now()
    };

    // Load existing list, deduplicate, prepend newest
    const existing = getLocalRecentlyViewed(MAX_LOCAL_RECENTLY_VIEWED + 1);
    const deduped = existing.filter(p => (p._id || p.id) !== id);
    const updated = [snapshot, ...deduped].slice(0, MAX_LOCAL_RECENTLY_VIEWED);
    localStorage.setItem(LOCAL_RECENTLY_VIEWED_KEY, JSON.stringify(updated));

    // Notify all mounted components
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('haihand:recently_viewed_updated', {
        detail: { product: snapshot }
      }));
    }
  } catch (e) {
    // Silent — tracking must never crash the app
  }
}

/**
 * Read the local recently-viewed list (newest first).
 */
export function getLocalRecentlyViewed(limit = 10) {
  try {
    const stored = localStorage.getItem(LOCAL_RECENTLY_VIEWED_KEY);
    if (!stored) return [];
    const list = JSON.parse(stored);
    return Array.isArray(list) ? list.slice(0, limit) : [];
  } catch (e) {
    return [];
  }
}

/**
 * Clear the local recently-viewed list (e.g., on logout)
 */
export function clearLocalRecentlyViewed() {
  try {
    localStorage.removeItem(LOCAL_RECENTLY_VIEWED_KEY);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('haihand:recently_viewed_updated', { detail: { product: null } }));
    }
  } catch (e) {}
}


function generateUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Get or initialize persistent anonymous ID
 */
export function getAnonymousId() {
  try {
    let anonId = localStorage.getItem(ANON_ID_KEY);
    if (!anonId || anonId === 'undefined') {
      anonId = 'anon_' + generateUUID();
      localStorage.setItem(ANON_ID_KEY, anonId);
    }
    return anonId;
  } catch {
    return 'anon_ephemeral_' + Math.random().toString(36).substring(2, 10);
  }
}

/**
 * Get or initialize session-scoped ID (dies when tab/browser closes)
 */
export function getSessionId() {
  try {
    let sessId = sessionStorage.getItem(SESSION_ID_KEY);
    if (!sessId || sessId === 'undefined') {
      sessId = 'sess_' + generateUUID();
      sessionStorage.setItem(SESSION_ID_KEY, sessId);
    }
    return sessId;
  } catch {
    return 'sess_ephemeral';
  }
}

/**
 * Check if user has opted out of tracking
 */
export function isTrackingOptedOut() {
  try {
    return localStorage.getItem(OPTOUT_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Set privacy opt-out status
 */
export function setTrackingOptOut(optOut) {
  try {
    if (optOut) {
      localStorage.setItem(OPTOUT_KEY, 'true');
    } else {
      localStorage.removeItem(OPTOUT_KEY);
    }
    window.dispatchEvent(new CustomEvent('trackingOptOutChanged', { detail: { optOut } }));
  } catch (e) {
    console.warn('Failed to update tracking preference:', e);
  }
}

// In-memory queue for batching events
let eventQueue = [];
let batchTimer = null;

/**
 * Flush queued events to server via sendBeacon or keepalive fetch
 */
export function flushEvents() {
  if (isTrackingOptedOut() || eventQueue.length === 0) {
    eventQueue = [];
    return;
  }

  const batch = eventQueue.splice(0, 20);
  const payload = JSON.stringify({ events: batch });

  try {
    // 1. Prefer navigator.sendBeacon with Blob for non-blocking transport
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([payload], { type: 'application/json' });
      const sent = navigator.sendBeacon(TRACK_ENDPOINT, blob);
      if (sent) return;
    }

    // 2. Fallback to keepalive fetch
    if (typeof fetch === 'function') {
      fetch(TRACK_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true
      }).catch(() => {});
      return;
    }

    // 3. Last fallback: axiosClient
    axiosClient.post('/api/track', { events: batch }).catch(() => {});
  } catch (err) {
    // Silently ignore tracking dispatch failure
  }
}

/**
 * Schedule batch transmission
 */
function scheduleFlush() {
  if (batchTimer) return;
  batchTimer = setTimeout(() => {
    batchTimer = null;
    flushEvents();
  }, 1500);
}

// Flush immediately when tab is being closed or hidden
if (typeof window !== 'undefined') {
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushEvents();
    }
  });
  window.addEventListener('pagehide', () => {
    flushEvents();
  });
}

/**
 * Core event tracking function
 */
export function trackEvent({
  type,
  productId = null,
  category = '',
  price = null,
  query = '',
  source = 'other',
  meta = {}
}) {
  try {
    if (isTrackingOptedOut()) return;

    const anonId = getAnonymousId();
    const sessId = getSessionId();

    const event = {
      anonymousId: anonId,
      sessionId: sessId,
      type,
      productId: productId ? String(productId) : null,
      category: category ? String(category) : '',
      price: typeof price === 'number' && !isNaN(price) ? price : null,
      query: query ? String(query).slice(0, 200) : '',
      source: source || 'other',
      meta: meta && typeof meta === 'object' ? meta : {}
    };

    eventQueue.push(event);

    if (eventQueue.length >= 5) {
      flushEvents();
    } else {
      scheduleFlush();
    }
  } catch (err) {
    // Tracking must never crash user application
  }
}

/**
 * Deduplicated Product View Tracker (1 view per product per 30 minutes)
 * Also saves to localStorage immediately so the "recently viewed" section
 * can show the product without waiting for an API round-trip.
 */
export function trackProductView(product, source = 'detail') {
  if (!product || isTrackingOptedOut()) return;

  try {
    const pId = product.id || product._id;
    if (!pId) return;

    const cacheKey = VIEW_CACHE_PREFIX + pId;
    const lastViewedAt = sessionStorage.getItem(cacheKey);
    const now = Date.now();

    // Always update the local recently-viewed list (newest on top)
    // regardless of deduplication — so the section is always fresh.
    addToLocalRecentlyViewed(product);

    if (lastViewedAt && now - parseInt(lastViewedAt, 10) < VIEW_DEDUPE_MS) {
      // Deduplicated within 30 minutes — skip sending backend event but
      // local list is already updated above.
      return;
    }

    sessionStorage.setItem(cacheKey, String(now));

    trackEvent({
      type: 'product_view',
      productId: pId,
      category: product.category || '',
      price: product.price || null,
      source,
      meta: {
        condition: product.condition || '',
        location: product.location || ''
      }
    });
  } catch (err) {
    // Silent fail
  }
}

/**
 * Real dwell time tracker using visibilitychange
 * - Sends product_dwell event to backend when dwell ≥ 5 seconds (capped at 5 min)
 * - Also updates local recently-viewed after dwell ≥ 5s to signal "real interest"
 *   and fires haihand:product_viewed so HomePage refreshes the section in real-time.
 * Returns a cleanup function to be invoked on component unmount
 */
export function startProductDwellTracker(product, source = 'detail') {
  if (!product || isTrackingOptedOut()) return () => {};

  const pId = product.id || product._id;
  if (!pId) return () => {};

  let visibleStartTime = document.visibilityState === 'visible' ? Date.now() : null;
  let accumulatedDwellMs = 0;
  let hasSent = false;
  // Minimum dwell: 5 seconds to count as "real interest"
  const MIN_DWELL_S = 5;

  const flushDwell = () => {
    if (hasSent) return;

    if (visibleStartTime !== null) {
      accumulatedDwellMs += (Date.now() - visibleStartTime);
      visibleStartTime = null;
    }

    const dwellSeconds = Math.round(accumulatedDwellMs / 1000);

    // Only send dwell if viewed between 5 seconds and 300 seconds (5 mins)
    if (dwellSeconds >= MIN_DWELL_S) {
      hasSent = true;

      // Re-push to top of local recently-viewed to reflect genuine interest
      addToLocalRecentlyViewed(product);

      // Fire DOM event so HomePage section refreshes without navigation
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('haihand:product_viewed', {
          detail: {
            product,
            dwellSeconds: Math.min(300, dwellSeconds),
            source
          }
        }));
      }

      trackEvent({
        type: 'product_dwell',
        productId: pId,
        category: product.category || '',
        price: product.price || null,
        source,
        meta: {
          duration: Math.min(300, dwellSeconds)
        }
      });
      flushEvents();
    }
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      visibleStartTime = Date.now();
    } else {
      if (visibleStartTime !== null) {
        accumulatedDwellMs += (Date.now() - visibleStartTime);
        visibleStartTime = null;
      }
    }
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('beforeunload', flushDwell);

  return () => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('beforeunload', flushDwell);
    flushDwell();
  };
}

/**
 * Track Recommendation Section Impression (IntersectionObserver)
 */
export function trackRecommendationImpression(sectionName, productIds = []) {
  if (isTrackingOptedOut() || !productIds || productIds.length === 0) return;

  trackEvent({
    type: 'recommendation_impression',
    source: sectionName,
    meta: {
      section: sectionName,
      count: productIds.length,
      productIds: productIds.slice(0, 10).map(String)
    }
  });
}

/**
 * Track Click on Recommended Product
 */
export function trackRecommendationClick(product, sectionName) {
  if (!product || isTrackingOptedOut()) return;

  const pId = product.id || product._id;
  trackEvent({
    type: 'recommendation_click',
    productId: pId,
    category: product.category || '',
    price: product.price || null,
    source: sectionName,
    meta: {
      recoSource: product.recoSource || sectionName,
      recoReason: product.recoReason || ''
    }
  });
  flushEvents();
}

/**
 * Track Click on Product inside AI Chat
 */
export function trackChatProductClick(product) {
  if (!product || isTrackingOptedOut()) return;

  const pId = product.id || product._id;
  trackEvent({
    type: 'chat_product_click',
    productId: pId,
    category: product.category || '',
    price: product.price || null,
    source: 'chatbot',
    meta: {
      name: product.name || product.title || ''
    }
  });
  flushEvents();
}

/**
 * Helper to sync anonymous history to user account after login
 */
export async function syncAnonymousIdentity(token) {
  try {
    const anonId = localStorage.getItem(ANON_ID_KEY);
    if (!anonId) return;

    await axiosClient.post('/api/track/merge', { anonymousId: anonId }, {
      headers: { Authorization: `Bearer ${token}` }
    });
  } catch (err) {
    // Silent fail
  }
}

