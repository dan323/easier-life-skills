---
name: security-review
description: >
  Scan a codebase for OWASP Top-10 vulnerabilities, hardcoded secrets,
  insecure dependencies, and unsafe code patterns. Produces a read-only
  markdown report ranked by severity (Critical / High / Medium / Low).
  Use when the user says "security review", "scan for vulnerabilities",
  "check for secrets", "audit my code for security issues", "find OWASP
  issues", "check for hardcoded passwords", "security audit", or
  "find insecure patterns".
tools: Bash, Read, Grep, TaskCreate, TaskUpdate
---

# Security Review

Scan the target codebase for OWASP Top-10 vulnerabilities, hardcoded
secrets, insecure dependency versions, and unsafe code patterns. Output
a read-only markdown report. Never write to or modify files in the
target project.

---

## Task Tracking

Before doing any work, call `TaskCreate` for each phase below. Call
`TaskUpdate` (status `in_progress`) when you begin a phase and
`TaskUpdate` (status `completed`) when you finish it.

- Detect language and project type
- Scan for hardcoded secrets
- Scan for OWASP Top-10 patterns
- Run dependency audit
- Assemble and print report

---

## Phase 1 — Detect language and project type

Identify what's in scope before running any scan.

```bash
# Detect primary languages by file count
find . -type f \( \
  -name "*.js" -o -name "*.ts" -o -name "*.jsx" -o -name "*.tsx" \
  -o -name "*.py" -o -name "*.java" -o -name "*.kt" \
  -o -name "*.go" -o -name "*.rs" -o -name "*.rb" \
  -o -name "*.php" -o -name "*.cs" \
\) 2>/dev/null \
  | grep -v node_modules | grep -v ".git" | grep -v dist | grep -v build \
  | sed 's/.*\.//' | sort | uniq -c | sort -rn | head -10

# Detect package managers / lockfiles
ls package.json requirements.txt Pipfile pyproject.toml \
   go.mod Cargo.toml pom.xml build.gradle Gemfile \
   composer.json *.csproj 2>/dev/null
```

Record:
- Primary language(s) (top 1-3 by file count)
- Package manager(s) present
- Whether `semgrep`, `bandit`, `npm audit`, `pip-audit`, `cargo audit`,
  `gradle`, or `mvn` are available

```bash
for tool in semgrep bandit; do command -v $tool 2>/dev/null && echo "$tool: available" || echo "$tool: not found"; done
```

---

## Phase 2 — Scan for hardcoded secrets

### 2.1 High-entropy string detection

Use `grep` to find patterns that strongly suggest embedded credentials.
Exclude test files, lock files, and minified JS from findings — but note
they were excluded.

```bash
# Common secret field names with assignment
grep -rn --include="*.py" --include="*.js" --include="*.ts" \
  --include="*.java" --include="*.go" --include="*.rb" \
  --include="*.php" --include="*.cs" --include="*.env" \
  --include="*.yml" --include="*.yaml" --include="*.json" \
  -E '(password|passwd|secret|api_key|apikey|access_token|auth_token|private_key|client_secret)\s*[=:]\s*["\x27][^"\x27]{8,}["\x27]' \
  --exclude-dir=node_modules --exclude-dir=.git \
  --exclude-dir=dist --exclude-dir=build \
  --exclude="*.lock" --exclude="package-lock.json" \
  . 2>/dev/null | grep -v -E '(test|spec|mock|fixture|example|sample|placeholder|TODO|CHANGE_ME|your_|<|>|\$\{|\{\{)' \
  | head -50
```

```bash
# Cloud provider token shapes
grep -rn --include="*.py" --include="*.js" --include="*.ts" \
  --include="*.java" --include="*.go" --include="*.env" \
  --include="*.yml" --include="*.yaml" \
  --exclude-dir=node_modules --exclude-dir=.git \
  -E '(AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|ghs_[A-Za-z0-9]{36}|sk-[A-Za-z0-9]{48}|xox[baprs]-[0-9]{12}-[0-9]{12}|AIza[0-9A-Za-z_-]{35})' \
  . 2>/dev/null | head -20
```

