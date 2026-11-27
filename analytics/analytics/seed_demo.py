import argparse
import random
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List
from bson import ObjectId

from .config import load_config
from .db import get_databases


DEVICES = [("mobile", 0.60), ("desktop", 0.33), ("tablet", 0.07)]
SOURCES = [("direct", 0.35), ("facebook", 0.30), ("google", 0.25), ("zalo", 0.10)]
SEARCH_QUERIES_OK = [
    "iphone cu",
    "ao khoac",
    "ban phim co",
    "tai nghe bluetooth",
    "sach lap trinh",
    "giay sneaker",
    "laptop van phong",
]
SEARCH_QUERIES_ZERO = [
    "iphone 20 pro",
    "ao khoac long vu cu size xs",
    "macbook m9 ultra",
]


def _weighted_choice(rng: random.Random, choices: List[tuple]) -> str:
    r = rng.random()
    acc = 0.0
    for val, w in choices:
        acc += w
        if r <= acc:
            return val
    return choices[0][0]


def purge_synthetic(write_db: Any) -> Dict[str, int]:
    """Xóa toàn bộ event synthetic và dữ liệu tổng hợp gắn cờ hasSynthetic."""
    collections = [
        "analytics_events",
        "analytics_daily",
        "analytics_funnel",
        "analytics_segments",
        "analytics_cluster_profiles",
        "analytics_cohorts",
        "analytics_products",
        "analytics_products_summary",
        "analytics_search",
        "analytics_heatmap",
        "analytics_related_products",
    ]
    deleted = {}
    for col in collections:
        filt = {"synthetic": True} if col == "analytics_events" else {"hasSynthetic": True}
        res = write_db[col].delete_many(filt)
        deleted[col] = int(res.deleted_count)
    return deleted


