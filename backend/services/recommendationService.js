const mongoose = require('mongoose');
const User = require('../models/User');
const { Product, Post } = require('../models/Product');
const UserEvent = require('../models/UserEvent');
const UserInterestProfile = require('../models/UserInterestProfile');
const ProductCoView = require('../models/ProductCoView');
const { CATALOG_VISIBLE } = require('../utils/b2c');
const { RECOMMENDATION } = require('../config/behaviorConfig');

// In-memory short-term recommendation cache (key: 'userKey:type', value: { data, expiry })
const recoCache = new Map();

function getCachedReco(key) {
  const item = recoCache.get(key);
  if (item && item.expiry > Date.now()) {
    return item.data;
  }
  return null;
}

function setCachedReco(key, data, ttlMs = RECOMMENDATION.CACHE_TTL_MS) {
  recoCache.set(key, { data, expiry: Date.now() + ttlMs });
  // Evict old entries if cache grows large
  if (recoCache.size > 1000) {
    const now = Date.now();
    for (const [k, v] of recoCache.entries()) {
      if (v.expiry <= now) recoCache.delete(k);
    }
  }
}

function invalidateUserRecoCache({ userId = null, anonymousId = null }) {
  if (userId) {
    recoCache.delete(`recent:u:${userId}`);
    recoCache.delete(`foryou:u:${userId}`);
    recoCache.delete(`related:u:${userId}`);
  }
  if (anonymousId) {
    recoCache.delete(`recent:a:${anonymousId}`);
    recoCache.delete(`foryou:a:${anonymousId}`);
    recoCache.delete(`related:a:${anonymousId}`);
  }
}

/**
 * Cosine similarity between two float arrays
 */
