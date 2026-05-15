#!/usr/bin/env python3

import datetime
import json
import os
import sys


def main() -> int:
    try:
        data = json.load(sys.stdin)
    except Exception:
        return 0

    usage = data.get("usage", {}) if isinstance(data, dict) else {}
    input_tokens = int(usage.get("input_tokens", 0) or 0)
    output_tokens = int(usage.get("output_tokens", 0) or 0)
    entry = {
        "date": datetime.datetime.utcnow().isoformat() + "Z",
        "session_id": (data.get("session_id", "") if isinstance(data, dict) else ""),
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "estimated_usd": round(input_tokens * 3e-6 + output_tokens * 15e-6, 6),
    }

    log_path = os.path.expanduser("~/.claude/cost-log.jsonl")
    os.makedirs(os.path.dirname(log_path), exist_ok=True)
    with open(log_path, "a", encoding="utf-8") as handle:
        handle.write(json.dumps(entry) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
