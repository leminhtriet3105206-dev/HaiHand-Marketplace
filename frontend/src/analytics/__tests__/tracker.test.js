import {
  track,
  flush,
  setConsent,
  getConsent,
  getAnalyticsIds,
  __resetTrackerForTests
} from '../tracker';

describe('PHASE 2 - Frontend Analytics Tracker', () => {
  beforeEach(() => {
    __resetTrackerForTests();
    localStorage.clear();
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 204 });
    Object.defineProperty(window.navigator, 'doNotTrack', {
      value: '0',
      configurable: true
    });
  });

  test('1. Không lưu ID và không gửi /api/track khi chưa consent hoặc từ chối', async () => {
    track('page_view', { path: '/' });
    await flush();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(localStorage.getItem('hh_aid')).toBeNull();

    setConsent(false);
    expect(getConsent()).toBe('denied');
    track('product_view', { productId: '507f1f77bcf86cd799439011' });
    await flush();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('2. Tôn trọng navigator.doNotTrack === "1"', async () => {
    setConsent(true);
    Object.defineProperty(window.navigator, 'doNotTrack', {
      value: '1',
      configurable: true
    });

    track('page_view', { path: '/' });
    await flush();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('3. Gộp lô đủ 10 sự kiện tự động gửi batch lên /api/track', async () => {
    setConsent(true);
    for (let i = 0; i < 10; i += 1) {
      track('page_view', { path: `/p/${i}` });
    }
    await Promise.resolve();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.events).toHaveLength(10);
    expect(body.anonymousId).toBeTruthy();
    expect(body.sessionId).toBeTruthy();
  });

  test('4. Hết phiên sau 30 phút không hoạt động sẽ cấp sessionId mới', () => {
    setConsent(true);
    const first = getAnalyticsIds();
    // Giả lập lastActive cách đây 31 phút
    localStorage.setItem('hh_sid_ts', String(Date.now() - 31 * 60 * 1000));
    const second = getAnalyticsIds();
    expect(second.anonymousId).toBe(first.anonymousId);
    expect(second.sessionId).not.toBe(first.sessionId);
  });
});