function cosineSimilarity(vecA, vecB) {
  if (!Array.isArray(vecA) || !Array.isArray(vecB) || vecA.length === 0 || vecA.length !== vecB.length) {
    return 0;
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Filter and enforce catalog visibility, stock and seller diversity
 * Robust fallback: Never returns 0 items if candidates exist (e.g. dev/test catalogs where
 * one user created all posts).
 */
function applyCatalogFilters(products, { excludeIds = [], currentUserId = null, maxPerSeller = 2 }) {
  if (!Array.isArray(products) || products.length === 0) return [];

  const cleanExclude = new Set(excludeIds.map((id) => id.toString()));

  const runFilter = ({ allowSelf = false, relaxSellerLimit = false } = {}) => {
    const sellerCounts = new Map();
    const result = [];

    for (const p of products) {
      if (!p) continue;
      const pIdStr = p._id ? p._id.toString() : '';
      if (cleanExclude.has(pIdStr)) continue;

      // Must be in catalog visible statuses
      const isVisible = CATALOG_VISIBLE.includes(p.status);
      const stock = p.stockQuantity != null ? p.stockQuantity : (p.quantity != null ? p.quantity : 1);
      const inStock = stock > 0;
      if (!isVisible || !inStock) continue;

      // Check seller ownership
      const ownerId = (p.sellerId || p.author || (p.author && p.author._id) || (p.sellerId && p.sellerId._id) || '').toString();

      // Only exclude own products when allowSelf is false
      if (!allowSelf && currentUserId && ownerId && ownerId === currentUserId.toString()) {
        continue;
      }

      // Enforce diversity: maximum N products per seller (only if relaxSellerLimit is false and ownerId is valid)
      if (!relaxSellerLimit && ownerId) {
        const count = sellerCounts.get(ownerId) || 0;
        if (count >= maxPerSeller) {
          continue;
        }
        sellerCounts.set(ownerId, count + 1);
      }

      result.push(p);
    }

    return result;
  };

  // Pass 1: Strict mode (exclude own products, enforce maxPerSeller)
  let filtered = runFilter({ allowSelf: false, relaxSellerLimit: false });

  // Pass 2: If too few/no products found (e.g. dev/test account where logged-in user owns the posts)
  if (filtered.length === 0) {
    filtered = runFilter({ allowSelf: true, relaxSellerLimit: false });
  }

  // Pass 3: If still empty, relax seller diversity count
  if (filtered.length === 0) {
    filtered = runFilter({ allowSelf: true, relaxSellerLimit: true });
  }

  return filtered;
}

/**
 * 1. GET /api/recommendations/recently-viewed
 * Returns recently viewed items for authenticated user or anonymous visitor
 */
async function getRecentlyViewed({ userId = null, anonymousId = null, limit = 12 }) {
  try {
    if (mongoose.connection.readyState === 0) return [];

    const userKey = userId ? `u:${userId}` : (anonymousId ? `a:${anonymousId}` : null);
    if (!userKey) return [];

    const cached = getCachedReco(`recent:${userKey}`);
    if (cached) return cached;

    const query = {
      type: { $in: ['product_view', 'product_dwell'] },
      productId: { $ne: null }
    };
    if (userId) {
      query.$or = [
        { userId: new mongoose.Types.ObjectId(userId) },
        ...(anonymousId ? [{ anonymousId }] : [])
      ];
    } else {
      query.anonymousId = anonymousId;
    }

    // Retrieve recent view events
    const recentEvents = await UserEvent.find(query)
      .sort({ createdAt: -1 })
      .limit(60)
      .select('productId createdAt')
      .lean();

    if (!recentEvents || recentEvents.length === 0) {
      return [];
    }

    // Maintain unique product IDs in order of most recently viewed
    const orderedIds = [];
    const seen = new Set();
    for (const ev of recentEvents) {
      if (!ev.productId) continue;
      const pidStr = ev.productId.toString();
      if (!seen.has(pidStr)) {
        seen.add(pidStr);
        orderedIds.push(new mongoose.Types.ObjectId(pidStr));
      }
    }

    if (orderedIds.length === 0) return [];

    // Fetch products (allow null stockQuantity for legacy products)
    const dbProducts = await Post.find({
      _id: { $in: orderedIds },
      status: { $in: CATALOG_VISIBLE },
      $or: [{ stockQuantity: { $gt: 0 } }, { stockQuantity: null }, { stockQuantity: { $exists: false } }]
    })
      .populate('author sellerId', 'name email avatar shopInfo isSeller sellerStatus')
      .lean();

    // Map back to original order
    const prodMap = new Map(dbProducts.map((p) => [p._id.toString(), p]));
    const result = [];
    for (const id of orderedIds) {
      const p = prodMap.get(id.toString());
      if (p) {
        // Exclude own products if logged in
        const owner = (p.sellerId || p.author || (p.author?._id) || '').toString();
        if (userId && owner === userId.toString()) continue;

        result.push({
          ...p,
          recoSource: 'recently_viewed',
          recoReason: 'Sản phẩm bạn vừa xem'
        });
        if (result.length >= limit) break;
      }
    }

    setCachedReco(`recent:${userKey}`, result, 15 * 1000);
    return result;
  } catch (error) {
    console.warn('[RecoService] getRecentlyViewed error:', error.message);
    return [];
  }
}

/**
 * Cold-start fallback recommendation (Trending 7-day + newest)
 */
async function getColdStartRecommendations({ currentUserId = null, limit = 15 }) {
  try {
    if (mongoose.connection.readyState === 0) return [];
    // 1. Fetch top viewed in past 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const topViews = await UserEvent.aggregate([
      {
        $match: {
          type: 'product_view',
          createdAt: { $gte: sevenDaysAgo },
          productId: { $ne: null }
        }
      },
      { $group: { _id: '$productId', viewCount: { $sum: 1 } } },
      { $sort: { viewCount: -1 } },
      { $limit: limit * 2 }
    ]);

    const trendingIds = topViews.map((v) => v._id);

    let candidates = [];
    if (trendingIds.length > 0) {
      candidates = await Post.find({
        _id: { $in: trendingIds },
        status: { $in: CATALOG_VISIBLE },
        $or: [{ stockQuantity: { $gt: 0 } }, { stockQuantity: null }, { stockQuantity: { $exists: false } }]
      })
        .populate('author sellerId', 'name email avatar shopInfo isSeller sellerStatus')
        .lean();
    }

    // If still need more, fill with top soldCount and newest posts
    if (candidates.length < limit) {
      const more = await Post.find({
        _id: { $nin: candidates.map((c) => c._id) },
        status: { $in: CATALOG_VISIBLE },
        $or: [{ stockQuantity: { $gt: 0 } }, { stockQuantity: null }, { stockQuantity: { $exists: false } }]
      })
        .sort({ soldCount: -1, createdAt: -1 })
        .limit(limit * 2)
        .populate('author sellerId', 'name email avatar shopInfo isSeller sellerStatus')
        .lean();
      candidates = [...candidates, ...more];
    }

    const filtered = applyCatalogFilters(candidates, {
      currentUserId,
      maxPerSeller: RECOMMENDATION.MAX_PER_SELLER
    }).slice(0, limit);

    return filtered.map((p) => ({
      ...p,
      recoSource: 'for_you',
      recoReason: 'Sản phẩm đang thịnh hành trên sàn'
    }));
  } catch (err) {
    console.warn('[RecoService] getColdStartRecommendations error:', err.message);
    return [];
  }
}

/**
 * 2. GET /api/recommendations/for-you
 * Hybrid Recommendation Engine
 * Score = 0.40 * contentSim + 0.25 * categoryAffinity + 0.15 * priceFit + 0.10 * coView + 0.10 * popularity
 */
