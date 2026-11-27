const express = require('express');
const mongoose = require('mongoose');

const VALID_SECTIONS = new Set([
  'overview',
  'funnel',
  'customers',
  'products',
  'search',
  'retention',
  'traffic',
]);

const VALID_SEGMENTS = new Set([
  'all',
  'device:mobile',
  'device:desktop',
  'device:tablet',
  'source:direct',
  'source:facebook',
  'source:google',
  'source:zalo',
  'source:other',
]);

const VALID_DEVICES = new Set(['all', 'mobile', 'desktop', 'tablet']);
const VALID_SOURCES = new Set(['all', 'direct', 'facebook', 'google', 'zalo', 'other']);
const VALID_PRODUCT_SORTS = new Set(['views', 'cartRate', 'conversion', 'favorites', 'orders', 'addToCart']);

function toVnDateString(dateObj) {
  const vnMs = dateObj.getTime() + 7 * 60 * 60 * 1000;
  return new Date(vnMs).toISOString().slice(0, 10);
}

function parseDateRange(fromParam, toParam) {
  const now = new Date();
  const defaultTo = toVnDateString(now);
  const defaultFrom = toVnDateString(new Date(now.getTime() - 29 * 86400000));

  const isoRe = /^\d{4}-\d{2}-\d{2}$/;
  const to = typeof toParam === 'string' && isoRe.test(toParam.trim()) ? toParam.trim() : defaultTo;
  let from = typeof fromParam === 'string' && isoRe.test(fromParam.trim()) ? fromParam.trim() : defaultFrom;

  const fromDate = new Date(`${from}T00:00:00Z`);
  const toDate = new Date(`${to}T00:00:00Z`);

  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || fromDate > toDate) {
    return { from: defaultFrom, to: defaultTo, days: 30, error: null };
  }

  const diffDays = Math.floor((toDate - fromDate) / 86400000) + 1;
  if (diffDays > 365) {
    const clampedFrom = toVnDateString(new Date(toDate.getTime() - 364 * 86400000));
    return { from: clampedFrom, to, days: 365, error: null };
  }

  return { from, to, days: diffDays, error: null };
}

function maskEmail(email) {
  if (!email || typeof email !== 'string') return 'Ẩn danh';
  const parts = email.split('@');
  if (parts.length !== 2) return '***';
  const local = parts[0];
  const domain = parts[1];
  const visible = local.slice(0, 1) || '*';
  return `${visible}***@${domain}`;
}

function defaultGetCollection(name) {
  return mongoose.connection.collection(name);
}

async function getMetaFlags(getCol = defaultGetCollection) {
  try {
    const [lastRun, syntheticDaily] = await Promise.all([
      getCol('analytics_runs').find({ error: null }).sort({ finishedAt: -1, ranAt: -1 }).limit(1).toArray(),
      getCol('analytics_daily').findOne({ hasSynthetic: true }, { projection: { _id: 1 } }),
    ]);
    return {
      lastRunAt: lastRun[0]?.finishedAt || lastRun[0]?.ranAt || null,
      hasSyntheticGlobal: Boolean(syntheticDaily),
    };
  } catch (e) {
    return { lastRunAt: null, hasSyntheticGlobal: false };
  }
}

