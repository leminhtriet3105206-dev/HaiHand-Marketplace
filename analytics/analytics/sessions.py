import pandas as pd


SESSION_GAP_SECONDS = 30 * 60


def build_sessions(df_events: pd.DataFrame, tz_name: str = "Asia/Ho_Chi_Minh") -> pd.DataFrame:
    """
    Chuẩn hóa timestamp sang múi giờ Việt Nam và dựng phiên làm việc:
    - Nếu sự kiện có `sessionId` hợp lệ (không rỗng, != 'unknown'), dùng `sessionId`.
    - Nếu không có `sessionId` hợp lệ, cắt phiên theo `anonymousId` với khoảng nghỉ 30 phút.
    """
    if df_events is None or df_events.empty:
        return pd.DataFrame()

    df = df_events.copy()
    ts = pd.to_datetime(df["ts"], utc=True, errors="coerce")
    df = df.loc[ts.notna()].copy()
    if df.empty:
        return pd.DataFrame()

    df["ts_utc"] = ts.loc[df.index]
    df["ts_local"] = df["ts_utc"].dt.tz_convert(tz_name)
    df["date"] = df["ts_local"].dt.strftime("%Y-%m-%d")

    def _ctx_field(ctx, key, default=""):
        if isinstance(ctx, dict):
            return ctx.get(key) or default
        return default

    if "context" in df.columns:
        df["device"] = df["context"].apply(lambda c: _ctx_field(c, "device", "desktop"))
        df["area"] = df["context"].apply(lambda c: _ctx_field(c, "area", "buyer"))
    else:
        df["device"] = "desktop"
        df["area"] = "buyer"

    def _prop_field(props, key, default=None):
        if isinstance(props, dict):
            return props.get(key, default)
        return default

    if "props" in df.columns:
        df["utm_source"] = df["props"].apply(lambda p: _prop_field(p, "utm_source"))
        df["referrer"] = df["props"].apply(lambda p: _prop_field(p, "referrer"))
    else:
        df["utm_source"] = None
        df["referrer"] = None

    df["source"] = df.apply(
        lambda r: r["utm_source"] or r["referrer"] or "direct",
        axis=1,
    )

    df = df.sort_values(["anonymousId", "ts_utc"]).reset_index(drop=True)

    # Cắt phiên fallback 30 phút cho các event thiếu sessionId hợp lệ
    raw_sid = df.get("sessionId", pd.Series([""] * len(df))).fillna("").astype(str)
    needs_cut = (raw_sid == "") | (raw_sid == "unknown")

    if needs_cut.any():
        prev_anon = df["anonymousId"].shift(1)
        diff_sec = (df["ts_utc"] - df["ts_utc"].shift(1)).dt.total_seconds().fillna(0)
        new_cut = (df["anonymousId"] != prev_anon) | (diff_sec > SESSION_GAP_SECONDS)
        cut_ids = new_cut.cumsum()
        df["effective_session_id"] = raw_sid.where(
            ~needs_cut,
            df["anonymousId"].astype(str) + "_auto_" + cut_ids.astype(str),
        )
    else:
        df["effective_session_id"] = raw_sid

    df["actor_id"] = df.apply(
        lambda r: f"u:{r['userId']}" if pd.notna(r.get("userId")) and str(r.get("userId")) not in ("", "None", "nan")
        else f"a:{r['anonymousId']}",
        axis=1,
    )
    return df
