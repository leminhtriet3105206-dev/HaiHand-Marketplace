import json
from pathlib import Path
from typing import Dict, Set

_SPEC_CANDIDATES = [
    Path(__file__).resolve().parent.parent / "event_spec.json",
    Path(__file__).resolve().parent.parent.parent / "event_spec.json",
]

def load_event_spec() -> Dict:
    for path in _SPEC_CANDIDATES:
        if path.exists():
            with path.open("r", encoding="utf-8") as f:
                return json.load(f)
    return {"version": 1, "events": {}}


EVENT_SPEC = load_event_spec()
ALLOWED_EVENTS: Set[str] = set(EVENT_SPEC.get("events", {}).keys())
CLIENT_EVENTS: Set[str] = {
    k for k, v in EVENT_SPEC.get("events", {}).items() if v.get("source") == "client"
}
SERVER_EVENTS: Set[str] = {
    k for k, v in EVENT_SPEC.get("events", {}).items() if v.get("source") == "server"
}