```bash
# Private key headers
grep -rn --include="*.pem" --include="*.key" --include="*.p12" \
  --include="*.py" --include="*.js" --include="*.env" \
  --exclude-dir=node_modules --exclude-dir=.git \
  -l "BEGIN.*PRIVATE KEY\|BEGIN RSA PRIVATE" . 2>/dev/null
```

### 2.2 .env files committed to git

```bash
# Check if any .env files are tracked in git
git ls-files | grep -E '(^|/)\.env(\.|$)' 2>/dev/null
```

Classify each finding:
- **Critical** — confirmed token shape (AWS AKIA, GitHub ghp_, OpenAI sk-)
- **High** — plaintext assignment to `password`/`secret`/`api_key` field with non-placeholder value
- **Medium** — private key file tracked in git, .env tracked in git

---

## Phase 3 — Scan for OWASP Top-10 patterns

Run the best available scanner, then fall back to grep rules.

### 3.1 Use semgrep if available

```bash
if command -v semgrep &>/dev/null; then
  semgrep scan --config=p/owasp-top-ten --config=p/secrets \
    --json --quiet \
    --exclude node_modules --exclude .git --exclude dist --exclude build \
    . 2>/dev/null | python3 -c "
import json, sys
data = json.load(sys.stdin)
results = data.get('results', [])
for r in results[:100]:
    sev = r.get('extra', {}).get('severity', 'INFO')
    path = r.get('path', '')
    line = r.get('start', {}).get('line', '')
    msg = r.get('extra', {}).get('message', '')
    print(f'{sev}|{path}:{line}|{msg[:120]}')
print(f'TOTAL: {len(results)} findings')
"
fi
```

### 3.2 Use bandit for Python if available

```bash
if command -v bandit &>/dev/null; then
  PY_FILES=$(find . -name "*.py" \
    -not -path "*/node_modules/*" -not -path "*/.git/*" \
    -not -path "*/dist/*" 2>/dev/null | head -200)
  if [ -n "$PY_FILES" ]; then
    echo "$PY_FILES" | xargs bandit -q -f txt 2>/dev/null | head -100
  fi
fi
```

### 3.3 Grep-based OWASP fallback rules

Run these regardless of semgrep/bandit availability to catch
language-agnostic patterns:

**A01 — Broken Access Control**
```bash
# Hardcoded admin bypass
grep -rn --include="*.py" --include="*.js" --include="*.ts" \
  --include="*.java" --include="*.go" --include="*.php" \
  --exclude-dir=node_modules --exclude-dir=.git \
  -E 'if\s+(user|role|admin)\s*==\s*["\x27](admin|root|superuser|true)["\x27]' \
  . 2>/dev/null | head -20
```

**A02 — Cryptographic Failures**
```bash
# Weak hash algorithms
grep -rn --include="*.py" --include="*.js" --include="*.ts" \
  --include="*.java" --include="*.go" --include="*.php" \
  --include="*.rb" --include="*.cs" \
  --exclude-dir=node_modules --exclude-dir=.git \
  -E '(md5|sha1|MD5|SHA1|hashlib\.md5|MessageDigest\.getInstance\("MD5"\)|crypto\.createHash\("md5"\))' \
  . 2>/dev/null | grep -v "test\|spec\|mock\|fixture" | head -30
```

```bash
# Disabled TLS/SSL verification
grep -rn --include="*.py" --include="*.js" --include="*.ts" \
  --include="*.go" --include="*.rb" \
  --exclude-dir=node_modules --exclude-dir=.git \
  -E '(verify\s*=\s*False|verify:\s*false|InsecureSkipVerify\s*:\s*true|rejectUnauthorized\s*:\s*false|ssl_verify\s*=\s*false)' \
  . 2>/dev/null | head -20
```

**A03 — Injection**
```bash
# SQL string concatenation (classic injection)
grep -rn --include="*.py" --include="*.js" --include="*.ts" \
  --include="*.java" --include="*.go" --include="*.php" \
  --include="*.rb" --include="*.cs" \
  --exclude-dir=node_modules --exclude-dir=.git \
  -E '(execute|query|cursor\.execute|db\.query)\s*\(\s*["\x27].*\+|f"SELECT|f"INSERT|f"UPDATE|f"DELETE|\$\{.*\}\s*(WHERE|FROM|INTO|SET)' \
  . 2>/dev/null | grep -v "test\|spec\|mock" | head -30
```

