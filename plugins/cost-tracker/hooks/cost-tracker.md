---
name: cost-tracker
description: Appends a JSON line with token usage and estimated cost to ~/.claude/cost-log.jsonl on every Stop and SubagentStop event. Zero configuration — accumulates a personal cost ledger across all sessions.
events: [Stop, SubagentStop]
command: "python3 -c \"import json,sys,os,datetime; d=json.load(sys.stdin); u=d.get('usage',{}); i=u.get('input_tokens',0); o=u.get('output_tokens',0); open(os.path.expanduser('~/.claude/cost-log.jsonl'),'a').write(json.dumps({'date':datetime.datetime.utcnow().isoformat()+'Z','session_id':d.get('session_id',''),'input_tokens':i,'output_tokens':o,'estimated_usd':round(i*3e-6+o*15e-6,6)})+chr(10))\""
---

# cost-tracker

Passively logs token usage to `~/.claude/cost-log.jsonl` on every `Stop` and `SubagentStop` event.

## What it logs

Each entry is a single JSON line:

```json
{"date":"2026-05-07T14:23:01Z","session_id":"abc123","input_tokens":12400,"output_tokens":3100,"estimated_usd":0.0837}
```

| Field | Description |
|---|---|
| `date` | UTC timestamp of the Stop event |
| `session_id` | Claude Code session identifier |
| `input_tokens` | Input tokens consumed in the session |
| `output_tokens` | Output tokens generated in the session |
| `estimated_usd` | Rough estimate based on Sonnet pricing ($3/M in, $15/M out) |

> **Note:** `estimated_usd` uses Sonnet-class pricing as a default. Adjust the multipliers (`3e-6` and `15e-6`) in the command if you use Opus ($15/$75 per million) or Haiku ($0.80/$4 per million).

## Aggregating the log

Sum total cost across all sessions:

```bash
jq -s '[.[].estimated_usd] | add' ~/.claude/cost-log.jsonl
```

Cost by day:

```bash
jq -r '.date[:10] + " " + (.estimated_usd | tostring)' ~/.claude/cost-log.jsonl \
  | awk '{sum[$1]+=$2} END {for (d in sum) print d, sum[d]}' | sort
```

Top 10 most expensive sessions:

```bash
jq -s 'sort_by(-.estimated_usd) | .[:10] | .[] | [.date,.session_id,.estimated_usd] | @tsv' \
  ~/.claude/cost-log.jsonl
```

## Requirements

- Python 3 must be available on `PATH` (pre-installed on macOS and most Linux; available via the Microsoft Store or `winget install Python.Python.3` on Windows).
