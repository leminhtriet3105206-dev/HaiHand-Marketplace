from collections import defaultdict
from itertools import combinations
from typing import Any, Dict, List
import pandas as pd


def compute(df_sessions: pd.DataFrame, has_synthetic: bool = False) -> List[Dict[str, Any]]:
    """
    Đồng xuất hiện sản phẩm trong cùng phiên ("Người xem A cũng xem B"), top 8 mỗi sản phẩm.
    """
    if df_sessions is None or df_sessions.empty:
        return []

    views = df_sessions[df_sessions["name"] == "product_view"].copy()
    if views.empty:
        return []

    views["pid"] = views["props"].apply(lambda p: str(p.get("productId")) if isinstance(p, dict) and p.get("productId") else "")
    views = views[views["pid"].str.len() > 0]
    if views.empty:
        return []

    prod_sessions = defaultdict(set)
    co_counts = defaultdict(int)

    for sid, grp in views.groupby("effective_session_id"):
        pids = sorted(set(grp["pid"].tolist()))
        for p in pids:
            prod_sessions[p].add(sid)
        if len(pids) >= 2:
            for a, b in combinations(pids[:20], 2):
                co_counts[(a, b)] += 1
                co_counts[(b, a)] += 1

    neighbors: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for (a, b), cnt in co_counts.items():
        union_len = len(prod_sessions[a] | prod_sessions[b])
        jaccard = round(cnt / union_len, 4) if union_len > 0 else 0.0
        neighbors[a].append({"productId": b, "coViews": cnt, "jaccard": jaccard})

    out: List[Dict[str, Any]] = []
    for pid, items in neighbors.items():
        items.sort(key=lambda x: (x["coViews"], x["jaccard"]), reverse=True)
        out.append(
            {
                "productId": pid,
                "related": items[:8],
                "hasSynthetic": bool(has_synthetic),
            }
        )
    return out
