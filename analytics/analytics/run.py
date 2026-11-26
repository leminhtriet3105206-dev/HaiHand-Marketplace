import argparse
import time
from datetime import datetime, timedelta, timezone
from typing import Any, List, Optional
import pytz

from .config import load_config
from .db import (
    get_databases,
    read_events_df,
    read_collection_df,
    upsert_records,
    log_analytics_run,
)
from .sessions import build_sessions
from .jobs import (
    daily_metrics,
    funnel,
    rfm_segments,
    cohorts,
    product_performance,
    search_insights,
    heatmap,
    related_products,
)


def parse_since(since_str: str) -> datetime:
    s = (since_str or "30d").strip().lower()
    now = datetime.now(timezone.utc)
    if s.endswith("d") and s[:-1].isdigit():
        return now - timedelta(days=int(s[:-1]))
    if s.endswith("h") and s[:-1].isdigit():
        return now - timedelta(hours=int(s[:-1]))
    try:
        dt = datetime.fromisoformat(s)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        return now - timedelta(days=30)


def run_jobs(
    read_db: Any,
    write_db: Any,
    job_names: List[str],
    since: datetime,
    until: datetime,
    tz_name: str = "Asia/Ho_Chi_Minh",
    include_synthetic: Optional[bool] = None,
    seed_rfm_from_events: bool = False,
) -> dict:
    all_jobs = [
        "daily_metrics",
        "funnel",
        "rfm_segments",
        "cohorts",
        "product_performance",
        "search_insights",
        "heatmap",
        "related_products",
    ]
    selected = all_jobs if "all" in job_names else [j for j in job_names if j in all_jobs]

    df_events = read_events_df(read_db, since, until, include_synthetic=include_synthetic)
    has_synthetic = bool(
        not df_events.empty
        and "synthetic" in df_events.columns
        and df_events["synthetic"].fillna(False).astype(bool).any()
    )
    df_sessions = build_sessions(df_events, tz_name=tz_name)
    rows_read = len(df_events)

    df_orders = None
    df_posts = None
    if "rfm_segments" in selected or "product_performance" in selected:
        df_orders = read_collection_df(read_db, "orders")
    if "product_performance" in selected:
        df_posts = read_collection_df(
            read_db,
            "posts",
            projection={"_id": 1, "title": 1, "name": 1, "category": 1, "price": 1, "sellerId": 1, "author": 1},
        )

    summary = {"rowsRead": rows_read, "hasSynthetic": has_synthetic, "jobs": {}}

    for job in selected:
        t0 = time.monotonic()
        written = 0
        err_msg = None
        try:
            if job == "daily_metrics":
                recs = daily_metrics.compute(df_sessions, has_synthetic=has_synthetic)
                written = upsert_records(
                    write_db,
                    "analytics_daily",
                    recs,
                    ["date", "dimension", "key"],
                    indexes=[[("date", -1), ("dimension", 1), ("key", 1)]],
                )
            elif job == "funnel":
                recs = funnel.compute(df_sessions, has_synthetic=has_synthetic)
                written = upsert_records(
                    write_db,
                    "analytics_funnel",
                    recs,
                    ["date", "segment"],
                    indexes=[[("date", -1), ("segment", 1)]],
                )
            elif job == "rfm_segments":
                segs, profiles = rfm_segments.compute(
                    df_sessions,
                    df_orders,
                    has_synthetic=has_synthetic,
                    seed_rfm_from_events=seed_rfm_from_events,
                )
                w1 = upsert_records(
                    write_db,
                    "analytics_segments",
                    segs,
                    ["userId"],
                    indexes=[[("rfm_label", 1)], [("cluster", 1)], [("monetary", -1)]],
                )
                w2 = upsert_records(
                    write_db,
                    "analytics_cluster_profiles",
                    profiles,
                    ["cluster"],
                    indexes=[[("cluster", 1)]],
                )
                written = w1 + w2
            elif job == "cohorts":
                recs = cohorts.compute(df_sessions, has_synthetic=has_synthetic)
                written = upsert_records(
                    write_db,
                    "analytics_cohorts",
                    recs,
                    ["cohortWeek"],
                    indexes=[[("cohortWeek", 1)]],
                )
            elif job == "product_performance":
                daily_recs, sum_recs = product_performance.compute(
                    df_sessions, df_posts, df_orders, has_synthetic=has_synthetic
                )
                w1 = upsert_records(
                    write_db,
                    "analytics_products",
                    daily_recs,
                    ["date", "productId"],
                    indexes=[[("date", -1), ("productId", 1)], [("sellerId", 1), ("date", -1)]],
                )
                w2 = upsert_records(
                    write_db,
                    "analytics_products_summary",
                    sum_recs,
                    ["periodDays", "productId"],
                    indexes=[[("periodDays", 1), ("views", -1)], [("sellerId", 1), ("periodDays", 1)]],
                )
                written = w1 + w2
            elif job == "search_insights":
                recs = search_insights.compute(df_sessions, has_synthetic=has_synthetic)
                written = upsert_records(
                    write_db,
                    "analytics_search",
                    recs,
                    ["date", "query"],
                    indexes=[[("date", -1), ("count", -1)]],
                )
            elif job == "heatmap":
                recs = heatmap.compute(df_sessions, period="30d", has_synthetic=has_synthetic)
                written = upsert_records(
                    write_db,
                    "analytics_heatmap",
                    recs,
                    ["weekday", "hour", "period"],
                    indexes=[[("period", 1), ("weekday", 1), ("hour", 1)]],
                )
            elif job == "related_products":
                recs = related_products.compute(df_sessions, has_synthetic=has_synthetic)
                written = upsert_records(
                    write_db,
                    "analytics_related_products",
                    recs,
                    ["productId"],
                    indexes=[[("productId", 1)]],
                )
        except Exception as exc:
            err_msg = str(exc)

        duration_ms = int((time.monotonic() - t0) * 1000)
        log_analytics_run(
            write_db,
            job=job,
            since=since,
            until=until,
            rows_read=rows_read,
            rows_written=written,
            duration_ms=duration_ms,
            has_synthetic=has_synthetic,
            error=err_msg,
        )
        summary["jobs"][job] = {"rowsWritten": written, "durationMs": duration_ms, "error": err_msg}

    return summary