async function getForYou({ userId = null, anonymousId = null, limit = 15 }) {
  try {
    if (mongoose.connection.readyState === 0) return [];

    const userKey = userId ? `u:${userId}` : (anonymousId ? `a:${anonymousId}` : null);
    if (!userKey) {
      return getColdStartRecommendations({ currentUserId: userId, limit });
    }

    const cached = getCachedReco(`foryou:${userKey}`);
    if (cached) return cached;

    // Load UserInterestProfile
    const profileQuery = userId
      ? { $or: [{ userId: new mongoose.Types.ObjectId(userId) }, ...(anonymousId ? [{ anonymousId }] : [])] }
      : { anonymousId };

    const profile = await UserInterestProfile.findOne(profileQuery).lean();

    if (!profile || (!profile.categories && !profile.recentProductIds?.length)) {
      // Cold-start fallback
      return getColdStartRecommendations({ currentUserId: userId, limit });
    }

    // Exclude purchased and already viewed products
    const excludedIds = [
      ...(profile.purchasedProductIds || []),
      ...(profile.recentProductIds || []).slice(-5) // exclude 5 most recent views
    ];

    // Extract preferred categories & top score
    const catMap = profile.categories instanceof Map
      ? profile.categories
      : new Map(Object.entries(profile.categories || {}));

    const topCategories = Array.from(catMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([cat]) => cat)
      .slice(0, 4);

    let maxCatScore = 1;
    for (const score of catMap.values()) {
      if (score > maxCatScore) maxCatScore = score;
    }

    // Price preference stats
    const { median = 0, minPreferred = 0, maxPreferred = 0 } = profile.priceRange || {};

    // Get candidate products: top categories + general visible
    // Allow null/0 stockQuantity for legacy products (use $not: out_of_stock status instead)
    const candidateQuery = {
      _id: { $nin: excludedIds },
      status: { $in: CATALOG_VISIBLE }
    };

    if (topCategories.length > 0) {
      candidateQuery.$or = [
        { category: { $in: topCategories } },
        { soldCount: { $gte: 1 } }
      ];
    }

    // Find candidate products with embeddings for content similarity
    const candidateProducts = await Post.find(candidateQuery)
      .select('+textEmbedding')
      .populate('author sellerId', 'name email avatar shopInfo isSeller sellerStatus')
      .limit(60)
      .lean();

    if (!candidateProducts || candidateProducts.length === 0) {
      return getColdStartRecommendations({ currentUserId: userId, limit });
    }

    // Extract target embedding from the user's most recent interaction
    let targetEmbedding = null;
    if (profile.recentProductIds && profile.recentProductIds.length > 0) {
      const lastViewed = await Post.findById(profile.recentProductIds[profile.recentProductIds.length - 1])
        .select('+textEmbedding')
        .lean();
      if (lastViewed && Array.isArray(lastViewed.textEmbedding) && lastViewed.textEmbedding.length > 0) {
        targetEmbedding = lastViewed.textEmbedding;
      }
    }

    // Co-view score map for recent products
    const coViewScores = new Map();
    if (profile.recentProductIds && profile.recentProductIds.length > 0) {
      const recentSlice = profile.recentProductIds.slice(-3);
      const coViewRows = await ProductCoView.find({
        productId: { $in: recentSlice }
      }).lean();

      for (const row of coViewRows) {
        const idStr = row.coViewedProductId.toString();
        const cur = coViewScores.get(idStr) || 0;
        coViewScores.set(idStr, cur + (row.count || 1));
      }
    }

    const now = Date.now();
    const scoredList = [];

    for (const prod of candidateProducts) {
      // 1. Content similarity (cosine textEmbedding)
      let contentSim = 0;
      if (targetEmbedding && Array.isArray(prod.textEmbedding)) {
        contentSim = Math.max(0, cosineSimilarity(targetEmbedding, prod.textEmbedding));
      }

      // 2. Category Affinity (normalized 0-1)
      const rawCatScore = catMap.get(prod.category) || 0;
      const categoryAffinity = Math.min(1.0, rawCatScore / maxCatScore);

      // 3. Price Fit (Gaussian-style distance from median)
      let priceFit = 0.5;
      if (median > 0 && typeof prod.price === 'number') {
        if (minPreferred > 0 && maxPreferred > 0 && prod.price >= minPreferred && prod.price <= maxPreferred) {
          priceFit = 1.0;
        } else {
          const diffRatio = Math.abs(prod.price - median) / (median || 1);
          priceFit = Math.max(0.1, 1 - Math.min(1, diffRatio));
        }
      }

      // 4. Co-View Score (normalized)
      const coViewCount = coViewScores.get(prod._id.toString()) || 0;
      const coViewScore = Math.min(1.0, coViewCount / 10);

      // 5. Popularity (soldCount and age)
      const popularity = Math.min(1.0, (prod.soldCount || 0) / 20);

      // Total Hybrid Score - Ưu tiên hàng đầu cho danh mục (categoryAffinity)
      let finalScore =
        0.45 * categoryAffinity +
        0.30 * contentSim +
        0.10 * priceFit +
        0.08 * coViewScore +
        0.07 * popularity;

      // Age penalty: decrease score for older posts (> 30 days)
      const postAgeDays = Math.max(0, (now - new Date(prod.createdAt).getTime()) / (24 * 3600 * 1000));
      if (postAgeDays > 30) {
        finalScore *= Math.max(0.7, 1 - (postAgeDays - 30) / 100);
      }

      // Remove textEmbedding before passing to client for security & payload size
      delete prod.textEmbedding;

      // Friendly Vietnamese recommendation reason
      let recoReason = 'Gợi ý phù hợp với sở thích của bạn';
      if (categoryAffinity > 0.5) {
        recoReason = `Dành riêng cho bạn từ danh mục ${prod.category}`;
      } else if (contentSim > 0.6) {
        recoReason = 'Tương tự với các sản phẩm bạn đã xem gần đây';
      }

      scoredList.push({
        product: prod,
        score: finalScore,
        recoReason
      });
    }

    // Sort descending by score
    scoredList.sort((a, b) => b.score - a.score);

    // Apply catalog filters & diversity
    const cleanProducts = applyCatalogFilters(
      scoredList.map((item) => ({
        ...item.product,
        recoSource: 'for_you',
        recoReason: item.recoReason
      })),
      {
        currentUserId: userId,
        excludeIds,
        maxPerSeller: RECOMMENDATION.MAX_PER_SELLER
      }
    ).slice(0, limit);

    // If result is empty or too small, top up with cold start
    let finalResult = cleanProducts;
    if (finalResult.length < limit) {
      const existingIds = new Set(finalResult.map((p) => p._id.toString()));
      const coldStartItems = await getColdStartRecommendations({ currentUserId: userId, limit: limit - finalResult.length });
      for (const item of coldStartItems) {
        if (!existingIds.has(item._id.toString())) {
          finalResult.push(item);
          existingIds.add(item._id.toString());
        }
      }
    }

    setCachedReco(`foryou:${userKey}`, finalResult);
    return finalResult;
  } catch (error) {
    console.error('[RecoService] getForYou error:', error);
    return getColdStartRecommendations({ currentUserId: userId, limit });
  }
}