def generate_synthetic_events(
    read_db: Any,
    write_db: Any,
    days: int = 60,
    sessions_per_day: int = 400,
    seed: int = 42,
) -> int:
    """
    Sinh dữ liệu hành vi mô phỏng (`synthetic: True`) dựa trên `users` & `posts` thật nếu có.
    KHÔNG ghi vào `users`, `posts`, `orders`.
    """
    rng = random.Random(seed)

    users = list(read_db["users"].find({"role": {"$ne": "Admin"}}, {"_id": 1}).limit(200))
    posts = list(
        read_db["posts"].find(
            {"status": {"$in": ["active", "APPROVED"]}},
            {"_id": 1, "category": 1, "price": 1, "sellerId": 1, "author": 1},
        ).limit(200)
    )

    if not users:
        users = [{"_id": ObjectId()} for _ in range(60)]
    if not posts:
        cats = ["Đồ điện tử & Công nghệ", "Thời trang & Phụ kiện", "Sách & Văn phòng phẩm", "Đồ gia dụng & Đời sống"]
        posts = [
            {
                "_id": ObjectId(),
                "category": cats[i % len(cats)],
                "price": float(100000 + (i % 10) * 150000),
                "sellerId": ObjectId(),
            }
            for i in range(40)
        ]

    # Tính trung vị giá theo danh mục để sản phẩm giá cao hơn trung vị có conversion thấp hơn
    cat_prices: Dict[str, List[float]] = {}
    for p in posts:
        c = p.get("category") or "Khác"
        cat_prices.setdefault(c, []).append(float(p.get("price") or 100000))
    cat_med = {c: sorted(v)[len(v) // 2] for c, v in cat_prices.items()}

    # Phân nhóm người dùng: 20% săn sale (xem nhiều, ít mua), 25% trung thành, 55% bình thường
    user_pool = []
    for idx, u in enumerate(users):
        uid = u["_id"]
        anon = f"anon_demo_{idx:04d}"
        if idx % 5 == 0:
            archetype = "bargain_hunter"
        elif idx % 4 == 0:
            archetype = "loyal"
        else:
            archetype = "regular"
        user_pool.append((uid, anon, archetype))

    now_utc = datetime.now(timezone.utc)
    # Giờ cao điểm 20-22h VN (tức 13-15h UTC), kèm trọng số ngày
    hour_weights = [1 if h < 7 else (3 if 13 <= h <= 15 else 2) for h in range(24)]

    total_inserted = 0
    batch: List[Dict[str, Any]] = []

    for d_off in range(days - 1, -1, -1):
        day_base = (now_utc - timedelta(days=d_off)).replace(hour=0, minute=0, second=0, microsecond=0)
        is_weekend = day_base.weekday() >= 5
        n_sess = int(sessions_per_day * (1.2 if is_weekend else 0.95))

        for _ in range(n_sess):
            uid, anon_id, archetype = rng.choice(user_pool)
            is_logged_in = rng.random() < (0.85 if archetype == "loyal" else 0.65)
            user_val = uid if is_logged_in else None

            sid = f"demo_sess_{uuid.uuid4().hex[:16]}"
            device = _weighted_choice(rng, DEVICES)
            source = _weighted_choice(rng, SOURCES)
            hour_utc = rng.choices(range(24), weights=hour_weights, k=1)[0]
            ts = day_base + timedelta(hours=hour_utc, minutes=rng.randint(0, 59), seconds=rng.randint(0, 59))

            def _make_ev(name: str, t: datetime, props: Dict[str, Any], path: str = "/") -> Dict[str, Any]:
                return {
                    "eventId": str(uuid.uuid4()),
                    "name": name,
                    "ts": t,
                    "receivedAt": t,
                    "anonymousId": anon_id,
                    "sessionId": sid,
                    "userId": user_val,
                    "props": props,
                    "context": {
                        "path": path,
                        "device": device,
                        "browser": "Chrome",
                        "os": "Android" if device == "mobile" else "Windows",
                        "locale": "vi-VN",
                        "viewport": "390x844" if device == "mobile" else "1440x900",
                        "area": "buyer",
                    },
                    "synthetic": True,
                }

            pv_props = {"path": "/", "title": "HaiHand Marketplace"}
            if source != "direct":
                pv_props["utm_source"] = source
            batch.append(_make_ev("page_view", ts, pv_props, "/"))

            # Bounce (~20%)
            if rng.random() < 0.20:
                continue

            # Search (~35% phiên)
            if rng.random() < 0.35:
                is_zero = rng.random() < 0.08
                q = rng.choice(SEARCH_QUERIES_ZERO if is_zero else SEARCH_QUERIES_OK)
                rc = 0 if is_zero else rng.randint(3, 25)
                batch.append(_make_ev("search", ts + timedelta(seconds=15), {"query": q, "resultCount": rc}, "/products"))
                if not is_zero and rng.random() < 0.55:
                    clicked = rng.choice(posts)
                    batch.append(
                        _make_ev(
                            "search_result_click",
                            ts + timedelta(seconds=25),
                            {"query": q, "productId": str(clicked["_id"]), "position": rng.randint(0, 5)},
                            "/products",
                        )
                    )

            # Product impressions + views
            imp_posts = rng.sample(posts, k=min(6, len(posts)))
            batch.append(
                _make_ev(
                    "product_impression",
                    ts + timedelta(seconds=20),
                    {"productIds": [str(x["_id"]) for x in imp_posts], "list": "home"},
                    "/",
                )
            )

            n_views = rng.randint(3, 6) if archetype == "bargain_hunter" else rng.randint(1, 3)
            viewed_posts = rng.sample(posts, k=min(n_views, len(posts)))
            for idx_v, vp in enumerate(viewed_posts):
                t_v = ts + timedelta(seconds=35 + idx_v * 25)
                seller_id = vp.get("sellerId") or vp.get("author")
                batch.append(
                    _make_ev(
                        "product_view",
                        t_v,
                        {
                            "productId": str(vp["_id"]),
                            "sellerId": str(seller_id) if seller_id else None,
                            "category": vp.get("category") or "Khác",
                            "price": float(vp.get("price") or 100000),
                            "fromList": "home",
                            "position": idx_v,
                        },
                        f"/post/{vp['_id']}",
                    )
                )

            primary = viewed_posts[0]
            p_cat = primary.get("category") or "Khác"
            p_price = float(primary.get("price") or 100000)
            med_price = cat_med.get(p_cat, p_price)
            price_penalty = 0.6 if p_price > med_price * 1.25 else 1.0

            atc_prob = 0.12 * price_penalty * (0.4 if archetype == "bargain_hunter" else (1.4 if archetype == "loyal" else 1.0))
            if rng.random() < atc_prob:
                t_atc = ts + timedelta(seconds=120)
                seller_id = primary.get("sellerId") or primary.get("author")
                batch.append(
                    _make_ev(
                        "add_to_cart",
                        t_atc,
                        {
                            "productId": str(primary["_id"]),
                            "sellerId": str(seller_id) if seller_id else None,
                            "quantity": 1,
                            "price": p_price,
                        },
                        f"/post/{primary['_id']}",
                    )
                )

                if rng.random() < 0.55:
                    t_chk = t_atc + timedelta(seconds=45)
                    batch.append(
                        _make_ev("checkout_start", t_chk, {"itemCount": 1, "cartValue": p_price}, "/checkout")
                    )

                    if rng.random() < 0.70:
                        t_ord = t_chk + timedelta(seconds=40)
                        oid = str(ObjectId())
                        method = rng.choice(["COD", "VNPAY", "HAIPAY"])
                        batch.append(
                            _make_ev(
                                "order_placed",
                                t_ord,
                                {
                                    "orderId": oid,
                                    "sellerId": str(seller_id) if seller_id else None,
                                    "value": p_price,
                                    "itemCount": 1,
                                    "paymentMethod": method,
                                },
                                "/checkout",
                            )
                        )
                        if rng.random() < 0.92:
                            batch.append(
                                _make_ev(
                                    "payment_success",
                                    t_ord + timedelta(seconds=20),
                                    {"orderId": oid, "method": method},
                                    "/checkout",
                                )
                            )

            if len(batch) >= 1000:
                write_db["analytics_events"].insert_many(batch, ordered=False)
                total_inserted += len(batch)
                batch = []

    if batch:
        write_db["analytics_events"].insert_many(batch, ordered=False)
        total_inserted += len(batch)

    return total_inserted


def main():
    parser = argparse.ArgumentParser(description="Sinh dữ liệu demo Product Analytics")
    parser.add_argument("--days", type=int, default=60)
    parser.add_argument("--sessions-per-day", type=int, default=400)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--purge-synthetic", action="store_true")
    args = parser.parse_args()

    cfg = load_config()
    read_db, write_db = get_databases(cfg.read_uri, cfg.write_uri, cfg.db_name)

    if args.purge_synthetic:
        res = purge_synthetic(write_db)
        print("Purged synthetic records:", res)
        return

    count = generate_synthetic_events(
        read_db,
        write_db,
        days=args.days,
        sessions_per_day=args.sessions_per_day,
        seed=args.seed,
    )
    print(f"Inserted {count} synthetic events.")


if __name__ == "__main__":
    main()
