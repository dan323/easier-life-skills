#!/usr/bin/env python3

import datetime
import json
import os
import sys

# Per-million-token pricing in USD. Defaults reflect Claude Sonnet rates;
# override with COST_TRACKER_PRICING=input,output,cache_write,cache_read.
DEFAULT_PRICING = (3.0, 15.0, 3.75, 0.30)


def load_pricing() -> tuple:
    raw = os.environ.get("COST_TRACKER_PRICING")
    if not raw:
        return DEFAULT_PRICING
    try:
        parts = [float(x.strip()) for x in raw.split(",")]
    except ValueError:
        return DEFAULT_PRICING
    if len(parts) != 4:
        return DEFAULT_PRICING
    return tuple(parts)


def sum_transcript_usage(transcript_path: str) -> dict:
    totals = {
        "input_tokens": 0,
        "output_tokens": 0,
        "cache_creation_input_tokens": 0,
        "cache_read_input_tokens": 0,
    }
    if not transcript_path or not os.path.isfile(transcript_path):
        return totals
    with open(transcript_path, "r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except Exception:
                continue
            message = row.get("message") if isinstance(row, dict) else None
            if not isinstance(message, dict):
                continue
            usage = message.get("usage")
            if not isinstance(usage, dict):
                continue
            for key in totals:
                value = usage.get(key)
                if isinstance(value, int):
                    totals[key] += value
    return totals


def previous_totals(log_path: str, session_id: str) -> dict:
    totals = {
        "input_tokens": 0,
        "output_tokens": 0,
        "cache_creation_input_tokens": 0,
        "cache_read_input_tokens": 0,
    }
    if not session_id or not os.path.isfile(log_path):
        return totals
    last = None
    with open(log_path, "r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except Exception:
                continue
            if entry.get("session_id") == session_id and "cumulative" in entry:
                last = entry["cumulative"]
    if isinstance(last, dict):
        for key in totals:
            value = last.get(key)
            if isinstance(value, int):
                totals[key] = value
    return totals


def estimate_usd(tokens: dict, pricing: tuple) -> float:
    p_in, p_out, p_cw, p_cr = pricing
    cost = (
        tokens["input_tokens"] * p_in
        + tokens["output_tokens"] * p_out
        + tokens["cache_creation_input_tokens"] * p_cw
        + tokens["cache_read_input_tokens"] * p_cr
    ) / 1_000_000.0
    return round(cost, 6)


def main() -> int:
    try:
        data = json.load(sys.stdin)
    except Exception:
        return 0
    if not isinstance(data, dict):
        return 0

    session_id = data.get("session_id", "") or ""
    transcript_path = data.get("transcript_path", "") or ""
    log_path = os.path.expanduser("~/.claude/cost-log.jsonl")
    os.makedirs(os.path.dirname(log_path), exist_ok=True)

    cumulative = sum_transcript_usage(transcript_path)
    previous = previous_totals(log_path, session_id)
    delta = {key: cumulative[key] - previous[key] for key in cumulative}
    # Guard against transcript rewrites that would yield negative deltas.
    for key, value in list(delta.items()):
        if value < 0:
            delta[key] = 0

    pricing = load_pricing()
    entry = {
        "date": datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z"),
        "session_id": session_id,
        "event": data.get("hook_event_name", ""),
        "input_tokens": delta["input_tokens"],
        "output_tokens": delta["output_tokens"],
        "cache_creation_input_tokens": delta["cache_creation_input_tokens"],
        "cache_read_input_tokens": delta["cache_read_input_tokens"],
        "estimated_usd": estimate_usd(delta, pricing),
        "cumulative": cumulative,
        "cumulative_usd": estimate_usd(cumulative, pricing),
    }

    with open(log_path, "a", encoding="utf-8") as handle:
        handle.write(json.dumps(entry) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
