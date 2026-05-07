---
name: audit-logger
description: Appends a JSON line to ~/.claude/audit-history.jsonl on every Stop event when a site-audit-report.md exists in the current directory, building a personal audit ledger.
events: [Stop]
command: "python3 -c \"import json,sys,os,datetime,pathlib; d=json.load(sys.stdin); r=pathlib.Path('site-audit-report.md'); (lambda: None)() if not r.exists() else open(os.path.expanduser('~/.claude/audit-history.jsonl'),'a').write(json.dumps({'date':datetime.datetime.utcnow().isoformat()+'Z','session_id':d.get('session_id',''),'url':r.read_text(encoding='utf-8').split(chr(10))[0].replace('# Site Audit: ','').strip(),'report':str(r.absolute())})+chr(10))\""
---

# audit-logger

Passively records completed site audits to `~/.claude/audit-history.jsonl`.

Fires on every `Stop` event. If a `site-audit-report.md` exists in the current
directory, it appends one JSON line with the session ID, URL, and report path.

## What it logs

```json
{"date":"2026-05-07T14:23:01Z","session_id":"abc123","url":"https://example.com","report":"/home/user/projects/myapp/site-audit-report.md"}
```

## Querying the log

List all audited URLs:
```bash
jq -r '.url' ~/.claude/audit-history.jsonl | sort -u
```

Show recent audits:
```bash
jq -r '[.date,.url] | @tsv' ~/.claude/audit-history.jsonl | tail -20
```

## Requirements

Python 3 on `PATH` (pre-installed on macOS/Linux; `winget install Python.Python.3` on Windows).