/**
 * 3. GET /api/recommendations/similar/:productId
 * Similar products based on vector embedding or category & price bounds fallback
 */
async function getSimilarProducts({ productId, userId = null, limit = 8 }) {
  try {
    if (mongoose.connection.readyState === 0) return [];
    if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
      return [];
    }

    const cached = getCachedReco(`similar:${productId}`);
    if (cached) return cached;

    const baseProduct = await Post.findById(productId).select('+textEmbedding').lean();
    if (!baseProduct) return [];

    let candidates = [];
    const baseVector = baseProduct.textEmbedding;

    // Try vector search if embedding exists
    if (Array.isArray(baseVector) && baseVector.length > 0) {
      try {
        const VECTOR_INDEX = process.env.VECTOR_INDEX_NAME || 'product_vector_index';
        const vectorResults = await Post.aggregate([
          {
            $vectorSearch: {
              index: VECTOR_INDEX,
              path: 'textEmbedding',
              queryVector: baseVector,
              numCandidates: 40,
              limit: 20
            }
          },
          {
            $match: {
              _id: { $ne: new mongoose.Types.ObjectId(productId) },
              status: { $in: CATALOG_VISIBLE },
              $or: [{ stockQuantity: { $gt: 0 } }, { stockQuantity: null }, { stockQuantity: { $exists: false } }]
            }
          },
          {
            $project: {
              name: 1, title: 1, price: 1, category: 1, location: 1,
              images: 1, description: 1, condition: 1, status: 1,
              stockQuantity: 1, soldCount: 1, author: 1, sellerId: 1, createdAt: 1
            }
          }
        ]);
        candidates = vectorResults;
      } catch (vectorErr) {
        // Fallback gracefully if Atlas vector search index is not available
      }
    }

    // Fallback: match by same category + price range ±30%
    if (!candidates || candidates.length < limit) {
      const minPrice = Math.round(baseProduct.price * 0.7);
      const maxPrice = Math.round(baseProduct.price * 1.3);

      const fallbackProds = await Post.find({
        _id: {
          $ne: new mongoose.Types.ObjectId(productId),
          $nin: candidates.map((c) => c._id)
        },
        category: baseProduct.category,
        price: { $gte: minPrice, $lte: maxPrice },
        status: { $in: CATALOG_VISIBLE },
        $or: [{ stockQuantity: { $gt: 0 } }, { stockQuantity: null }, { stockQuantity: { $exists: false } }]
      })
        .limit(limit * 2)
        .populate('author sellerId', 'name email avatar shopInfo isSeller sellerStatus')
        .lean();

      candidates = [...candidates, ...fallbackProds];
    }

    // If still less than limit, broaden to same category without price constraint
    if (candidates.length < limit) {
      const categoryProds = await Post.find({
        _id: {
          $ne: new mongoose.Types.ObjectId(productId),
          $nin: candidates.map((c) => c._id)
        },
        category: baseProduct.category,
        status: { $in: CATALOG_VISIBLE },
        $or: [{ stockQuantity: { $gt: 0 } }, { stockQuantity: null }, { stockQuantity: { $exists: false } }]
      })
        .limit(limit * 2)
        .populate('author sellerId', 'name email avatar shopInfo isSeller sellerStatus')
        .lean();

      candidates = [...candidates, ...categoryProds];
    }

    const filtered = applyCatalogFilters(candidates, {
      currentUserId: userId,
      excludeIds: [productId],
      maxPerSeller: RECOMMENDATION.MAX_PER_SELLER
    }).slice(0, limit);

    const result = filtered.map((p) => ({
      ...p,
      recoSource: 'similar',
      recoReason: `Tương tự "${baseProduct.title || baseProduct.name || 'sản phẩm này'}"`
    }));

    setCachedReco(`similar:${productId}`, result);
    return result;
  } catch (error) {
    console.warn('[RecoService] getSimilarProducts error:', error.message);
    return [];
  }
}