function createAnalyticsRouter({ checkLogin, User, getCollection }) {
  const router = express.Router();
  const col = typeof getCollection === 'function' ? getCollection : defaultGetCollection;

  router.get('/admin/analytics', checkLogin, async (req, res) => {
    const meta = await getMetaFlags(col);
    res.render('analytics', {
      active: 'analytics',
      pageTitle: 'Phân tích Hành vi & Sản phẩm | HaiHand Admin',
      lastRunAt: meta.lastRunAt,
      hasSynthetic: meta.hasSyntheticGlobal,
      currentUser: req.session?.user,
    });
  });

  router.get('/admin/analytics/api/:section', checkLogin, async (req, res) => {
    const section = String(req.params.section || '').toLowerCase();
    if (!VALID_SECTIONS.has(section)) {
      return res.status(400).json({ success: false, error: 'Mục phân tích không hợp lệ.' });
    }

    const { from, to, days } = parseDateRange(req.query.from, req.query.to);
    const deviceFilter = VALID_DEVICES.has(req.query.device) ? req.query.device : 'all';
    const sourceFilter = VALID_SOURCES.has(req.query.source) ? req.query.source : 'all';

    let segment = 'all';
    if (req.query.segment && VALID_SEGMENTS.has(req.query.segment)) {
      segment = req.query.segment;
    } else if (deviceFilter !== 'all') {
      segment = `device:${deviceFilter}`;
    } else if (sourceFilter !== 'all') {
      segment = `source:${sourceFilter}`;
    }

    try {
      const meta = await getMetaFlags(col);

      if (section === 'overview' || section === 'traffic') {
        const [overallDocs, deviceDocs, sourceDocs, funnelDocs, heatmapDocs] = await Promise.all([
          col('analytics_daily')
            .find({ dimension: 'overall', key: 'all', date: { $gte: from, $lte: to } })
            .sort({ date: 1 })
            .toArray(),
          col('analytics_daily')
            .find({ dimension: 'device', date: { $gte: from, $lte: to } })
            .toArray(),
          col('analytics_daily')
            .find({ dimension: 'source', date: { $gte: from, $lte: to } })
            .toArray(),
          col('analytics_funnel')
            .find({ segment: 'all', date: { $gte: from, $lte: to } })
            .toArray(),
          col('analytics_heatmap').find({ period: '30d' }).toArray(),
        ]);

        const totalSessions = overallDocs.reduce((s, d) => s + (d.sessions || 0), 0);
        const totalPageViews = overallDocs.reduce((s, d) => s + (d.pageViews || 0), 0);
        const avgDau = overallDocs.length
          ? Math.round(overallDocs.reduce((s, d) => s + (d.dau || 0), 0) / overallDocs.length)
          : 0;
        const latestMau = overallDocs.length ? overallDocs[overallDocs.length - 1].mau || 0 : 0;
        const avgDurationSec = totalSessions
          ? Math.round(
              overallDocs.reduce((s, d) => s + (d.avgDurationSec || 0) * (d.sessions || 0), 0) /
                totalSessions
            )
          : 0;
        const bounceRate = totalSessions
          ? Number(
              (
                overallDocs.reduce((s, d) => s + (d.bounceRate || 0) * (d.sessions || 0), 0) /
                totalSessions
              ).toFixed(2)
            )
          : 0;

        let funnelViewSessions = 0;
        let funnelOrderSessions = 0;
        for (const f of funnelDocs) {
          const steps = Array.isArray(f.steps) ? f.steps : [];
          const viewStep = steps.find((s) => s.key === 'product_view');
          const orderStep = steps.find((s) => s.key === 'order_placed');
          funnelViewSessions += viewStep ? viewStep.sessions || 0 : 0;
          funnelOrderSessions += orderStep ? orderStep.sessions || 0 : 0;
        }
        const conversionRate = funnelViewSessions
          ? Number(((funnelOrderSessions / funnelViewSessions) * 100).toFixed(2))
          : 0;

        const deviceMap = {};
        for (const d of deviceDocs) {
          const k = d.key || 'desktop';
          deviceMap[k] = (deviceMap[k] || 0) + (d.sessions || 0);
        }

        const sourceMap = {};
        for (const s of sourceDocs) {
          const k = s.key || 'direct';
          sourceMap[k] = (sourceMap[k] || 0) + (s.sessions || 0);
        }

        const hasSynthetic =
          overallDocs.some((d) => d.hasSynthetic) ||
          deviceDocs.some((d) => d.hasSynthetic) ||
          meta.hasSyntheticGlobal;

        const suggestions = [];
        if (bounceRate > 55) {
          suggestions.push(
            `Tỷ lệ thoát đang ở mức ${bounceRate}% (>55%): cân nhắc tối ưu tốc độ tải trang chủ và hiển thị sản phẩm nổi bật ngay màn hình đầu.`
          );
        }
        const mobileSessions = deviceMap.mobile || 0;
        if (totalSessions > 0 && mobileSessions / totalSessions >= 0.55) {
          suggestions.push(
            `Lưu lượng Mobile chiếm ${Math.round((mobileSessions / totalSessions) * 100)}%: ưu tiên kiểm tra trải nghiệm nút Mua ngay & giỏ hàng trên di động.`
          );
        }
        if (suggestions.length === 0 && totalSessions > 0) {
          suggestions.push(
            `Tỷ lệ chuyển đổi đặt hàng đạt ${conversionRate}% trên ${totalSessions.toLocaleString('vi-VN')} phiên trong kỳ.`
          );
        }

        return res.json({
          success: true,
          range: { from, to, days },
          hasSynthetic,
          lastRunAt: meta.lastRunAt,
          kpis: {
            avgDau,
            latestMau,
            totalSessions,
            pagesPerSession: totalSessions ? Number((totalPageViews / totalSessions).toFixed(2)) : 0,
            avgDurationSec,
            bounceRate,
            conversionRate,
          },
          dailySeries: overallDocs.map((d) => ({
            date: d.date,
            dau: d.dau || 0,
            loggedInDau: d.loggedInDau || 0,
            anonymousDau: d.anonymousDau || 0,
            sessions: d.sessions || 0,
          })),
          devices: Object.entries(deviceMap).map(([key, sessions]) => ({ key, sessions })),
          sources: Object.entries(sourceMap).map(([key, sessions]) => ({ key, sessions })),
          heatmap: heatmapDocs.map((h) => ({
            weekday: h.weekday,
            hour: h.hour,
            sessions: h.sessions || 0,
          })),
          suggestions,
        });
      }

      if (section === 'funnel') {
        const [segDocs, allSegDocs] = await Promise.all([
          col('analytics_funnel')
            .find({ segment, date: { $gte: from, $lte: to } })
            .toArray(),
          col('analytics_funnel')
            .find({ date: { $gte: from, $lte: to } })
            .toArray(),
        ]);

        const stepKeys = [
          { key: 'product_view', label: 'Xem sản phẩm' },
          { key: 'add_to_cart', label: 'Thêm vào giỏ' },
          { key: 'checkout_start', label: 'Bắt đầu thanh toán' },
          { key: 'order_placed', label: 'Đặt hàng' },
          { key: 'payment_success', label: 'Thanh toán thành công' },
        ];

        const aggSteps = stepKeys.map((sk) => ({ ...sk, sessions: 0 }));
        let totalCartSessions = 0;
        let totalAbandoned = 0;

        for (const doc of segDocs) {
          totalCartSessions += doc.cartSessions || 0;
          totalAbandoned += doc.abandonedCartSessions || 0;
          for (const st of doc.steps || []) {
            const target = aggSteps.find((a) => a.key === st.key);
            if (target) target.sessions += st.sessions || 0;
          }
        }

        const firstCount = aggSteps[0].sessions || 0;
        let biggestDropStep = null;
        let biggestDropPct = 0;
        const stepsOut = aggSteps.map((st, idx) => {
          const prev = idx > 0 ? aggSteps[idx - 1].sessions : st.sessions;
          const pctFromPrev = prev > 0 ? Number(((st.sessions / prev) * 100).toFixed(2)) : 0;
          const pctFromStart = firstCount > 0 ? Number(((st.sessions / firstCount) * 100).toFixed(2)) : 0;
          const dropPct = idx > 0 && prev > 0 ? Number((100 - pctFromPrev).toFixed(2)) : 0;
          if (idx > 0 && dropPct > biggestDropPct) {
            biggestDropPct = dropPct;
            biggestDropStep = st.label;
          }
          return { ...st, pctFromPrev, pctFromStart, dropPct };
        });

        const cartAbandonmentRate =
          totalCartSessions > 0 ? Number(((totalAbandoned / totalCartSessions) * 100).toFixed(2)) : 0;

        // Compare by device/source
        const compMap = {};
        for (const doc of allSegDocs) {
          const seg = doc.segment || 'all';
          if (!compMap[seg]) {
            compMap[seg] = {
              segment: seg,
              views: 0,
              addToCart: 0,
              checkout: 0,
              orders: 0,
              paid: 0,
            };
          }
          for (const st of doc.steps || []) {
            if (st.key === 'product_view') compMap[seg].views += st.sessions || 0;
            if (st.key === 'add_to_cart') compMap[seg].addToCart += st.sessions || 0;
            if (st.key === 'checkout_start') compMap[seg].checkout += st.sessions || 0;
            if (st.key === 'order_placed') compMap[seg].orders += st.sessions || 0;
            if (st.key === 'payment_success') compMap[seg].paid += st.sessions || 0;
          }
        }

        const comparison = Object.values(compMap).map((c) => ({
          ...c,
          conversionRate: c.views > 0 ? Number(((c.orders / c.views) * 100).toFixed(2)) : 0,
        }));

        const hasSynthetic = segDocs.some((d) => d.hasSynthetic) || meta.hasSyntheticGlobal;
        const suggestions = [];
        if (biggestDropStep) {
          suggestions.push(
            `Điểm rơi lớn nhất tại bước "${biggestDropStep}" (rơi ${biggestDropPct}%): nên kiểm tra lại UX/phí vận chuyển hoặc quy trình ở bước này.`
          );
        }
        if (cartAbandonmentRate > 65) {
          suggestions.push(
            `Tỷ lệ bỏ giỏ đạt ${cartAbandonmentRate}%: gợi ý bật thông báo nhắc giỏ hàng hoặc ưu đãi miễn phí vận chuyển.`
          );
        }

        return res.json({
          success: true,
          range: { from, to, days },
          segment,
          hasSynthetic,
          lastRunAt: meta.lastRunAt,
          steps: stepsOut,
          biggestDropStep,
          biggestDropPct,
          cartAbandonmentRate,
          comparison,
          suggestions,
        });
      }

      if (section === 'customers') {
        const [segments, clusterProfiles] = await Promise.all([
          col('analytics_segments').find({}).toArray(),
          col('analytics_cluster_profiles').find({}).sort({ cluster: 1 }).toArray(),
        ]);

        const rfmCounts = {};
        for (const s of segments) {
          const lbl = s.rfm_label || 'Khác';
          rfmCounts[lbl] = (rfmCounts[lbl] || 0) + 1;
        }

        const atRiskRaw = segments
          .filter((s) => s.rfm_label === 'Có nguy cơ rời bỏ' || s.rfm_label === 'Ngủ đông/Đã mất')
          .sort((a, b) => (b.monetary || 0) - (a.monetary || 0))
          .slice(0, 20);

        const validIds = atRiskRaw
          .map((s) => s.userId)
          .filter((id) => mongoose.Types.ObjectId.isValid(id));

        const usersList = validIds.length
          ? await User.find({ _id: { $in: validIds } })
              .select('name email')
              .lean()
          : [];
        const userMap = new Map(usersList.map((u) => [String(u._id), u]));

        const atRiskCustomers = atRiskRaw.map((s) => {
          const u = userMap.get(String(s.userId));
          return {
            name: u?.name || 'Khách hàng (mô phỏng)',
            emailMasked: maskEmail(u?.email),
            rfmLabel: s.rfm_label,
            frequency: s.frequency || 0,
            monetary: s.monetary || 0,
            recencyDays: s.recencyDays || 0,
            lastOrderAt: s.lastOrderAt || null,
          };
        });

        const hasSynthetic =
          segments.some((d) => d.hasSynthetic) ||
          clusterProfiles.some((d) => d.hasSynthetic) ||
          meta.hasSyntheticGlobal;

        const suggestions = [];
        const atRiskTotal = rfmCounts['Có nguy cơ rời bỏ'] || 0;
        if (atRiskTotal > 0) {
          suggestions.push(
            `Có ${atRiskTotal} khách hàng thuộc nhóm "Có nguy cơ rời bỏ": nên gửi mã giảm giá tái kích hoạt cho Top 20 khách chi tiêu cao.`
          );
        }
        if (clusterProfiles.length === 0 && segments.length > 0 && segments.length < 30) {
          suggestions.push(
            `Hiện mới có ${segments.length} khách có đơn hàng (<30 khách) nên KMeans tự động tạm bỏ qua — tiếp tục thu thập thêm đơn hoặc chạy seed demo.`
          );
        }

        return res.json({
          success: true,
          hasSynthetic,
          lastRunAt: meta.lastRunAt,
          totalCustomers: segments.length,
          rfmDistribution: Object.entries(rfmCounts).map(([label, count]) => ({ label, count })),
          clusters: clusterProfiles,
          atRiskCustomers,
          suggestions,
        });
      }

      if (section === 'products') {
        const periodDays = days <= 10 ? 7 : days <= 45 ? 30 : 90;
        const sortField = VALID_PRODUCT_SORTS.has(req.query.sort) ? req.query.sort : 'views';
        const sortOrder = req.query.order === 'asc' ? 1 : -1;

        let summaryDocs = await col('analytics_products_summary')
          .find({ periodDays })
          .sort({ [sortField]: sortOrder })
          .limit(50)
          .toArray();

        if (summaryDocs.length === 0) {
          summaryDocs = await col('analytics_products_summary')
            .find({ periodDays: 30 })
            .sort({ [sortField]: sortOrder })
            .limit(50)
            .toArray();
        }

        const allSummary = await col('analytics_products_summary')
          .find({ periodDays: summaryDocs[0]?.periodDays || 30 })
          .toArray();

        const highViewLowBuy = allSummary
          .filter((p) => p.flagHighViewLowBuy)
          .sort((a, b) => (b.views || 0) - (a.views || 0))
          .slice(0, 10);

        const potentialProducts = allSummary
          .filter((p) => p.flagPotential)
          .sort((a, b) => (b.conversion || 0) - (a.conversion || 0))
          .slice(0, 10);

        const catMap = {};
        for (const p of allSummary) {
          const cat = p.category || 'Khác';
          if (!catMap[cat]) catMap[cat] = { category: cat, views: 0, orders: 0, addToCart: 0 };
          catMap[cat].views += p.views || 0;
          catMap[cat].orders += p.orders || 0;
          catMap[cat].addToCart += p.addToCart || 0;
        }
        const categoryStats = Object.values(catMap)
          .sort((a, b) => b.views - a.views)
          .slice(0, 10);

        const hasSynthetic = summaryDocs.some((d) => d.hasSynthetic) || meta.hasSyntheticGlobal;
        const suggestions = [];
        if (highViewLowBuy.length > 0) {
          suggestions.push(
            `Có ${highViewLowBuy.length} sản phẩm "Xem nhiều – ít mua" (nổi bật: ${highViewLowBuy[0].title}): nhắc người bán xem lại giá bán hoặc chất lượng ảnh mô tả.`
          );
        }
        if (potentialProducts.length > 0) {
          suggestions.push(
            `Có ${potentialProducts.length} sản phẩm "Tiềm năng" chuyển đổi cao nhưng ít lượt xem: nên đẩy lên vị trí nổi bật ở trang chủ.`
          );
        }

        return res.json({
          success: true,
          range: { from, to, days },
          periodDays: summaryDocs[0]?.periodDays || periodDays,
          hasSynthetic,
          lastRunAt: meta.lastRunAt,
          products: summaryDocs,
          highViewLowBuy,
          potentialProducts,
          categoryStats,
          suggestions,
        });
      }

      if (section === 'search') {
        const searchDocs = await col('analytics_search')
          .find({ date: { $gte: from, $lte: to } })
          .toArray();

        const queryMap = {};
        for (const d of searchDocs) {
          const q = d.query || '';
          if (!q) continue;
          if (!queryMap[q]) {
            queryMap[q] = { query: q, count: 0, clicks: 0, zeroResults: 0, conversions: 0 };
          }
          queryMap[q].count += d.count || 0;
          queryMap[q].clicks += d.clicks || 0;
          queryMap[q].zeroResults += d.zeroResults || 0;
          queryMap[q].conversions += d.conversions || 0;
        }

        const list = Object.values(queryMap).map((item) => ({
          ...item,
          ctr: item.count > 0 ? Number(((item.clicks / item.count) * 100).toFixed(2)) : 0,
          zeroResultRate:
            item.count > 0 ? Number(((item.zeroResults / item.count) * 100).toFixed(2)) : 0,
          conversionRate:
            item.count > 0 ? Number(((item.conversions / item.count) * 100).toFixed(2)) : 0,
        }));

        const topQueries = [...list].sort((a, b) => b.count - a.count).slice(0, 30);
        const zeroResultQueries = list
          .filter((q) => q.zeroResults > 0)
          .sort((a, b) => b.zeroResults - a.zeroResults)
          .slice(0, 20);

        const totalSearches = list.reduce((s, q) => s + q.count, 0);
        const totalClicks = list.reduce((s, q) => s + q.clicks, 0);
        const totalZero = list.reduce((s, q) => s + q.zeroResults, 0);

        const hasSynthetic = searchDocs.some((d) => d.hasSynthetic) || meta.hasSyntheticGlobal;
        const suggestions = [];
        if (zeroResultQueries.length > 0) {
          suggestions.push(
            `Từ khóa "${zeroResultQueries[0].query}" có ${zeroResultQueries[0].zeroResults} lượt tìm không có kết quả: gợi ý bổ sung nguồn hàng hoặc từ đồng nghĩa tìm kiếm.`
          );
        }
        const overallCtr = totalSearches ? Number(((totalClicks / totalSearches) * 100).toFixed(2)) : 0;
        if (totalSearches > 0 && overallCtr < 30) {
          suggestions.push(
            `CTR tìm kiếm trung bình đạt ${overallCtr}%: cân nhắc cải thiện thuật toán sắp xếp kết quả phù hợp hơn.`
          );
        }

        return res.json({
          success: true,
          range: { from, to, days },
          hasSynthetic,
          lastRunAt: meta.lastRunAt,
          kpis: {
            totalSearches,
            avgCtr: overallCtr,
            zeroResultRate: totalSearches ? Number(((totalZero / totalSearches) * 100).toFixed(2)) : 0,
          },
          topQueries,
          zeroResultQueries,
          suggestions,
        });
      }

      if (section === 'retention') {
        const cohorts = await col('analytics_cohorts')
          .find({})
          .sort({ cohortWeek: 1 })
          .limit(20)
          .toArray();

        const avgByWeek = [];
        for (let w = 0; w <= 8; w += 1) {
          const evVals = cohorts
            .map((c) => c.eventRetention?.[String(w)])
            .filter((v) => typeof v === 'number');
          const ordVals = cohorts
            .map((c) => c.orderRetention?.[String(w)])
            .filter((v) => typeof v === 'number');
          avgByWeek.push({
            week: `Tuần ${w}`,
            eventRetentionAvg: evVals.length
              ? Number((evVals.reduce((a, b) => a + b, 0) / evVals.length).toFixed(2))
              : null,
            orderRetentionAvg: ordVals.length
              ? Number((ordVals.reduce((a, b) => a + b, 0) / ordVals.length).toFixed(2))
              : null,
          });
        }

        const hasSynthetic = cohorts.some((d) => d.hasSynthetic) || meta.hasSyntheticGlobal;
        const w1 = avgByWeek[1]?.eventRetentionAvg;
        const suggestions = [];
        if (typeof w1 === 'number') {
          suggestions.push(
            w1 < 25
              ? `Tỷ lệ giữ chân tuần 1 trung bình là ${w1}% (<25%): nên gửi email/thông báo chào mừng kèm gợi ý sản phẩm cá nhân hóa trong tuần đầu.`
              : `Tỷ lệ giữ chân tuần 1 đạt ${w1}%: duy trì chiến dịch chăm sóc khách hàng định kỳ.`
          );
        }

        return res.json({
          success: true,
          hasSynthetic,
          lastRunAt: meta.lastRunAt,
          cohorts,
          avgByWeek,
          suggestions,
        });
      }
    } catch (err) {
      console.error(`Admin analytics API error [${section}]:`, err);
      return res.status(500).json({ success: false, error: 'Lỗi máy chủ khi truy vấn dữ liệu phân tích.' });
    }
  });

  return router;
}

module.exports = { createAnalyticsRouter, maskEmail, parseDateRange };
