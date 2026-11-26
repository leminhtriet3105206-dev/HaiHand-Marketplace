import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { track, initTracker, isTrackingAllowed } from './tracker';

function extractReferrerDomain() {
  try {
    if (!document.referrer) return '';
    return new URL(document.referrer).hostname;
  } catch {
    return '';
  }
}

export default function usePageViews() {
  const location = useLocation();
  const lastTrackedRef = useRef('');

  useEffect(() => {
    if (!isTrackingAllowed()) return;
    initTracker();

    const fullPath = `${location.pathname}${location.search || ''}`;
    if (lastTrackedRef.current === fullPath) return;
    lastTrackedRef.current = fullPath;

    const params = new URLSearchParams(location.search || '');
    const area = location.pathname.startsWith('/seller-channel') ? 'seller' : 'buyer';

    track(
      'page_view',
      {
        path: location.pathname,
        title: typeof document !== 'undefined' ? document.title : '',
        referrer: extractReferrerDomain(),
        utm_source: params.get('utm_source') || undefined,
        utm_medium: params.get('utm_medium') || undefined,
        utm_campaign: params.get('utm_campaign') || undefined
      },
      { area, path: location.pathname }
    );
  }, [location.pathname, location.search]);
}
