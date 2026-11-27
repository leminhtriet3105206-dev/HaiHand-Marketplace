from datetime import datetime, timezone
from typing import Any, Dict, List, Tuple
import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
from sklearn.preprocessing import StandardScaler


def _score_quintile(series: pd.Series, reverse: bool = False) -> pd.Series:
    n = len(series)
    if n == 0:
        return pd.Series(dtype=int)
    if n < 5:
        ranked = series.rank(method="first", ascending=not reverse)
        return ((ranked - 1) * 4 // max(1, n - 1) + 1).astype(int).clip(1, 5)
    ranked = series.rank(method="first", ascending=True)
    bins = pd.qcut(ranked, q=5, labels=[5, 4, 3, 2, 1] if reverse else [1, 2, 3, 4, 5])
    return bins.astype(int)


def _rfm_label(r: int, f: int) -> str:
    if r >= 4 and f >= 4:
        return "Champions"
    if f >= 4:
        return "Khách trung thành"
    if r >= 4 and f <= 2:
        return "Tiềm năng"
    if r <= 2 and f >= 3:
        return "Có nguy cơ rời bỏ"
    if r <= 2 and f <= 2:
        return "Ngủ đông/Đã mất"
    return "Mới"


def _auto_cluster_name(row: Dict[str, float], global_medians: Dict[str, float]) -> str:
    if row["monetary"] >= global_medians["monetary"] * 1.5 and row["frequency"] >= global_medians["frequency"]:
        return "VIP mua nhiều & chi tiêu cao"
    if row["productViews"] >= global_medians["productViews"] * 1.3 and row["cartToOrderRate"] < max(0.2, global_medians["cartToOrderRate"]):
        return "Săn sale – xem nhiều, mua ít"
    if row["recencyDays"] <= 14 and row["frequency"] >= 2:
        return "Khách năng động gần đây"
    if row["recencyDays"] > 45:
        return "Ít tương tác / Cần kích hoạt lại"
    return "Khách hàng phổ thông"


def compute(
    df_sessions: pd.DataFrame,
    df_orders: pd.DataFrame,
    has_synthetic: bool = False,
    seed_rfm_from_events: bool = False,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Tính RFM từ `orders` (Completed hoặc đã thanh toán). Nếu đơn thật quá ít (<30 khách)
    và `seed_rfm_from_events=True`, cho phép fallback sang event `order_placed` synthetic.
    Chạy KMeans (k trong [3,6] theo silhouette) nếu có >= 30 khách.
    """
    now_utc = pd.Timestamp.now("UTC")
    orders_rows = []

    if df_orders is not None and not df_orders.empty:
        valid_statuses = {"Completed", "Hoàn thành", "Đã thanh toán cho người bán", "Delivered", "Shipped", "Processing"}
        o_df = df_orders.copy()
        status_ok = o_df.get("status", pd.Series([""] * len(o_df))).isin(valid_statuses)
        pay_ok = o_df.get("paymentStatus", pd.Series([""] * len(o_df))).isin(["escrow", "released", "paid"])
        o_df = o_df[status_ok | pay_ok].copy()
        if not o_df.empty:
            o_df["uid"] = o_df.apply(
                lambda r: str(r.get("buyerId") or r.get("buyer") or ""), axis=1
            )
            o_df = o_df[o_df["uid"].str.len() > 0]
            o_df["created"] = pd.to_datetime(o_df.get("createdAt"), utc=True, errors="coerce").fillna(now_utc)
            o_df["amount"] = pd.to_numeric(o_df.get("totalPrice", 0), errors="coerce").fillna(0.0)
            orders_rows = o_df[["uid", "created", "amount"]].to_dict("records")

    used_synthetic_orders = False
    unique_real_buyers = len({r["uid"] for r in orders_rows})

    if unique_real_buyers < 30 and seed_rfm_from_events and df_sessions is not None and not df_sessions.empty:
        ev_orders = df_sessions[df_sessions["name"] == "order_placed"].copy()
        if not ev_orders.empty:
            used_synthetic_orders = True
            for _, r in ev_orders.iterrows():
                uid = str(r.get("userId") or r.get("anonymousId") or "")
                if not uid:
                    continue
                props = r.get("props") if isinstance(r.get("props"), dict) else {}
                orders_rows.append(
                    {
                        "uid": uid,
                        "created": r["ts_utc"],
                        "amount": float(props.get("value") or 0.0),
                    }
                )

    if not orders_rows:
        return [], []

    odf = pd.DataFrame(orders_rows)
    rfm = odf.groupby("uid", as_index=False).agg(
        last_order=("created", "max"),
        frequency=("amount", "count"),
        monetary=("amount", "sum"),
    )
    rfm["recencyDays"] = ((now_utc - rfm["last_order"]).dt.total_seconds() / 86400.0).clip(lower=0).round(1)
    rfm["rfm_r"] = _score_quintile(rfm["recencyDays"], reverse=True)
    rfm["rfm_f"] = _score_quintile(rfm["frequency"], reverse=False)
    rfm["rfm_m"] = _score_quintile(rfm["monetary"], reverse=False)
    rfm["rfm_label"] = rfm.apply(lambda r: _rfm_label(int(r["rfm_r"]), int(r["rfm_f"])), axis=1)

    # Bổ sung đặc trưng hành vi từ df_sessions
    beh_map: Dict[str, Dict[str, float]] = {}
    if df_sessions is not None and not df_sessions.empty:
        ev = df_sessions.copy()
        ev["uid_key"] = ev.apply(
            lambda r: str(r.get("userId")) if pd.notna(r.get("userId")) and str(r.get("userId")) not in ("", "None", "nan")
            else str(r.get("anonymousId") or ""),
            axis=1,
        )
        ev["hour_local"] = ev["ts_local"].dt.hour
        for uid, grp in ev.groupby("uid_key"):
            pv = int((grp["name"] == "product_view").sum())
            atc = int((grp["name"] == "add_to_cart").sum())
            ord_cnt = int((grp["name"] == "order_placed").sum())
            beh_map[uid] = {
                "sessions30d": float(grp["effective_session_id"].nunique()),
                "productViews": float(pv),
                "cartToOrderRate": float(ord_cnt / atc) if atc > 0 else 0.0,
                "medianHour": float(grp["hour_local"].median()) if len(grp) > 0 else 12.0,
            }

    rfm["sessions30d"] = rfm["uid"].map(lambda u: beh_map.get(u, {}).get("sessions30d", 1.0))
    rfm["productViews"] = rfm["uid"].map(lambda u: beh_map.get(u, {}).get("productViews", 0.0))
    rfm["cartToOrderRate"] = rfm["uid"].map(lambda u: beh_map.get(u, {}).get("cartToOrderRate", 0.0))
    rfm["medianHour"] = rfm["uid"].map(lambda u: beh_map.get(u, {}).get("medianHour", 12.0))

    cluster_profiles: List[Dict[str, Any]] = []
    if len(rfm) >= 30:
        features = np.column_stack(
            [
                np.log1p(rfm["recencyDays"].values),
                np.log1p(rfm["frequency"].values),
                np.log1p(rfm["monetary"].values),
                np.log1p(rfm["sessions30d"].values),
                np.log1p(rfm["productViews"].values),
                rfm["cartToOrderRate"].values,
                rfm["medianHour"].values / 24.0,
            ]
        )
        scaler = StandardScaler()
        X = scaler.fit_transform(features)

        best_k = 3
        best_score = -1.0
        best_labels = None
        max_k = min(6, len(rfm) - 1)
        for k in range(3, max_k + 1):
            km = KMeans(n_clusters=k, random_state=42, n_init=10)
            labels = km.fit_predict(X)
            if len(set(labels)) < 2:
                continue
            sc = silhouette_score(X, labels)
            if sc > best_score:
                best_score = sc
                best_k = k
                best_labels = labels

        if best_labels is not None:
            rfm["cluster"] = best_labels.astype(int)
            global_medians = {
                "monetary": float(rfm["monetary"].median()),
                "frequency": float(rfm["frequency"].median()),
                "productViews": float(rfm["productViews"].median()),
                "cartToOrderRate": float(rfm["cartToOrderRate"].median()),
            }
            name_map = {}
            for cid, cgrp in rfm.groupby("cluster"):
                med = {
                    "recencyDays": round(float(cgrp["recencyDays"].median()), 1),
                    "frequency": round(float(cgrp["frequency"].median()), 1),
                    "monetary": round(float(cgrp["monetary"].median()), 0),
                    "productViews": round(float(cgrp["productViews"].median()), 1),
                    "cartToOrderRate": round(float(cgrp["cartToOrderRate"].median()), 2),
                }
                cname = _auto_cluster_name(med, global_medians)
                name_map[int(cid)] = cname
                cluster_profiles.append(
                    {
                        "cluster": int(cid),
                        "clusterName": cname,
                        "customerCount": int(len(cgrp)),
                        "silhouette": round(float(best_score), 4),
                        "k": int(best_k),
                        **med,
                        "hasSynthetic": bool(has_synthetic or used_synthetic_orders),
                        "updatedAt": datetime.utcnow(),
                    }
                )
            rfm["clusterName"] = rfm["cluster"].map(name_map)
        else:
            rfm["cluster"] = -1
            rfm["clusterName"] = "Chưa phân cụm"
    else:
        rfm["cluster"] = -1
        rfm["clusterName"] = "Chưa đủ dữ liệu KMeans (<30 khách)"

    now_dt = datetime.now(timezone.utc)
    segments_out: List[Dict[str, Any]] = []
    for _, r in rfm.iterrows():
        segments_out.append(
            {
                "userId": str(r["uid"]),
                "recencyDays": float(r["recencyDays"]),
                "frequency": int(r["frequency"]),
                "monetary": float(r["monetary"]),
                "lastOrderAt": r["last_order"].to_pydatetime() if hasattr(r["last_order"], "to_pydatetime") else now_dt,
                "rfm_r": int(r["rfm_r"]),
                "rfm_f": int(r["rfm_f"]),
                "rfm_m": int(r["rfm_m"]),
                "rfm_label": str(r["rfm_label"]),
                "cluster": int(r["cluster"]),
                "clusterName": str(r["clusterName"]),
                "hasSynthetic": bool(has_synthetic or used_synthetic_orders),
                "updatedAt": now_dt,
            }
        )

    return segments_out, cluster_profiles
