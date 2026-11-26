from typing import Any, Dict, List
import pandas as pd


def compute(df_sessions: pd.DataFrame, has_synthetic: bool = False) -> List[Dict[str, Any]]:
    """
    Tính chỉ số hàng ngày (DAU, WAU, MAU, phiên, trang/phiên, thời lượng TB, tỷ lệ thoát,
    thiết bị, nguồn truy cập, người mới/quay lại) từ DataFrame đã qua `build_sessions`.
    """
    if df_sessions is None or df_sessions.empty:
        return []

    df = df_sessions.copy()
    first_seen_by_actor = df.groupby("actor_id")["date"].min().to_dict()

    # Tính trước số page_view và duration cho mỗi phiên
    sess_group = df.groupby(["date", "effective_session_id"], as_index=False).agg(
        actor_id=("actor_id", "first"),
        device=("device", "first"),
        source=("source", "first"),
        min_ts=("ts_utc", "min"),
        max_ts=("ts_utc", "max"),
        event_count=("name", "count"),
        page_views=("name", lambda s: int((s == "page_view").sum())),
    )
    sess_group["duration_sec"] = (
        (sess_group["max_ts"] - sess_group["min_ts"]).dt.total_seconds().clip(lower=0)
    )
    sess_group["is_bounce"] = (sess_group["page_views"] == 1) & (sess_group["event_count"] == 1)

    records: List[Dict[str, Any]] = []
    dates = sorted(df["date"].unique())

    for d in dates:
        day_df = df[df["date"] == d]
        day_sess = sess_group[sess_group["date"] == d]

        total_sessions = int(len(day_sess))
        unique_actors = day_df["actor_id"].unique()
        dau = int(len(unique_actors))
        logged_in_dau = int(sum(1 for a in unique_actors if str(a).startswith("u:")))
        anon_dau = dau - logged_in_dau
        new_users = int(sum(1 for a in unique_actors if first_seen_by_actor.get(a) == d))
        returning_users = max(0, dau - new_users)

        # WAU / MAU tính trượt đến ngày d
        d_dt = pd.to_datetime(d)
        wau_start = (d_dt - pd.Timedelta(days=6)).strftime("%Y-%m-%d")
        mau_start = (d_dt - pd.Timedelta(days=29)).strftime("%Y-%m-%d")
        wau = int(df[(df["date"] >= wau_start) & (df["date"] <= d)]["actor_id"].nunique())
        mau = int(df[(df["date"] >= mau_start) & (df["date"] <= d)]["actor_id"].nunique())

        total_pv = int(day_sess["page_views"].sum())
        pages_per_session = round(total_pv / total_sessions, 2) if total_sessions else 0.0
        avg_duration_sec = round(float(day_sess["duration_sec"].mean()), 2) if total_sessions else 0.0
        bounce_rate = round(float(day_sess["is_bounce"].mean()) * 100, 2) if total_sessions else 0.0

        records.append(
            {
                "date": d,
                "dimension": "overall",
                "key": "all",
                "dau": dau,
                "loggedInDau": logged_in_dau,
                "anonymousDau": anon_dau,
                "wau": wau,
                "mau": mau,
                "newUsers": new_users,
                "returningUsers": returning_users,
                "sessions": total_sessions,
                "pageViews": total_pv,
                "pagesPerSession": pages_per_session,
                "avgDurationSec": avg_duration_sec,
                "bounceRate": bounce_rate,
                "hasSynthetic": bool(has_synthetic),
            }
        )

        # Phân theo thiết bị
        for dev, grp in day_sess.groupby("device"):
            records.append(
                {
                    "date": d,
                    "dimension": "device",
                    "key": str(dev or "desktop"),
                    "sessions": int(len(grp)),
                    "users": int(grp["actor_id"].nunique()),
                    "hasSynthetic": bool(has_synthetic),
                }
            )

        # Phân theo nguồn truy cập
        for src, grp in day_sess.groupby("source"):
            records.append(
                {
                    "date": d,
                    "dimension": "source",
                    "key": str(src or "direct"),
                    "sessions": int(len(grp)),
                    "users": int(grp["actor_id"].nunique()),
                    "hasSynthetic": bool(has_synthetic),
                }
            )

    return records