def main():
    parser = argparse.ArgumentParser(description="Chạy job tổng hợp HaiHand Product Analytics")
    parser.add_argument("--job", default="all", help="Tên job hoặc danh sách cách nhau bởi dấu phẩy, hoặc 'all'")
    parser.add_argument("--since", default="30d", help="Khoảng thời gian lùi (vd: 2d, 30d, 90d, ISO date)")
    parser.add_argument("--tz", default=None, help="Múi giờ (mặc định Asia/Ho_Chi_Minh)")
    parser.add_argument("--include-synthetic", action="store_true", help="Luôn bao gồm dữ liệu synthetic")
    parser.add_argument("--seed-rfm-from-events", action="store_true", help="Dùng order_placed synthetic cho RFM nếu đơn thật < 30 khách")
    args = parser.parse_args()

    cfg = load_config()
    tz_name = args.tz or cfg.tz_name
    pytz.timezone(tz_name)  # validate timezone

    read_db, write_db = get_databases(cfg.read_uri, cfg.write_uri, cfg.db_name)
    since = parse_since(args.since)
    until = datetime.now(timezone.utc)
    job_list = [j.strip() for j in args.job.split(",") if j.strip()]

    res = run_jobs(
        read_db,
        write_db,
        job_list,
        since,
        until,
        tz_name=tz_name,
        include_synthetic=True if args.include_synthetic else None,
        seed_rfm_from_events=args.seed_rfm_from_events,
    )
    print("Analytics run completed:", res)


if __name__ == "__main__":
    main()