```bash
# Command injection — shell=True / exec / eval with variable
grep -rn --include="*.py" --include="*.js" --include="*.ts" \
  --include="*.go" --include="*.php" \
  --exclude-dir=node_modules --exclude-dir=.git \
  -E '(subprocess\.(call|run|Popen).*shell\s*=\s*True|exec\s*\(.*\+|eval\s*\(.*req\.|os\.system\s*\(.*\+|child_process\.exec\s*\()' \
  . 2>/dev/null | grep -v "test\|spec\|mock" | head -30
```

**A05 — Security Misconfiguration**
```bash
# Debug mode enabled in production config
grep -rn --include="*.py" --include="*.js" --include="*.ts" \
  --include="*.java" --include="*.go" --include="*.yml" \
  --include="*.yaml" --include="*.env" \
  --exclude-dir=node_modules --exclude-dir=.git \
  -E '(DEBUG\s*=\s*True|debug\s*:\s*true|NODE_ENV\s*=\s*development)' \
  . 2>/dev/null | grep -v "test\|spec\|example\|sample" | head -20
```

```bash
# CORS allow-all
grep -rn --include="*.py" --include="*.js" --include="*.ts" \
  --include="*.java" --include="*.go" \
  --exclude-dir=node_modules --exclude-dir=.git \
  -E '(CORS\s*\(\s*origins?\s*=\s*["\x27]\*["\x27]|Access-Control-Allow-Origin.*\*)' \
  . 2>/dev/null | head -15
```

**A07 — Identification and Authentication Failures**
```bash
# JWT none algorithm or no signature verification
grep -rn --include="*.py" --include="*.js" --include="*.ts" \
  --include="*.java" --include="*.go" \
  --exclude-dir=node_modules --exclude-dir=.git \
  -E '(algorithm\s*=\s*["\x27]none["\x27]|verify\s*=\s*False.*jwt|options\s*=\s*\{.*algorithms.*none)' \
  . 2>/dev/null | head -10
```

**A08 — Software and Data Integrity**
```bash
# Pickle / deserialisation of untrusted data
grep -rn --include="*.py" \
  --exclude-dir=node_modules --exclude-dir=.git \
  -E '(pickle\.loads?\s*\(|yaml\.load\s*\([^)]*Loader\s*=\s*None|yaml\.load\s*\([^)]*\)\s*$)' \
  . 2>/dev/null | head -20
```

**A10 — SSRF**
```bash
# requests/fetch with user-controlled URL
grep -rn --include="*.py" --include="*.js" --include="*.ts" \
  --include="*.go" --include="*.php" \
  --exclude-dir=node_modules --exclude-dir=.git \
  -E '(requests\.(get|post|put|delete|head)\s*\(\s*(request\.|req\.|params|url|data)\.|fetch\s*\(\s*(req\.|request\.|params|url))' \
  . 2>/dev/null | head -15
```

For each grep result, classify severity:
- **High** — injection patterns, disabled TLS, JWT none algorithm, pickle on user data
- **Medium** — weak hash (MD5/SHA1 for security purposes), debug mode, CORS wildcard, SSRF candidate
- **Low** — patterns that may be intentional but warrant review

**Skip flagging:**
- Test files (paths matching `test`, `spec`, `__tests__`, `fixtures`, `mocks`)
- Spring `@Bean` / `@Component` methods flagged by access control rules
- Comments and documentation
- Configuration for local/dev environments that are clearly not production

---

## Phase 4 — Dependency audit

Run the appropriate tool for each detected package manager.

### npm / yarn
```bash
if [ -f package.json ] && command -v npm &>/dev/null; then
  npm audit --json 2>/dev/null | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    vulns = data.get('vulnerabilities', {})
    for name, v in list(vulns.items())[:30]:
        sev = v.get('severity', 'unknown')
        via = ', '.join(str(x.get('source', x) if isinstance(x, dict) else x) for x in v.get('via', [])[:3])
        print(f'{sev.upper()}|{name}|{via[:100]}')
    totals = data.get('metadata', {}).get('vulnerabilities', {})
    print(f'TOTALS: {totals}')
except Exception as e:
    print(f'Parse error: {e}')
" 2>/dev/null || echo "npm audit not available or failed"
fi
```

