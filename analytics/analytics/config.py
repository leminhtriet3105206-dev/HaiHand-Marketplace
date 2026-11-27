import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover
    load_dotenv = None

try:
    from pymongo.uri_parser import parse_uri
except ImportError:  # pragma: no cover
    parse_uri = None


@dataclass(frozen=True)
class AnalyticsConfig:
    read_uri: str
    write_uri: str
    db_name: str
    tz_name: str


def _load_env_files() -> None:
    if load_dotenv is None:
        return
    # analytics/analytics/config.py -> repo_root = parents[2]
    repo_root = Path(__file__).resolve().parents[2]
    candidates = [
        repo_root / "analytics" / ".env",
        repo_root / "backend" / ".env",
        repo_root / "admin" / ".env",
        repo_root / ".env",
    ]
    for env_file in candidates:
        if env_file.is_file():
            load_dotenv(env_file, override=False)


def _extract_db_from_uri(uri: str) -> Optional[str]:
    if not uri or parse_uri is None:
        return None
    try:
        parsed = parse_uri(uri)
        return parsed.get("database") or None
    except Exception:
        return None


def load_config() -> AnalyticsConfig:
    _load_env_files()
    read_uri = (
        os.getenv("ANALYTICS_MONGO_URI")
        or os.getenv("MONGO_URI")
        or os.getenv("MONGODB_URI")
        or "mongodb://localhost:27017/haihand"
    )
    write_uri = os.getenv("ANALYTICS_WRITE_MONGO_URI") or read_uri
    db_name = (
        os.getenv("DB_NAME")
        or _extract_db_from_uri(read_uri)
        or "HaiHand"
    )
    tz_name = os.getenv("TZ") or "Asia/Ho_Chi_Minh"
    return AnalyticsConfig(
        read_uri=read_uri,
        write_uri=write_uri,
        db_name=db_name,
        tz_name=tz_name,
    )
