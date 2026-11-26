import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getConsent, setConsent, isDoNotTrackEnabled, initTracker } from './tracker';

export default function ConsentBanner() {
  const [visible, setVisible] = useState(() => {
    return getConsent() === null && !isDoNotTrackEnabled();
  });

  useEffect(() => {
    if (getConsent() === 'granted' && !isDoNotTrackEnabled()) {
      initTracker();
    }
    const onChanged = () => {
      setVisible(getConsent() === null && !isDoNotTrackEnabled());
    };
    window.addEventListener('hhAnalyticsConsentChanged', onChanged);
    return () => window.removeEventListener('hhAnalyticsConsentChanged', onChanged);
  }, []);

  if (!visible) return null;

  const handleChoice = (granted) => {
    setConsent(granted);
    if (granted) initTracker();
    setVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-label="Tùy chọn quyền riêng tư và phân tích"
      className="fixed bottom-4 left-4 right-4 md:left-6 md:right-auto md:max-w-lg z-[9990] bg-white border border-slate-200 rounded-2xl shadow-2xl p-4 sm:p-5 flex flex-col gap-3"
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
          <i className="fas fa-shield-alt"></i>
        </div>
        <div className="text-xs text-slate-600 leading-relaxed">
          <p className="font-extrabold text-slate-800 text-sm mb-1">
            Quyền riêng tư &amp; Cải thiện trải nghiệm
          </p>
          <p>
            HaiHand sử dụng dữ liệu duyệt trang ẩn danh để cải thiện tìm kiếm và gợi ý sản phẩm. Chúng tôi không lưu
            email, số điện thoại hay thông tin thanh toán trong dữ liệu phân tích.{' '}
            <Link to="/privacy" className="text-orange-600 font-bold underline hover:text-orange-700">
              Tìm hiểu thêm
            </Link>
            .
          </p>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => handleChoice(false)}
          className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-bold transition-colors"
        >
          Từ chối
        </button>
        <button
          type="button"
          onClick={() => handleChoice(true)}
          className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold shadow-xs transition-colors"
        >
          Đồng ý
        </button>
      </div>
    </div>
  );
}
