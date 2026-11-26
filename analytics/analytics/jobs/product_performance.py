from collections import defaultdict
from typing import Any, Dict, List, Tuple
import pandas as pd


def compute(
    df_sessions: pd.DataFrame,
    df_posts: pd.DataFrame,
    df_orders: pd.DataFrame,
    has_synthetic: bool = False,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Tính hiệu quả sản phẩm theo ngày (`analytics_products`) và tổng kỳ 7/30/90 ngày (`analytics_products_summary`),
    kèm cờ 'Xem nhiều – ít mua', 'Tiềm năng' và so sánh giá với trung vị danh mục (`priceVsCategory`).
    """
    if df_sessions is None or df_sessions.empty:
        return [], []

    post_meta: Dict[str, Dict[str, Any]] = {}
    cat_prices: Dict[str, List[float]] = defaultdict(list)
    if df_posts is not None and not df_posts.empty:
        for _, p in df_posts.iterrows():
            pid = str(p.get("_id"))
            cat = str(p.get("category") or "Khác")
            price = float(p.get("price") or 0.0)
            seller_id = str(p.get("sellerId") or p.get("author") or "")
            title = str(p.get("title") or p.get("name") or "Sản phẩm")
            post_meta[pid] = {
                "title": title,
                "category": cat,
                "price": price,
                "sellerId": seller_id,
            }
            if price > 0:
                cat_prices[cat].append(price)

    cat_median_price = {
        cat: float(pd.Series(prices).median()) for cat, prices in cat_prices.items() if prices
    }

    # Đếm đơn theo productId từ orders.orderItems / orders.items (theo ngày)
    order_counts_by_day_prod: Dict[Tuple[str, str], int] = defaultdict(int)
    if df_orders is not None and not df_orders.empty:
        for _, o in df_orders.iterrows():
            if o.get("status") in ("Cancelled", "Đã hủy"):
                continue
            created = pd.to_datetime(o.get("createdAt"), utc=True, errors="coerce")
            if pd.isna(created):
                continue
            d_str = created.tz_convert("Asia/Ho_Chi_Minh").strftime("%Y-%m-%d")
            items = o.get("orderItems") if isinstance(o.get("orderItems"), list) and o.get("orderItems") else o.get("items")
            if isinstance(items, list):
                for it in items:
                    if isinstance(it, dict):
                        pid = str(it.get("productId") or it.get("_id") or "")
                    else:
                        pid = str(it or "")
                    if pid:
                        order_counts_by_day_prod[(d_str, pid)] += 1

    # Nếu chưa có orders thật nhiều, fallback đếm từ product_view -> add_to_cart / order_placed trong cùng phiên
    daily_stats: Dict[Tuple[str, str], Dict[str, Any]] = {}

    def _ensure(d_str: str, pid: str) -> Dict[str, Any]:
        key = (d_str, pid)
        if key not in daily_stats:
            meta = post_meta.get(pid, {})
            daily_stats[key] = {
                "date": d_str,
                "productId": pid,
                "title": meta.get("title", ""),
                "category": meta.get("category", "Khác"),
                "sellerId": meta.get("sellerId", ""),
                "price": meta.get("price", 0.0),
                "views": 0,
                "viewers": set(),
                "impressions": 0,
                "addToCart": 0,
                "favorites": 0,
                "orders": order_counts_by_day_prod.get((d_str, pid), 0),
                "hasSynthetic": bool(has_synthetic),
            }
        return daily_stats[key]

    for _, row in df_sessions.iterrows():
        d_str = str(row["date"])
        ev_name = row["name"]
        props = row.get("props") if isinstance(row.get("props"), dict) else {}

        if ev_name == "product_impression":
            pids = props.get("productIds") or []
            if isinstance(pids, list):
                for pid in pids:
                    if pid:
                        _ensure(d_str, str(pid))["impressions"] += 1
            continue

        pid = props.get("productId")
        if not pid:
            continue
        pid = str(pid)
        rec = _ensure(d_str, pid)
        if not rec["category"] and props.get("category"):
            rec["category"] = str(props["category"])
        if not rec["sellerId"] and props.get("sellerId"):
            rec["sellerId"] = str(props["sellerId"])
        if not rec["price"] and props.get("price"):
            rec["price"] = float(props["price"])

        if ev_name == "product_view":
            rec["views"] += 1
            rec["viewers"].add(row["actor_id"])
        elif ev_name == "add_to_cart":
            rec["addToCart"] += 1
        elif ev_name == "favorite_add":
            rec["favorites"] += 1

    # Bổ sung orders ước tính theo phiên nếu collection orders trống và có order_placed synthetic
    if not order_counts_by_day_prod:
        order_sids = set(df_sessions[df_sessions["name"] == "order_placed"]["effective_session_id"])
        if order_sids:
            cart_in_ordered = df_sessions[
                (df_sessions["name"] == "add_to_cart")
                & (df_sessions["effective_session_id"].isin(order_sids))
            ]
            for _, r in cart_in_ordered.iterrows():
                props = r.get("props") if isinstance(r.get("props"), dict) else {}
                pid = props.get("productId")
                if pid:
                    _ensure(str(r["date"]), str(pid))["orders"] += 1

    daily_records: List[Dict[str, Any]] = []
    for rec in daily_stats.values():
        views = rec["views"]
        impressions = rec["impressions"]
        atc = rec["addToCart"]
        orders = rec["orders"]
        daily_records.append(
            {
                "date": rec["date"],
                "productId": rec["productId"],
                "title": rec["title"],
                "category": rec["category"],
                "sellerId": rec["sellerId"],
                "price": rec["price"],
                "views": views,
                "uniqueViewers": len(rec["viewers"]),
                "impressions": impressions,
                "ctr": round(views / impressions, 4) if impressions > 0 else 0.0,
                "addToCart": atc,
                "cartRate": round(atc / views, 4) if views > 0 else 0.0,
                "orders": orders,
                "conversion": round(orders / views, 4) if views > 0 else 0.0,
                "favorites": rec["favorites"],
                "hasSynthetic": bool(has_synthetic),
            }
        )

    if not daily_records:
        return [], []

    df_d = pd.DataFrame(daily_records)
    max_date = pd.to_datetime(df_d["date"]).max()
    summary_records: List[Dict[str, Any]] = []

    for period_days in (7, 30, 90):
        start_str = (max_date - pd.Timedelta(days=period_days - 1)).strftime("%Y-%m-%d")
        sub = df_d[df_d["date"] >= start_str]
        if sub.empty:
            continue

        agg = sub.groupby("productId", as_index=False).agg(
            title=("title", "first"),
            category=("category", "first"),
            sellerId=("sellerId", "first"),
            price=("price", "first"),
            views=("views", "sum"),
            uniqueViewers=("uniqueViewers", "sum"),
            impressions=("impressions", "sum"),
            addToCart=("addToCart", "sum"),
            orders=("orders", "sum"),
            favorites=("favorites", "sum"),
        )
        agg["ctr"] = agg.apply(lambda r: round(r["views"] / r["impressions"], 4) if r["impressions"] > 0 else 0.0, axis=1)
        agg["cartRate"] = agg.apply(lambda r: round(r["addToCart"] / r["views"], 4) if r["views"] > 0 else 0.0, axis=1)
        agg["conversion"] = agg.apply(lambda r: round(r["orders"] / r["views"], 4) if r["views"] > 0 else 0.0, axis=1)

        cat_p75_views = agg.groupby("category")["views"].quantile(0.75).to_dict()
        cat_p25_views = agg.groupby("category")["views"].quantile(0.25).to_dict()
        cat_p75_conv = agg.groupby("category")["conversion"].quantile(0.75).to_dict()
        cat_p25_conv = agg.groupby("category")["conversion"].quantile(0.25).to_dict()

        for _, r in agg.iterrows():
            cat = r["category"] or "Khác"
            med_p = cat_median_price.get(cat, 0.0)
            price_vs_cat = round(r["price"] / med_p, 2) if med_p > 0 and r["price"] > 0 else None

            high_view_low_buy = bool(
                r["views"] >= cat_p75_views.get(cat, 0)
                and r["views"] > 0
                and r["conversion"] <= cat_p25_conv.get(cat, 0)
            )
            potential = bool(
                r["conversion"] >= cat_p75_conv.get(cat, 0)
                and r["conversion"] > 0
                and r["views"] <= cat_p25_views.get(cat, 0)
            )

            summary_records.append(
                {
                    "periodDays": period_days,
                    "productId": str(r["productId"]),
                    "title": str(r["title"]),
                    "category": str(cat),
                    "sellerId": str(r["sellerId"]),
                    "price": float(r["price"]),
                    "priceVsCategory": price_vs_cat,
                    "views": int(r["views"]),
                    "uniqueViewers": int(r["uniqueViewers"]),
                    "impressions": int(r["impressions"]),
                    "ctr": float(r["ctr"]),
                    "addToCart": int(r["addToCart"]),
                    "cartRate": float(r["cartRate"]),
                    "orders": int(r["orders"]),
                    "conversion": float(r["conversion"]),
                    "favorites": int(r["favorites"]),
                    "flagHighViewLowBuy": high_view_low_buy,
                    "flagPotential": potential,
                    "hasSynthetic": bool(has_synthetic),
                }
            )

    return daily_records, summary_records
