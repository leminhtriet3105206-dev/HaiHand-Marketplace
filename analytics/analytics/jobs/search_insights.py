import re
from collections import defaultdict
from typing import Any, Dict, List, Tuple
import pandas as pd


def _normalize_query(q: Any) -> str:
    if not isinstance(q, str):
        return ""
    return re.sub(r"\s+", " ", q.strip().lower())


def compute(df_sessions: pd.DataFrame, has_synthetic: bool = False) -> List[Dict[str, Any]]:
    if df_sessions is None or df_sessions.empty:
        return []

    searches = df_sessions[df_sessions["name"] == "search"].copy()
    if searches.empty:
        return []

    clicks = df_sessions[df_sessions["name"] == "search_result_click"].copy()
    orders = df_sessions[df_sessions["name"] == "order_placed"].copy()
    order_sids = set(orders["effective_session_id"])

    click_keys = set()
    for _, c in clicks.iterrows():
        props = c.get("props") if isinstance(c.get("props"), dict) else {}
        q = _normalize_query(props.get("query"))
        if q:
            click_keys.add((str(c["date"]), str(c["effective_session_id"]), q))

    stats: Dict[Tuple[str, str], Dict[str, Any]] = defaultdict(
        lambda: {"count": 0, "clicks": 0, "zeroResults": 0, "conversions": 0}
    )

    for _, r in searches.iterrows():
        props = r.get("props") if isinstance(r.get("props"), dict) else {}
        q = _normalize_query(props.get("query"))
        if not q:
            continue
        d_str = str(r["date"])
        sid = str(r["effective_session_id"])
        rec = stats[(d_str, q)]
        rec["count"] += 1

        rc = props.get("resultCount")
        if rc is not None and int(rc) == 0:
            rec["zeroResults"] += 1
        if (d_str, sid, q) in click_keys:
            rec["clicks"] += 1
        if sid in order_sids:
            rec["conversions"] += 1

    out: List[Dict[str, Any]] = []
    for (d_str, q), rec in stats.items():
        cnt = rec["count"]
        out.append(
            {
                "date": d_str,
                "query": q,
                "count": cnt,
                "clicks": rec["clicks"],
                "ctr": round((rec["clicks"] / cnt) * 100, 2) if cnt > 0 else 0.0,
                "zeroResults": rec["zeroResults"],
                "zeroResultRate": round((rec["zeroResults"] / cnt) * 100, 2) if cnt > 0 else 0.0,
                "conversions": rec["conversions"],
                "conversionRate": round((rec["conversions"] / cnt) * 100, 2) if cnt > 0 else 0.0,
                "hasSynthetic": bool(has_synthetic),
            }
        )

    return out