/**
 * 4. GET /api/recommendations/also-viewed/:productId
 * Products frequently co-viewed with this product
 */
async function getAlsoViewed({ productId, userId = null, limit = 8 }) {
  try {
    if (mongoose.connection.readyState === 0) return [];
    if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
      return [];
    }

    const cached = getCachedReco(`alsoviewed:${productId}`);
    if (cached) return cached;

    const baseProduct = await Post.findById(productId).select('title name category price').lean();
    if (!baseProduct) return [];

    // Query co-view matrix
    const coViewRows = await ProductCoView.find({
      productId: new mongoose.Types.ObjectId(productId)
    })
      .sort({ count: -1 })
      .limit(limit * 2)
      .lean();

    let candidateIds = coViewRows.map((r) => r.coViewedProductId);
    let candidates = [];

    if (candidateIds.length > 0) {
      candidates = await Post.find({
        _id: { $in: candidateIds },
        status: { $in: CATALOG_VISIBLE },
        $or: [{ stockQuantity: { $gt: 0 } }, { stockQuantity: null }, { stockQuantity: { $exists: false } }]
      })
        .populate('author sellerId', 'name email avatar shopInfo isSeller sellerStatus')
        .lean();
    }

    // If co-views are insufficient, supplement with top products in the same category
    if (candidates.length < limit) {
      const supplement = await Post.find({
        _id: {
          $ne: new mongoose.Types.ObjectId(productId),
          $nin: candidates.map((c) => c._id)
        },
        category: baseProduct.category,
        status: { $in: CATALOG_VISIBLE },
        $or: [{ stockQuantity: { $gt: 0 } }, { stockQuantity: null }, { stockQuantity: { $exists: false } }]
      })
        .sort({ soldCount: -1, createdAt: -1 })
        .limit(limit * 2)
        .populate('author sellerId', 'name email avatar shopInfo isSeller sellerStatus')
        .lean();

      candidates = [...candidates, ...supplement];
    }

    const filtered = applyCatalogFilters(candidates, {
      currentUserId: userId,
      excludeIds: [productId],
      maxPerSeller: RECOMMENDATION.MAX_PER_SELLER
    }).slice(0, limit);

    const result = filtered.map((p) => ({
      ...p,
      recoSource: 'also_viewed',
      recoReason: 'Khách hàng xem sản phẩm này cũng xem'
    }));

    setCachedReco(`alsoviewed:${productId}`, result);
    return result;
  } catch (error) {
    console.warn('[RecoService] getAlsoViewed error:', error.message);
    return [];
  }
}

// Vietnamese Stopwords for title keyword extraction
const VI_STOPWORDS = new Set([
  'cho', 'của', 'và', 'các', 'những', 'ở', 'tại', 'với', 'trong', 'được',
  'là', 'có', 'một', 'này', 'đó', 'loại', 'hàng', 'giá', 'rẻ', 'mới',
  'chính', 'hãng', 'thanh', 'lý', 'cần', 'bán', 'pass', 'mua', 'full', 'box'
]);

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractMeaningfulKeywords(text = '') {
  if (!text || typeof text !== 'string') return [];
  const clean = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim();
  const words = clean.split(/\s+/).filter((w) => w.length >= 2 && !VI_STOPWORDS.has(w));

  const result = new Set();

  // 1. Phrasal keywords (bi-grams) e.g. "thức ăn", "chó mèo", "đồ ăn"
  for (let i = 0; i < words.length - 1; i++) {
    const bi = `${words[i]} ${words[i + 1]}`;
    if (!VI_STOPWORDS.has(words[i]) && !VI_STOPWORDS.has(words[i + 1])) {
      result.add(bi);
    }
  }

  // 2. Meaningful single words: e.g. "rùa", "thức", "ăn", "mèo", "chó", "cám", "hạt"
  for (const w of words) {
    if (w.length >= 2) {
      result.add(w);
    }
  }

  return Array.from(result);
}

