import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import axiosClient from '../api/axiosClient';
import { ProductCard } from './ProductCard';
import { mapPostToProductCard } from '../utils/productMapper';
import {
  getLocalRecentlyViewed,
  trackRecommendationImpression,
  trackRecommendationClick
} from '../utils/tracker';

const ProductSkeleton = () => (
  <div className="bg-white border border-[#E7E5E4] rounded-lg p-3 animate-pulse">
    <div className="w-full aspect-square bg-stone-200 rounded-md mb-3" />
    <div className="h-4 bg-stone-200 rounded w-3/4 mb-2" />
    <div className="h-4 bg-stone-200 rounded w-1/2" />
  </div>
);

/**
 * Client-side semantic keyword & relation matcher (unbreakable fallback)
 * Ensures that if a user views "thức ăn cho rùa", related items like
 * "thức ăn cho chó mèo" or anything containing "rùa" / "đồ ăn" are sorted to the top.
 */
function findRelatedFromCatalog(baseProduct, pool = [], limit = 10) {
  if (!baseProduct || !Array.isArray(pool) || pool.length === 0) return [];

  const baseId = (baseProduct._id || baseProduct.id || '').toString();
  const baseTitle = (baseProduct.title || baseProduct.name || '').toLowerCase();
  const baseCategory = (baseProduct.category || '').toLowerCase();

  const isFood = baseTitle.includes('thức ăn') || baseTitle.includes('đồ ăn') || baseTitle.includes('hạt') || baseTitle.includes('cám');
  const isTurtle = baseTitle.includes('rùa');

  const rawWords = baseTitle
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !['cho', 'của', 'và', 'các', 'những', 'loại', 'hàng'].includes(w));

  const candidates = pool.filter((p) => {
    const pid = (p._id || p.id || '').toString();
    return pid && pid !== baseId;
  });

  const scored = candidates.map((p) => {
    let score = 0;
    const pTitle = (p.title || p.name || '').toLowerCase();
    const pCat = (p.category || '').toLowerCase();
    let reason = '';

    // 1. TOP PRIORITY: CÙNG DANH MỤC (Tier 1: Luôn ưu tiên sản phẩm cùng danh mục lên đầu)
    const isSameCategory = Boolean(baseCategory && pCat === baseCategory);
    if (isSameCategory) {
      score += 100; // Priority #1: Same category always comes first!
      reason = `Cùng danh mục "${p.category}" bạn quan tâm`;
    }

    // 2. SECOND PRIORITY: KHỚP TITLE / TỪ KHÓA
    if (isFood && (pTitle.includes('thức ăn') || pTitle.includes('đồ ăn') || pTitle.includes('hạt') || pTitle.includes('cám'))) {
      score += 20;
      if (pTitle.includes('chó') || pTitle.includes('mèo') || pTitle.includes('thú cưng')) {
        score += 15; // "thức ăn cho chó mèo" -> top position
        reason = isSameCategory
          ? `Cùng danh mục & đúng loại thức ăn cho thú cưng`
          : 'Thức ăn & đồ dùng thú cưng (chó mèo) cùng nhu cầu';
      } else {
        reason = isSameCategory
          ? `Cùng danh mục & loại thức ăn bạn đang tìm`
          : 'Cùng loại thức ăn & dinh dưỡng bạn vừa xem';
      }
    }

    // Direct match for "rùa"
    if (isTurtle && pTitle.includes('rùa')) {
      score += 25;
      reason = isSameCategory
        ? `Cùng danh mục & liên quan rùa cảnh bạn vừa xem`
        : 'Liên quan trực tiếp đến rùa cảnh bạn vừa xem';
    }

    // Keyword match from title
    for (const w of rawWords) {
      if (pTitle.includes(w)) {
        score += 10;
        reason = isSameCategory
          ? `Cùng danh mục & khớp từ khóa "${w}"`
          : `Khớp từ khóa "${w}" từ đồ bạn vừa xem`;
      }
    }

    return {
      product: {
        ...p,
        recoSource: 'related_to_recent',
        recoReason: reason || `Gợi ý phù hợp cho bạn`
      },
      score
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.product);
}

/**
 * RecommendationSection
 *
 * Props:
 *   title, subtitle, icon          — header text
 *   fetchUrl                       — API endpoint
 *   localFirst                     — if true, read from localStorage immediately
 *   catalogPool                    — optional backup catalog items from page
 *   relatedToProduct               — the base product we are finding relations for
 *   products: initialProducts      — pre-loaded product array
 *   sourceName                     — analytics label
 *   currentUser, favoriteIds       — for ProductCard
 *   onFavorite                     — toggle favourite handler
 *   limit                          — max items to show
 *   className                      — extra wrapper classes
 *   refreshEvent                   — custom DOM event name that triggers a re-fetch
 */
export const RecommendationSection = ({
  title,
  subtitle,
  icon,
  fetchUrl,
  localFirst = false,
  catalogPool = [],
  relatedToProduct = null,
  products: initialProducts = null,
  sourceName = 'recommendation',
  currentUser = null,
  favoriteIds = [],
  onFavorite = () => {},
  limit = 10,
  className = '',
  refreshEvent = null
}) => {
  // Start with local recently-viewed data if localFirst mode is enabled,
  // or fallback to client-side catalog matching if relatedToProduct is given
  const getInitialItems = () => {
    if (initialProducts) return initialProducts;
    if (localFirst) return getLocalRecentlyViewed(limit);
    if (relatedToProduct && Array.isArray(catalogPool) && catalogPool.length > 0) {
      return findRelatedFromCatalog(relatedToProduct, catalogPool, limit);
    }
    return [];
  };

  const [items, setItems] = useState(getInitialItems);
  const [isLoading, setIsLoading] = useState(
    !initialProducts && !localFirst && items.length === 0 && Boolean(fetchUrl)
  );
  const sectionRef = useRef(null);
  const impressionSentRef = useRef(false);
  const fetchedRef = useRef(false);

  // ── Merge local + API results, deduplicated, local items first ──
  const mergeWithLocal = useCallback((apiItems) => {
    if (!localFirst) return apiItems;
    const localItems = getLocalRecentlyViewed(limit);
    if (localItems.length === 0) return apiItems;

    const localIds = new Set(localItems.map(p => (p._id || p.id)?.toString()));
    const apiOnly = (apiItems || []).filter(p => !localIds.has((p._id || p.id)?.toString()));
    return [...localItems, ...apiOnly].slice(0, limit);
  }, [localFirst, limit]);

  // ── Fetch from API (background refresh) ──
  const fetchFromApi = useCallback(() => {
    if (!fetchUrl) return;

    const isBackgroundFetch = (localFirst && items.length > 0) || items.length > 0;
    if (!isBackgroundFetch) setIsLoading(true);

    let isMounted = true;

    axiosClient
      .get(fetchUrl, { params: { limit } })
      .then((res) => {
        if (!isMounted) return;
        let data = Array.isArray(res.data) ? res.data : [];

        // If API returned empty, use client-side catalog matching fallback
        if (data.length === 0 && relatedToProduct && Array.isArray(catalogPool) && catalogPool.length > 0) {
          data = findRelatedFromCatalog(relatedToProduct, catalogPool, limit);
        }

        if (data.length > 0 || !items.length) {
          setItems(localFirst ? mergeWithLocal(data) : data);
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        console.warn(`[RecommendationSection] Fetch failed for ${sourceName}:`, err.message);
        // Fallback to client-side catalog matching on network error
        if (relatedToProduct && Array.isArray(catalogPool) && catalogPool.length > 0 && items.length === 0) {
          const fallbackData = findRelatedFromCatalog(relatedToProduct, catalogPool, limit);
          if (fallbackData.length > 0) setItems(fallbackData);
        }
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
        fetchedRef.current = true;
      });

    return () => { isMounted = false; };
  }, [fetchUrl, localFirst, limit, sourceName, mergeWithLocal, relatedToProduct, catalogPool, items.length]);

  // ── Initial fetch ──
  useEffect(() => {
    if (initialProducts) {
      setItems(initialProducts);
      setIsLoading(false);
      return;
    }
    return fetchFromApi();
  }, [fetchUrl]); // eslint-disable-line

  // ── Catalog pool update fallback ──
  useEffect(() => {
    if (items.length === 0 && relatedToProduct && Array.isArray(catalogPool) && catalogPool.length > 0) {
      const fallbackData = findRelatedFromCatalog(relatedToProduct, catalogPool, limit);
      if (fallbackData.length > 0) {
        setItems(fallbackData);
        setIsLoading(false);
      }
    }
  }, [catalogPool, relatedToProduct, limit, items.length]);

  // ── Listen for real-time "product viewed" event ──
  useEffect(() => {
    const handleViewedEvent = (e) => {
      if (localFirst) {
        // Immediately update from localStorage (the tracker already updated it)
        setItems(getLocalRecentlyViewed(limit));
        impressionSentRef.current = false; // allow re-tracking impression
      } else {
        // For non-local sections, re-fetch from API
        fetchFromApi();
      }
    };

    // Always listen to haihand:recently_viewed_updated (from trackProductView)
    if (localFirst) {
      window.addEventListener('haihand:recently_viewed_updated', handleViewedEvent);
    }
    // Listen to custom refresh event if provided
    if (refreshEvent) {
      window.addEventListener(refreshEvent, handleViewedEvent);
    }
    // "for-you" and other sections refresh when a dwell event fires
    const handleDwellEvent = () => {
      if (!localFirst && fetchUrl) {
        fetchFromApi();
      }
    };
    if (!localFirst) {
      window.addEventListener('haihand:product_viewed', handleDwellEvent);
    }

    return () => {
      window.removeEventListener('haihand:recently_viewed_updated', handleViewedEvent);
      if (refreshEvent) window.removeEventListener(refreshEvent, handleViewedEvent);
      window.removeEventListener('haihand:product_viewed', handleDwellEvent);
    };
  }, [localFirst, limit, refreshEvent, fetchFromApi]);

  // ── Track impression when section enters viewport ──
  useEffect(() => {
    if (isLoading || items.length === 0 || impressionSentRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry && entry.isIntersecting && !impressionSentRef.current) {
          impressionSentRef.current = true;
          trackRecommendationImpression(
            sourceName,
            items.map((it) => it._id || it.id)
          );
        }
      },
      { threshold: 0.25 }
    );

    const currentElem = sectionRef.current;
    if (currentElem) observer.observe(currentElem);

    return () => {
      if (currentElem) observer.unobserve(currentElem);
    };
  }, [isLoading, items, sourceName]);

  // Hide section cleanly when no items and not loading
  if (!isLoading && items.length === 0) {
    return null;
  }

  return (
    <section ref={sectionRef} className={`my-8 ${className}`}>
      {/* Section Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          {icon && (
            <div className="w-8 h-8 rounded-lg bg-orange-100 text-[#EA580C] flex items-center justify-center font-bold text-base shrink-0 shadow-xs">
              {icon}
            </div>
          )}
          <div>
            <h2 className="text-xl md:text-2xl font-black text-[#1C1917] tracking-tight flex items-center gap-2">
              {title}
              {/* Animated "mới" badge when local items are present */}
              {localFirst && items.length > 0 && (
                <span className="text-[11px] font-bold bg-emerald-500 text-white px-2 py-0.5 rounded-full animate-pulse">
                  Vừa cập nhật
                </span>
              )}
            </h2>
            {subtitle && (
              <p className="text-xs md:text-sm text-stone-500 mt-0.5">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {/* Count badge */}
        {!isLoading && items.length > 0 && (
          <span className="text-xs text-stone-400 font-medium hidden sm:block">
            {items.length} sản phẩm
          </span>
        )}
      </div>

      {/* Grid of Product Cards */}
      {isLoading && items.length === 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {Array.from({ length: Math.min(5, limit) }).map((_, idx) => (
            <ProductSkeleton key={idx} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {items.map((post) => {
            const mapped = mapPostToProductCard(post, currentUser, favoriteIds);
            if (!mapped) return null;
            const pid = post._id || post.id;

            return (
              <div
                key={pid}
                onClick={() => trackRecommendationClick(post, sourceName)}
                className="transition-transform duration-200 hover:-translate-y-1 relative"
              >
                {post.recoReason && (
                  <div className="mb-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-[#EA580C] bg-orange-50 px-2 py-0.5 rounded-full border border-orange-200/60 truncate max-w-full">
                    <span>✨</span>
                    <span className="truncate">{post.recoReason}</span>
                  </div>
                )}
                <Link to={`/post/${pid}`} className="block">
                  <ProductCard
                    product={mapped.product}
                    isFavorited={mapped.isFavorited}
                    isAuthor={mapped.isAuthor}
                    onFavorite={(e) => onFavorite(e, pid)}
                  />
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
