import mongomock
from datetime import datetime, timezone

from analytics.seed_demo import generate_synthetic_events, purge_synthetic
from analytics.run import run_jobs


def test_seed_and_pipeline_invariants():
    client = mongomock.MongoClient()
    db = client["haihand_test"]

    inserted = generate_synthetic_events(db, db, days=14, sessions_per_day=80, seed=42)
    assert inserted > 0
    assert db["analytics_events"].count_documents({"synthetic": True}) == inserted

    since = datetime(2020, 1, 1, tzinfo=timezone.utc)
    until = datetime(2030, 1, 1, tzinfo=timezone.utc)

    res1 = run_jobs(
        db,
        db,
        ["all"],
        since,
        until,
        tz_name="Asia/Ho_Chi_Minh",
        include_synthetic=True,
        seed_rfm_from_events=True,
    )
    assert res1["hasSynthetic"] is True
    for jname, jres in res1["jobs"].items():
        assert jres["error"] is None, f"Job {jname} failed: {jres['error']}"

    # 1. Tổng phiên theo thiết bị == tổng phiên overall mỗi ngày
    overall_rows = list(db["analytics_daily"].find({"dimension": "overall"}))
    assert len(overall_rows) > 0
    for row in overall_rows:
        d = row["date"]
        dev_sum = sum(x["sessions"] for x in db["analytics_daily"].find({"date": d, "dimension": "device"}))
        assert dev_sum == row["sessions"]

    # 2. Phễu không tăng ở bước sau
    funnel_rows = list(db["analytics_funnel"].find({"segment": "all"}))
    assert len(funnel_rows) > 0
    for frow in funnel_rows:
        steps = frow["steps"]
        for i in range(1, len(steps)):
            assert steps[i]["sessions"] <= steps[i - 1]["sessions"]

    # 3. RFM có dữ liệu và nhãn hợp lệ
    segs = list(db["analytics_segments"].find({}))
    assert len(segs) > 0
    valid_labels = {"Champions", "Khách trung thành", "Tiềm năng", "Có nguy cơ rời bỏ", "Ngủ đông/Đã mất", "Mới"}
    for s in segs:
        assert s["rfm_label"] in valid_labels

    # 4. Chạy lại job (idempotent) không nhân đôi bản ghi
    daily_count_before = db["analytics_daily"].count_documents({})
    funnel_count_before = db["analytics_funnel"].count_documents({})
    seg_count_before = db["analytics_segments"].count_documents({})

    run_jobs(
        db,
        db,
        ["all"],
        since,
        until,
        tz_name="Asia/Ho_Chi_Minh",
        include_synthetic=True,
        seed_rfm_from_events=True,
    )
    assert db["analytics_daily"].count_documents({}) == daily_count_before
    assert db["analytics_funnel"].count_documents({}) == funnel_count_before
    assert db["analytics_segments"].count_documents({}) == seg_count_before

    # 5. --purge-synthetic dọn sạch dữ liệu mô phỏng
    purge_synthetic(db)
    assert db["analytics_events"].count_documents({"synthetic": True}) == 0
    assert db["analytics_daily"].count_documents({"hasSynthetic": True}) == 0
    assert db["analytics_funnel"].count_documents({"hasSynthetic": True}) == 0
