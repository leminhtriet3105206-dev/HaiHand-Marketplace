import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import axiosClient from '../../api/axiosClient';

function formatMoney(v) {
  return `${Math.round(Number(v || 0)).toLocaleString('vi-VN')} ₫`;
}

function formatDateShort(iso) {
  if (!iso) return '';
  const parts = String(iso).split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}` : iso;
}

const SellerAnalytics = () => {
  const [range, setRange] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  const fetchAnalytics = useCallback(async (selectedRange) => {
    setLoading(true);
    setError('');
    try {
      const res = await axiosClient.get(`/api/seller/analytics?range=${selectedRange}`);
      setData(res.data);
    } catch (err) {
      setError(err?.response?.data?.message || 'Không thể tải dữ liệu phân tích.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics(range);
  }, [range, fetchAnalytics]);

  const kpis = data?.kpis || { totalViews: 0, totalAddToCart: 0, totalOrders: 0, conversionRate: 0 };
  const dailySeries = data?.dailySeries || [];
  const peakHours = data?.peakHours || [];
  const topProducts = data?.topProducts || [];
  const searchKeywords = data?.searchKeywords || [];
  const suggestions = data?.suggestions || [];

  const maxDailyViews = Math.max(...dailySeries.map((d) => d.views || 0), 1);
  const maxHourViews = Math.max(...peakHours.map((h) => h.views || 0), 1);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Phân tích Shop</h1>
          <p className="text-xs text-slate-500 mt-1">
            Theo dõi lượt xem, tỷ lệ thêm vào giỏ, chuyển đổi đơn hàng và khung giờ khách xem nhiều.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setRange(d)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition ${
                range === d
                  ? 'bg-orange-500 text-white shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {d} ngày
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-xs text-slate-500">
          Đang tải dữ liệu phân tích...
        </div>
      )}

      {!loading && error && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 text-center space-y-2">
          <p className="text-sm font-bold text-rose-700">{error}</p>
          <button
            type="button"
            onClick={() => fetchAnalytics(range)}
            className="px-4 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-bold"
          >
            Thử lại
          </button>
        </div>
      )}

      {!loading && !error && (
        <>
          {/* 4 KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
              <div className="text-[11px] font-bold uppercase text-slate-400">Tổng lượt xem SP</div>
              <div className="text-2xl font-black text-slate-900 mt-1">
                {(kpis.totalViews || 0).toLocaleString('vi-VN')}
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
              <div className="text-[11px] font-bold uppercase text-slate-400">Lượt thêm vào giỏ</div>
              <div className="text-2xl font-black text-orange-600 mt-1">
                {(kpis.totalAddToCart || 0).toLocaleString('vi-VN')}
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
              <div className="text-[11px] font-bold uppercase text-slate-400">Đơn hàng phát sinh</div>
              <div className="text-2xl font-black text-emerald-600 mt-1">
                {(kpis.totalOrders || 0).toLocaleString('vi-VN')}
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
              <div className="text-[11px] font-bold uppercase text-slate-400">Tỷ lệ chuyển đổi</div>
              <div className="text-2xl font-black text-purple-600 mt-1">{kpis.conversionRate || 0}%</div>
            </div>
          </div>

          {/* Action Suggestions */}
          {suggestions.length > 0 && (
            <div className="space-y-2">
              {suggestions.map((msg, idx) => (
                <div
                  key={idx}
                  className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-xs text-amber-900 flex items-center gap-2"
                >
                  <span>💡</span>
                  <span>
                    <strong>Gợi ý cho Shop:</strong> {msg}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* 2 Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Chart 1: Daily Views & Cart Adds */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="text-sm font-bold text-slate-800 mb-4">Lượt xem &amp; Thêm giỏ theo ngày</h3>
              {dailySeries.length === 0 ? (
                <p className="text-xs text-slate-400 italic py-10 text-center">Chưa có dữ liệu trong kỳ này.</p>
              ) : (
                <div className="h-48 flex items-end gap-1.5 overflow-x-auto pt-4">
                  {dailySeries.slice(-14).map((d) => {
                    const hPct = Math.max(4, Math.round((d.views / maxDailyViews) * 100));
                    return (
                      <div key={d.date} className="flex-1 min-w-[22px] flex flex-col items-center gap-1">
                        <div className="w-full h-36 flex items-end justify-center">
                          <div
                            title={`${formatDateShort(d.date)}: ${d.views} xem, ${d.addToCart} giỏ`}
                            style={{ height: `${hPct}%` }}
                            className="w-full max-w-[20px] bg-orange-500 rounded-t-md transition-all"
                          />
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">{formatDateShort(d.date)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Chart 2: Peak Hours */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="text-sm font-bold text-slate-800 mb-4">Khung giờ khách xem nhiều nhất (VN)</h3>
              <div className="h-48 flex items-end gap-1 pt-4">
                {peakHours.map((h) => {
                  const hPct = h.views > 0 ? Math.max(6, Math.round((h.views / maxHourViews) * 100)) : 2;
                  return (
                    <div key={h.hour} className="flex-1 flex flex-col items-center gap-1">
                      <div className="w-full h-36 flex items-end">
                        <div
                          title={`${h.hour}:00 — ${h.views} lượt xem`}
                          style={{ height: `${hPct}%` }}
                          className={`w-full rounded-t ${h.views > 0 ? 'bg-purple-600' : 'bg-slate-100'}`}
                        />
                      </div>
                      <span className="text-[9px] text-slate-400 font-mono">
                        {h.hour % 3 === 0 ? h.hour : ''}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Search Keywords Leading to Shop */}
          {searchKeywords.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="text-sm font-bold text-slate-800 mb-3">Từ khóa khách tìm dẫn tới sản phẩm của Shop</h3>
              <div className="flex flex-wrap gap-2">
                {searchKeywords.map((kw) => (
                  <span
                    key={kw.query}
                    className="px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold"
                  >
                    {kw.query} ({kw.clicks})
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Product Performance Table */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-800">Hiệu quả từng sản phẩm</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 font-bold uppercase text-[11px]">
                    <th className="px-5 py-3">Sản phẩm</th>
                    <th className="px-5 py-3 text-right">Giá</th>
                    <th className="px-5 py-3 text-right">Lượt xem</th>
                    <th className="px-5 py-3 text-right">Thêm giỏ</th>
                    <th className="px-5 py-3 text-right">Đơn hàng</th>
                    <th className="px-5 py-3 text-right">Chuyển đổi</th>
                    <th className="px-5 py-3 text-center">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {topProducts.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="px-5 py-8 text-center text-slate-400 italic">
                        Chưa có dữ liệu sản phẩm trong kỳ đã chọn.
                      </td>
                    </tr>
                  ) : (
                    topProducts.map((p) => (
                      <tr key={p.productId} className="hover:bg-slate-50">
                        <td className="px-5 py-3 font-bold text-slate-800 max-w-[240px] truncate">
                          {p.title || p.productId}
                        </td>
                        <td className="px-5 py-3 text-right">{formatMoney(p.price)}</td>
                        <td className="px-5 py-3 text-right font-bold">{p.views}</td>
                        <td className="px-5 py-3 text-right">{p.addToCart}</td>
                        <td className="px-5 py-3 text-right font-bold text-emerald-600">{p.orders}</td>
                        <td className="px-5 py-3 text-right">{((p.conversion || 0) * 100).toFixed(1)}%</td>
                        <td className="px-5 py-3 text-center">
                          <Link
                            to={`/seller-channel/products/edit/${p.productId}`}
                            className="text-orange-600 hover:underline font-bold"
                          >
                            Chỉnh sửa
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default SellerAnalytics;
