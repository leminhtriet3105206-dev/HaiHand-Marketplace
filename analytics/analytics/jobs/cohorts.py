from typing import Any, Dict, List
import pandas as pd


def compute(df_sessions: pd.DataFrame, has_synthetic: bool = False) -> List[Dict[str, Any]]:
    """
    Cohort giữ chân theo tuần (0..8):
    - Cohort = tuần đầu tiên thấy actor_id
    - Trả cả retention theo sự kiện (eventRetention) và theo đơn hàng (orderRetention).
    """
    if df_sessions is None or df_sessions.empty:
        return []

    df = df_sessions.copy()
    local_naive = df["ts_local"].dt.tz_localize(None)
    df["week_start"] = local_naive.dt.to_period("W-MON").apply(lambda p: p.start_time.strftime("%Y-%m-%d"))
    df["week_dt"] = pd.to_datetime(df["week_start"])

    first_week = df.groupby("actor_id")["week_dt"].min().rename("cohort_dt")
    df = df.merge(first_week, on="actor_id", how="left")
    df["cohortWeek"] = df["cohort_dt"].dt.strftime("%Y-%m-%d")
    df["weekOffset"] = ((df["week_dt"] - df["cohort_dt"]).dt.days // 7).astype(int)
    df = df[(df["weekOffset"] >= 0) & (df["weekOffset"] <= 8)]

    max_week_dt = df["week_dt"].max()
    cohort_sizes = df[df["weekOffset"] == 0].groupby("cohortWeek")["actor_id"].nunique().to_dict()

    records: List[Dict[str, Any]] = []
    for cohort_week, grp in df.groupby("cohortWeek"):
        size = int(cohort_sizes.get(cohort_week, 0))
        if size <= 0:
            continue
        c_dt = pd.to_datetime(cohort_week)
        max_possible_offset = int((max_week_dt - c_dt).days // 7)

        event_ret: Dict[str, Any] = {}
        order_ret: Dict[str, Any] = {}
        for w in range(9):
            if w > max_possible_offset:
                event_ret[str(w)] = None
                order_ret[str(w)] = None
                continue
            w_grp = grp[grp["weekOffset"] == w]
            ev_users = int(w_grp["actor_id"].nunique())
            ord_users = int(w_grp[w_grp["name"] == "order_placed"]["actor_id"].nunique())
            event_ret[str(w)] = round((ev_users / size) * 100, 2)
            order_ret[str(w)] = round((ord_users / size) * 100, 2)

        records.append(
            {
                "cohortWeek": cohort_week,
                "cohortSize": size,
                "eventRetention": event_ret,
                "orderRetention": order_ret,
                "hasSynthetic": bool(has_synthetic),
            }
        )

    return sorted(records, key=lambda r: r["cohortWeek"])
