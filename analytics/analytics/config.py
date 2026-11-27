import os
from dataclasses import dataclass


@dataclass(frozen=True)
class AnalyticsConfig:
    read_uri: str
    write_uri: str
    db_name: str
    tz_name: str


def load_config() -> AnalyticsConfig:
    read_uri = (
        os.getenv("ANALYTICS_MONGO_URI")
        or os.getenv("MONGO_URI")
        or "mongodb://localhost:27017/haihand"
    )
    write_uri = os.getenv("ANALYTICS_WRITE_MONGO_URI") or read_uri
    db_name = os.getenv("DB_NAME") or "haihand"
    tz_name = os.getenv("TZ") or "Asia/Ho_Chi_Minh"
    return AnalyticsConfig(
        read_uri=read_uri,
        write_uri=write_uri,
        db_name=db_name,
        tz_name=tz_name,
    )