### Python pip-audit
```bash
if ([ -f requirements.txt ] || [ -f Pipfile ] || [ -f pyproject.toml ]) && command -v pip-audit &>/dev/null; then
  pip-audit --format=json 2>/dev/null | python3 -c "
import json, sys
data = json.load(sys.stdin)
for dep in data.get('dependencies', [])[:30]:
    for vuln in dep.get('vulns', []):
        print(f'HIGH|{dep[\"name\"]}=={dep[\"version\"]}|{vuln[\"id\"]}|{vuln[\"description\"][:100]}')
" 2>/dev/null || echo "pip-audit not available"
fi
```

### Go
```bash
if [ -f go.mod ] && command -v govulncheck &>/dev/null; then
  govulncheck ./... 2>/dev/null | head -50 || echo "govulncheck not available"
fi
```

### Cargo (Rust)
```bash
if [ -f Cargo.toml ] && command -v cargo-audit &>/dev/null; then
  cargo audit 2>/dev/null | head -50 || echo "cargo audit not available"
fi
```

If no audit tool is available for a detected package manager, note it in
the report under "Manual Checks Required".

---

## Phase 5 — Assemble and print report

Produce a single markdown report to stdout. Do **not** write any file.

```
# Security Review Report

Generated: <date>
Target: <absolute path scanned>
Primary language(s): <list>

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | N     |
| High     | N     |
| Medium   | N     |
| Low      | N     |

---

## Critical Findings
(omit section if none)

### [SEC-C01] <Title>
**Severity:** Critical
**Category:** <OWASP category or "Secrets">
**Location:** `path/to/file:line`

<One-paragraph explanation of the risk and how an attacker could exploit it.>

**Recommendation:** <Concrete fix — one or two sentences.>

---

## High Findings
(same format; omit section if none)

---

## Medium Findings
(same format; omit section if none)

---

## Low Findings
(list format: `[SEC-L01] path:line — brief description`)

---

## Dependency Audit

<Table of vulnerable dependencies found, or "No known vulnerable dependencies detected.">

| Package | Version | Severity | CVE / Advisory |
|---------|---------|----------|----------------|

---

## Manual Checks Required

List anything that could not be automatically verified:
- OWASP A04 (Insecure Design) — requires architectural review
- <Package manager X> audit — <tool> not installed
- Authentication / session management — code-path review needed

---

## Scan Coverage

| Check | Tool used | Result |
|-------|-----------|--------|
| Secrets / credentials | grep patterns | ✓ |
| OWASP Top-10 patterns | semgrep / grep | ✓ / fallback |
| Dependency CVEs | npm audit / pip-audit / … | ✓ / not available |
| Python-specific | bandit | ✓ / not available |

---

## Excluded

- `node_modules/`, `.git/`, `dist/`, `build/`
- Test/spec/fixture files (not flagged but still scanned for secrets)
- Lock files
```

### Severity assignment rules

| Finding type | Severity |
|---|---|
| Confirmed cloud token shape (AKIA, ghp_, sk-) | Critical |
| Plaintext password/secret/api_key assignment | High |
| SQL/command injection pattern | High |
| Disabled TLS verification | High |
| JWT none algorithm | High |
| Pickle/unsafe deserialisation | High |
| Private key file committed | High |
| Weak hash (MD5/SHA1) for security purpose | Medium |
| Debug mode in non-test config | Medium |
| CORS wildcard | Medium |
| .env committed to git | Medium |
| SSRF candidate (unvalidated URL) | Medium |
| Informational pattern needing review | Low |

### Deduplication

If the same file:line is flagged by both semgrep and grep, report it
once with the higher severity and note both detectors.

### Framework-aware suppression

Do **not** flag:
- Spring `@Bean`/`@Component` public methods as access control issues
- `@CrossOrigin` annotations in test profiles
- Hash functions used only for non-security purposes (e.g., cache keys)
  — only flag when the context suggests authentication or data integrity
- pytest/unittest `setUp` helper code using `shell=True` inside test isolation
