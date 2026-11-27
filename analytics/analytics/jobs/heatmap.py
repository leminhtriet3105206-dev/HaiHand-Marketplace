from typing import Any, Dict, List
import pandas as pd


def compute(df_sessions: pd.DataFrame, period: str = "30d", has_synthetic: bool = False) -> List[Dict[str, Any]]:
    """
    Tính số phiên theo thứ trong tuần (0=Thứ 2 .. 6=Chủ nhật) × giờ (0..23) theo múi giờ Việt Nam.
    """
    if df_sessions is None or df_sessions.empty:
        return []

    sess_first = df_sessions.sort_values("ts_local").drop_duplicates("effective_session_id").copy()
    sess_first["weekday"] = sess_first["ts_local"].dt.weekday.astype(int)
    sess_first["hour"] = sess_first["ts_local"].dt.hour.astype(int)

    grouped = sess_first.groupby(["weekday", "hour"], as_index=False)["effective_session_id"].count()
    counts_map = {
        (int(r["weekday"]), int(r["hour"])): int(r["effective_session_id"])
        for _, r in grouped.iterrows()
    }

    records: List[Dict[str, Any]] = []
    for wd in range(7):
        for hr in range(24):
            records.append(
                {
                    "weekday": wd,
                    "hour": hr,
                    "period": period,
                    "sessions": counts_map.get((wd, hr), 0),
                    "hasSynthetic": bool(has_synthetic),
                }
            )
    return records