// Domain knowledge expansion for marketplace items (especially pets, food, tech, fashion)
const SEMANTIC_RELATIONS = [
  {
    triggers: ['thức ăn', 'đồ ăn', 'hạt', 'pate', 'cám', 'dinh dưỡng', 'bánh thưởng'],
    expandsTo: ['thức ăn', 'đồ ăn', 'chó mèo', 'chó', 'mèo', 'thú cưng', 'hạt', 'pate', 'cám', 'dinh dưỡng', 'cá cảnh', 'rùa']
  },
  {
    triggers: ['rùa', 'bò sát'],
    expandsTo: ['rùa', 'thức ăn', 'hồ rùa', 'bể cá', 'bò sát', 'thú cưng', 'bể kính', 'đèn uv', 'sưởi']
  },
  {
    triggers: ['chó', 'mèo', 'cún', 'thú cưng'],
    expandsTo: ['chó', 'mèo', 'thức ăn', 'pate', 'hạt', 'chuồng', 'vệ sinh', 'cát vệ sinh', 'thú cưng']
  },
  {
    triggers: ['điện thoại', 'iphone', 'samsung', 'xiaomi', 'oppo'],
    expandsTo: ['điện thoại', 'ốp lưng', 'cường lực', 'sạc', 'tai nghe', 'phụ kiện']
  },
  {
    triggers: ['laptop', 'macbook', 'máy tính', 'pc'],
    expandsTo: ['laptop', 'chuột', 'bàn phím', 'lót chuột', 'balo', 'tai nghe', 'máy tính']
  },
  {
    triggers: ['quần', 'áo', 'váy', 'đầm'],
    expandsTo: ['quần', 'áo', 'giày', 'túi xách', 'thời trang', 'phụ kiện']
  }
];

function getSemanticExpansions(keywords = []) {
  const expanded = new Set();
  const kwLower = keywords.map((k) => k.toLowerCase());

  for (const rel of SEMANTIC_RELATIONS) {
    const isTriggered = rel.triggers.some((trig) => kwLower.some((k) => k.includes(trig) || trig.includes(k)));
    if (isTriggered) {
      for (const item of rel.expandsTo) {
        expanded.add(item);
      }
    }
  }

  return Array.from(expanded);
}

/**
 * 5. GET /api/recommendations/related-to-recent
 * Suggest products closely related to recent items the user viewed (keyword matching, category, co-views, similar price/embeddings)
 */
