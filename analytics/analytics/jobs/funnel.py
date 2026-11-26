from typing import Any, Dict, List
import pandas as pd


FUNNEL_STEPS = [
    ("product_view", "Xem sản phẩm"),
    ("add_to_cart", "Thêm vào giỏ"),
    ("checkout_start", "Bắt đầu thanh toán"),
    ("order_placed", "Đặt hàng"),
    ("payment_success", "Thanh toán thành công"),
]


def _compute_segment_funnel(df_seg: pd.DataFrame, date_val: str, segment: str, has_synthetic: bool) -> Dict[str, Any]:
    sess_events = df_seg.groupby("effective_session_id")["name"].apply(set)
    total_sessions = len(sess_events)

    # Đảm bảo phễu đơn điệu hợp lý theo bước: phiên đạt bước k cũng được tính đã đi qua bước trước nếu có
    # Tuy nhiên vẫn giữ đúng tập phiên có event bước đó; dùng logic tuần tự từng bước trên phiên
    step_sets: List[set] = []
    prev_set = set(sess_events.index)
    for idx, (ev_name, _) in enumerate(FUNNEL_STEPS):
        if idx == 0:
            matched = {sid for sid, evs in sess_events.items() if ev_name in evs}
        else:
            # Bước sau phải thuộc tập phiên đã có bước trước (hoặc có đặt hàng trực tiếp ở server)
            matched = {sid for sid in prev_set if ev_name in sess_events.get(sid, set())}
        step_sets.append(matched)
        prev_set = matched

    steps_out = []
    first_count = len(step_sets[0]) if step_sets else 0
    biggest_drop_step = None
    biggest_drop_pct = 0.0

    for i, (ev_name, label) in enumerate(FUNNEL_STEPS):
        cnt = len(step_sets[i])
        prev_cnt = len(step_sets[i - 1]) if i > 0 else cnt
        pct_from_prev = round((cnt / prev_cnt) * 100, 2) if prev_cnt > 0 else 0.0
        pct_from_start = round((cnt / first_count) * 100, 2) if first_count > 0 else 0.0
        drop_pct = round(100.0 - pct_from_prev, 2) if i > 0 and prev_cnt > 0 else 0.0

        if i > 0 and drop_pct > biggest_drop_pct:
            biggest_drop_pct = drop_pct
            biggest_drop_step = label

        steps_out.append(
            {
                "key": ev_name,
                "label": label,
                "sessions": cnt,
                "pctFromPrev": pct_from_prev,
                "pctFromStart": pct_from_start,
                "dropPct": drop_pct,
            }
        )

    # Bỏ giỏ: phiên có add_to_cart nhưng không có order_placed trong cùng phiên hoặc 24h kế theo userId
    cart_sessions = df_seg[df_seg["name"] == "add_to_cart"][
        ["effective_session_id", "actor_id", "ts_utc"]
    ].drop_duplicates("effective_session_id")
    order_df = df_seg[df_seg["name"] == "order_placed"][["effective_session_id", "actor_id", "ts_utc"]]
    order_sids = set(order_df["effective_session_id"])

    abandoned = 0
    for _, row in cart_sessions.iterrows():
        sid = row["effective_session_id"]
        if sid in order_sids:
            continue
        actor = row["actor_id"]
        t0 = row["ts_utc"]
        later_orders = order_df[
            (order_df["actor_id"] == actor)
            & (order_df["ts_utc"] >= t0)
            & (order_df["ts_utc"] <= t0 + pd.Timedelta(hours=24))
        ]
        if later_orders.empty:
            abandoned += 1

    cart_total = int(len(cart_sessions))
    abandon_rate = round((abandoned / cart_total) * 100, 2) if cart_total > 0 else 0.0

    return {
        "date": date_val,
        "segment": segment,
        "totalSessions": int(total_sessions),
        "steps": steps_out,
        "biggestDropStep": biggest_drop_step,
        "biggestDropPct": biggest_drop_pct,
        "cartSessions": cart_total,
        "abandonedCartSessions": abandoned,
        "cartAbandonmentRate": abandon_rate,
        "hasSynthetic": bool(has_synthetic),
    }


def compute(df_sessions: pd.DataFrame, has_synthetic: bool = False) -> List[Dict[str, Any]]:
    if df_sessions is None or df_sessions.empty:
        return []

    records: List[Dict[str, Any]] = []
    for d, day_df in df_sessions.groupby("date"):
        records.append(_compute_segment_funnel(day_df, str(d), "all", has_synthetic))
        for dev, dev_df in day_df.groupby("device"):
            records.append(_compute_segment_funnel(dev_df, str(d), f"device:{dev}", has_synthetic))
        for src, src_df in day_df.groupby("source"):
            records.append(_compute_segment_funnel(src_df, str(d), f"source:{src}", has_synthetic))

    return records
