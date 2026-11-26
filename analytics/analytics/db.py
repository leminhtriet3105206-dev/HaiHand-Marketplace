from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import pandas as pd
from pymongo import MongoClient, UpdateOne


def get_databases(read_uri: str, write_uri: str, db_name: str):
    read_client = MongoClient(read_uri)
    write_client = read_client if write_uri == read_uri else MongoClient(write_uri)
    return read_client[db_name], write_client[db_name]


def read_events_df(
    read_db: Any,
    since: datetime,
    until: datetime,
    include_synthetic: Optional[bool] = None,
) -> pd.DataFrame:
    query: Dict[str, Any] = {"ts": {"$gte": since, "$lte": until}}
    if include_synthetic is False:
        query["synthetic"] = {"$ne": True}
    elif include_synthetic is True:
        pass
    else:
        # Mặc định: dùng dữ liệu thật nếu có; nếu chưa có dữ liệu thật thì tự động bao gồm synthetic
        real_count = read_db["analytics_events"].count_documents(
            {"ts": {"$gte": since, "$lte": until}, "synthetic": {"$ne": True}},
            limit=1,
        )
        if real_count > 0:
            query["synthetic"] = {"$ne": True}

    cursor = read_db["analytics_events"].find(query)
    rows = list(cursor)
    if not rows:
        return pd.DataFrame()
    return pd.DataFrame(rows)


def read_collection_df(read_db: Any, collection_name: str, query: Optional[Dict[str, Any]] = None, projection: Optional[Dict[str, int]] = None) -> pd.DataFrame:
    rows = list(read_db[collection_name].find(query or {}, projection))
    if not rows:
        return pd.DataFrame()
    return pd.DataFrame(rows)


def upsert_records(
    write_db: Any,
    collection_name: str,
    records: List[Dict[str, Any]],
    key_fields: List[str],
    indexes: Optional[List[Any]] = None,
) -> int:
    if indexes:
        for idx_spec in indexes:
            try:
                write_db[collection_name].create_index(idx_spec)
            except Exception:
                pass

    if not records:
        return 0

    ops = []
    for rec in records:
        filt = {k: rec[k] for k in key_fields}
        ops.append(UpdateOne(filt, {"$set": rec}, upsert=True))

    if not ops:
        return 0
    try:
        res = write_db[collection_name].bulk_write(ops, ordered=False)
        return int(res.upserted_count + res.modified_count + res.matched_count)
    except TypeError:
        # Fallback cho mongomock khi pymongo >= 4.11 truyền tham số `sort` vào bulk_write
        count = 0
        col = write_db[collection_name]
        for rec in records:
            filt = {k: rec[k] for k in key_fields}
            col.update_one(filt, {"$set": rec}, upsert=True)
            count += 1
        return count


def log_analytics_run(
    write_db: Any,
    job: str,
    since: datetime,
    until: datetime,
    rows_read: int,
    rows_written: int,
    duration_ms: int,
    has_synthetic: bool = False,
    error: Optional[str] = None,
) -> None:
    write_db["analytics_runs"].insert_one(
        {
            "job": job,
            "since": since,
            "until": until,
            "rowsRead": rows_read,
            "rowsWritten": rows_written,
            "durationMs": duration_ms,
            "hasSynthetic": bool(has_synthetic),
            "error": error,
            "ranAt": datetime.now(timezone.utc),
        }
    )