async function getRelatedToRecent({
  userId = null,
  anonymousId = null,
  baseProductIds = [],
  fallbackTitle = '',
  fallbackCategory = '',
  sameCategoryOnly = false,
  limit = 10
}) {
  try {
    if (mongoose.connection.readyState === 0) return [];

    let targetIds = Array.isArray(baseProductIds)
      ? baseProductIds.filter((id) => id && mongoose.Types.ObjectId.isValid(id)).map((id) => new mongoose.Types.ObjectId(id))
      : [];

    // If client didn't supply baseProductIds, look up latest viewed items from DB
    if (targetIds.length === 0) {
      const query = {
        type: { $in: ['product_view', 'product_dwell'] },
        productId: { $ne: null }
      };
      if (userId) {
        query.$or = [
          { userId: new mongoose.Types.ObjectId(userId) },
          ...(anonymousId ? [{ anonymousId }] : [])
        ];
      } else if (anonymousId) {
        query.anonymousId = anonymousId;
      }

      if (userId || anonymousId) {
        const recentViews = await UserEvent.find(query)
          .sort({ createdAt: -1 })
          .limit(10)
          .select('productId')
          .lean();

        const seen = new Set();
        for (const rv of recentViews) {
          if (!rv.productId) continue;
          const s = rv.productId.toString();
          if (!seen.has(s)) {
            seen.add(s);
            targetIds.push(new mongoose.Types.ObjectId(s));
            if (targetIds.length >= 3) break;
          }
        }
      }
    }

    // Load details of the base products
    let baseProds = [];
    if (targetIds.length > 0) {
      baseProds = await Post.find({ _id: { $in: targetIds } })
        .select('+textEmbedding')
        .lean();
    }

    // If no products found in DB by ID, but client sent fallbackTitle / fallbackCategory
    if (baseProds.length === 0 && (fallbackTitle || fallbackCategory)) {
      baseProds = [{
        title: fallbackTitle,
        name: fallbackTitle,
        category: fallbackCategory,
        _id: targetIds[0] || new mongoose.Types.ObjectId()
      }];
    }

    if (baseProds.length === 0) {
      return sameCategoryOnly ? [] : getColdStartRecommendations({ currentUserId: userId, limit });
    }

    const latestBase = baseProds[0];
    const latestTitle = latestBase.title || latestBase.name || fallbackTitle || '';
    const baseCategories = Array.from(new Set(baseProds.map((p) => p.category || fallbackCategory).filter(Boolean)));
    if (sameCategoryOnly && baseCategories.length === 0) return [];
    const prices = baseProds.map((p) => p.price).filter((pr) => typeof pr === 'number' && pr > 0);
    const avgPrice = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
    const excludeIds = targetIds.map((id) => id.toString());

    // 1. EXTRACT KEYWORDS & SEMANTIC EXPANSIONS
    // E.g. "Thức ăn cho rùa" -> "thức ăn", "rùa", "đồ ăn", "chó mèo", "thú cưng"...
    const rawKeywords = extractMeaningfulKeywords(latestTitle + ' ' + baseCategories.join(' '));
    const semanticExpansions = getSemanticExpansions(rawKeywords);
    const allSearchKeywords = Array.from(new Set([...rawKeywords, ...semanticExpansions]));
    const keywordRegexes = allSearchKeywords.map((kw) => new RegExp(escapeRegex(kw), 'i'));

    // 2. CHECK CO-VIEW ITEMS FOR THESE BASE PRODUCTS
    let coViewIds = [];
    if (targetIds.length > 0) {
      const coViewRows = await ProductCoView.find({
        productId: { $in: targetIds },
        coViewedProductId: { $nin: targetIds }
      })
        .sort({ count: -1 })
        .limit(limit * 2)
        .lean();
      coViewIds = coViewRows.map((r) => r.coViewedProductId);
    }

    // 3. QUERY CANDIDATE PRODUCTS
    // Include products that match title/name keywords, semantic expansions, category, or co-views
    const orConditions = [];

    if (keywordRegexes.length > 0) {
      for (const rx of keywordRegexes) {
        orConditions.push({ title: rx });
        orConditions.push({ name: rx });
      }
    }

    if (baseCategories.length > 0) {
      orConditions.push({ category: { $in: baseCategories } });
    }

    if (coViewIds.length > 0) {
      orConditions.push({ _id: { $in: coViewIds } });
    }

    const candidateQuery = {
      _id: { $nin: targetIds },
      status: { $in: CATALOG_VISIBLE },
      ...(sameCategoryOnly ? { category: { $in: baseCategories } } : orConditions.length > 0 ? { $or: orConditions } : {})
    };

    let candidates = await Post.find(candidateQuery)
      .select('+textEmbedding')
      .populate('author sellerId', 'name email avatar shopInfo isSeller sellerStatus')
      .limit(60)
      .lean();

    // Luôn bổ sung sản phẩm trong cùng danh mục để đảm bảo ưu tiên danh mục trước
    if (baseCategories.length > 0) {
      const existingCandIds = new Set(candidates.map((c) => c._id.toString()));
      const sameCatProds = await Post.find({
        _id: { $nin: [...targetIds, ...Array.from(existingCandIds)] },
        category: { $in: baseCategories },
        status: { $in: CATALOG_VISIBLE }
      })
        .select('+textEmbedding')
        .sort({ soldCount: -1, createdAt: -1 })
        .limit(limit * 2)
        .populate('author sellerId', 'name email avatar shopInfo isSeller sellerStatus')
        .lean();
      candidates = [...candidates, ...sameCatProds];
    }

    // If still too few, supplement with top products in general visible
    if (!sameCategoryOnly && candidates.length < limit) {
      const more = await Post.find({
        _id: { $nin: [...targetIds, ...candidates.map((c) => c._id)] },
        status: { $in: CATALOG_VISIBLE }
      })
        .sort({ soldCount: -1, createdAt: -1 })
        .limit(limit * 2)
        .populate('author sellerId', 'name email avatar shopInfo isSeller sellerStatus')
        .lean();
      candidates = [...candidates, ...more];
    }

    if (candidates.length === 0) {
      return sameCategoryOnly ? [] : getColdStartRecommendations({ currentUserId: userId, limit });
    }

    // 4. SCORE CANDIDATES WITH STRICT TIER PRIORITY:
    // TIER 1: SAME CATEGORY (+100.0) -> Always ranked at the top!
    // TIER 2: TITLE & KEYWORDS MATCH (+15 to +40) -> Placed first within category, or next across categories
    // TIER 3: OTHER PRODUCTS (< 15) -> Placed at the end
    const targetVector = latestBase.textEmbedding;
    const scored = [];

    for (const prod of candidates) {
      let score = 0;
      const candTitle = (prod.title || prod.name || '').toLowerCase();
      const candCat = (prod.category || '').toLowerCase();
      let matchedReason = '';

      // 1. TOP PRIORITY: CATEGORY MATCH (Ưu tiên hàng đầu: Cùng danh mục)
      const isSameCategory = baseCategories.some((bc) => bc.toLowerCase() === candCat);
      if (isSameCategory) {
        score += 100.0; // Major priority: Same category comes first!
        matchedReason = `Cùng danh mục "${prod.category}" bạn quan tâm`;
      }

      // 2. SECOND PRIORITY: TITLE & KEYWORD MATCHING
      if (candTitle.includes('thức ăn') || candTitle.includes('đồ ăn') || candTitle.includes('hạt') || candTitle.includes('cám')) {
        score += 20.0;
        if (candTitle.includes('chó') || candTitle.includes('mèo') || candTitle.includes('thú cưng')) {
          score += 15.0;
          matchedReason = isSameCategory
            ? 'Cùng danh mục & đúng thức ăn thú cưng cần tìm'
            : 'Thức ăn & đồ dùng thú cưng (chó mèo) cùng nhu cầu';
        } else {
          matchedReason = isSameCategory
            ? 'Cùng danh mục & loại dinh dưỡng phù hợp'
            : 'Cùng loại thức ăn & dinh dưỡng bạn vừa xem';
        }
      }

      if (candTitle.includes('rùa')) {
        score += 25.0;
        matchedReason = isSameCategory
          ? 'Cùng danh mục & liên quan rùa cảnh bạn vừa xem'
          : 'Liên quan trực tiếp đến rùa cảnh bạn vừa xem';
      }

      // Check extracted keywords from title
      for (const kw of rawKeywords) {
        if (candTitle.includes(kw)) {
          score += kw.includes(' ') ? 15.0 : 8.0;
          if (!matchedReason || matchedReason.startsWith('Cùng danh mục')) {
            matchedReason = isSameCategory
              ? `Cùng danh mục & khớp từ khóa "${kw}"`
              : `Khớp từ khóa "${kw}" từ món bạn vừa xem`;
          }
        }
      }

      // 3. SEMANTIC EXPANSIONS
      for (const sem of semanticExpansions) {
        if (candTitle.includes(sem)) {
          score += 5.0;
          if (!matchedReason) {
            matchedReason = `Phù hợp với nhóm sản phẩm liên quan "${sem}"`;
          }
        }
      }

      // Co-view boost
      const isCoViewed = coViewIds.some((cid) => cid.toString() === prod._id.toString());
      if (isCoViewed) {
        score += 6.0;
        if (!matchedReason) {
          matchedReason = `Khách hàng xem món này cũng thường chọn`;
        }
      }

      // Price closeness (+- 35%)
      if (avgPrice > 0 && typeof prod.price === 'number') {
        const diff = Math.abs(prod.price - avgPrice) / avgPrice;
        if (diff <= 0.35) {
          score += 2.0;
        }
      }

      // Content embedding similarity if present
      if (Array.isArray(targetVector) && Array.isArray(prod.textEmbedding)) {
        const sim = cosineSimilarity(targetVector, prod.textEmbedding);
        score += sim * 6.0;
      }

      delete prod.textEmbedding;

      scored.push({
        product: prod,
        score,
        reason: matchedReason || `Gợi ý liên quan đến "${latestTitle.slice(0, 30)}"`
      });
    }

    // Sort descending by score -> Top matching items ("thức ăn cho chó mèo", "rùa", etc.) are placed at the very top!
    scored.sort((a, b) => b.score - a.score);

    const filtered = applyCatalogFilters(
      scored.map((s) => ({
        ...s.product,
        recoSource: 'related_to_recent',
        recoReason: s.reason
      })),
      {
        currentUserId: userId,
        excludeIds,
        maxPerSeller: RECOMMENDATION.MAX_PER_SELLER
      }
    ).slice(0, limit);

    // If still less than limit, top up with cold start
    if (!sameCategoryOnly && filtered.length < limit) {
      const existingIds = new Set(filtered.map((p) => p._id.toString()));
      const coldItems = await getColdStartRecommendations({ currentUserId: userId, limit: limit - filtered.length });
      for (const item of coldItems) {
        if (!existingIds.has(item._id.toString()) && !excludeIds.includes(item._id.toString())) {
          filtered.push({
            ...item,
            recoSource: 'related_to_recent',
            recoReason: `Khám phá thêm cho bạn`
          });
          existingIds.add(item._id.toString());
        }
      }
    }

    return filtered;
  } catch (error) {
    console.warn('[RecoService] getRelatedToRecent error:', error.message);
    return sameCategoryOnly ? [] : getColdStartRecommendations({ currentUserId: userId, limit });
  }
}

module.exports = {
  getRecentlyViewed,
  getForYou,
  getSimilarProducts,
  getAlsoViewed,
  getRelatedToRecent,
  applyCatalogFilters,
  cosineSimilarity,
  invalidateUserRecoCache
};
