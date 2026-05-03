---
name: improve-logging
description: Audit and improve logging quality across a codebase. Use when the user asks to "improve logging", "fix log levels", "add logging", "review our logs", "make logging consistent", "we have bad logging", or anything about log messages being unclear, missing, or at the wrong severity. Produces a prioritized list of recommendations — does not edit files directly.
tools: Bash, Read, Glob, Grep
model: haiku
metadata:
  version: 1.0
---

# Improve Logging

Audit a codebase's logging and produce a prioritized list of recommendations covering three areas: missing log statements, incorrect severity levels, and poor message quality. Also enforces (or proposes) a consistent logging pattern across the whole application.

**This skill is read-only.** It produces a recommendation report. It does not edit any file.

## Phase 1: Detect Languages and Logging Frameworks

```bash
# Identify languages
find . -maxdepth 4 -not -path "*/.git/*" -not -path "*/node_modules/*" \
  -not -path "*/vendor/*" -not -path "*/.venv/*" \
  \( -name "*.py" -o -name "*.java" -o -name "*.kt" -o -name "*.ts" \
     -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" -o -name "*.go" \
     -o -name "*.rs" -o -name "*.cs" -o -name "*.rb" \) \
  | sed 's/.*\.//' | sort | uniq -c | sort -rn | head -10
```

Detect the logging framework in use per language:

| Language      | Frameworks to detect                                                      |
|---------------|---------------------------------------------------------------------------|
| Python        | `import logging`, `from loguru`, `import structlog`                       |
| Java/Kotlin   | `import org.slf4j`, `import org.apache.logging`, `import io.github.oshai` |
| TypeScript/JS | `import winston`, `import pino`, `console.log/warn/error`                 |
| Go            | `import "log"`, `"go.uber.org/zap"`, `"github.com/sirupsen/logrus"`       |
| C#            | `ILogger`, `Microsoft.Extensions.Logging`, `Serilog`, `NLog`              |
| Ruby          | `Rails.logger`, `Logger.new`                                              |

```bash
# Python
grep -rn "import logging\|from loguru\|import structlog" --include="*.py" . | head -5

# Java/Kotlin
grep -rn "import org.slf4j\|import org.apache.logging\|LoggerFactory\|KotlinLogging" \
  --include="*.java" --include="*.kt" . | head -5

# TypeScript/JS
grep -rn "require.*winston\|require.*pino\|import.*winston\|import.*pino\|console\.\(log\|warn\|error\|info\|debug\)" \
  --include="*.ts" --include="*.js" --include="*.tsx" --include="*.jsx" . | head -5

# Go
grep -rn '"log"\|"go.uber.org/zap"\|"github.com/sirupsen/logrus"\|"golang.org/x/exp/slog"' \
  --include="*.go" . | head -5
```

## Phase 2: Establish the Logging Pattern

Sample up to 20 existing log call sites to understand the current pattern (or absence of one):

```bash
# Python example — find log calls
grep -rn "logger\.\|logging\." --include="*.py" . | head -20

# Java/Kotlin example
grep -rn "log\.\(info\|debug\|warn\|error\|trace\)" --include="*.java" --include="*.kt" . | head -20

# Go example
grep -rn "log\.\|logger\.\|zap\.\|logrus\." --include="*.go" . | head -20
```

Read 3–5 representative files where logging is present to understand:

1. **Message style** — verb-first ("Processing request"), noun-first ("Request received"), or mixed?
2. **Context fields** — are structured fields used (e.g. `log.Info("done", "user_id", id)`)? Which fields appear consistently?
3. **Logger instantiation** — module-level singleton, passed via context, or created per function?
4. **Level discipline** — is DEBUG used for fine-grained tracing? Is INFO for business events?

### Required fields

Every log call must include at minimum:

| Field | Purpose | When required |
|---|---|---|
| Event name | What happened (the message) | Always |
| `request_id` / `trace_id` | Correlate logs across a request | Any code that handles an incoming request (HTTP, gRPC, queue consumer) |
| `user_id` | Who triggered the action | Any user-facing operation where a user ID is in scope |
| `error` / `err` | The error value or message | Any log at WARN or ERROR level |

If the codebase already uses these fields consistently, document them as required. If not, include them in the proposed pattern. Flag any log call that is in request-scoped code but omits `request_id` / `trace_id` as an inconsistency (Phase 3d).

### Pattern decision

- **If a clear pattern exists** (consistent message style, consistent fields, consistent logger instantiation): document it and treat any deviation as an inconsistency finding.
- **If no clear pattern exists** (< 5 log calls in the whole codebase, or wildly inconsistent): propose a pattern appropriate for the language and framework. State the proposed pattern at the top of the report so the user can accept or adjust it before acting on the recommendations.

**Recommended patterns by framework:**

*Python (structlog or logging):*
```python
log = structlog.get_logger(__name__)
log.info("order.placed", order_id=order_id, user_id=user_id)
# Message: noun.verb snake_case, context as keyword args
```

*Go (zap or slog):*
```go
logger.Info("order placed", zap.String("order_id", orderID), zap.String("user_id", userID))
// Message: lowercase prose, context as typed fields
```

*Java/Kotlin (SLF4J):*
```java
log.info("Order placed: orderId={}, userId={}", orderId, userId);
// Message: sentence case prose, context via SLF4J placeholders
```

*TypeScript/JS (pino or winston):*
```ts
logger.info({ orderId, userId }, 'Order placed')
// pino style: context object first, message second
```

## Phase 3: Scan for Issues

### 3a. Missing log statements

Look for code paths that almost certainly should be logged but aren't. Focus on high-value locations:

**Error handlers with no log:**
```bash
# Python
grep -rn "except " --include="*.py" -A 3 . | grep -v "log\|logger\|print" | head -20

# Java
grep -rn "catch\s*(" --include="*.java" -A 3 . | grep -v "log\.\|LOG\.\|logger\." | head -20

# Go
grep -rn "if err != nil" --include="*.go" -A 2 . | grep -v "log\.\|logger\." | head -20

# TypeScript
grep -rn "catch\s*(" --include="*.ts" --include="*.js" -A 3 . | grep -v "console\.\|logger\.\|log\." | head -20
```

**Important operations with no surrounding log** — use these grep patterns to find high-value functions, then read them to check whether they log:

```bash
# Functions whose names signal state changes or side effects
grep -rn "def \(create\|update\|delete\|remove\|send\|publish\|process\|handle\|execute\|run\|dispatch\)_" \
  --include="*.py" .

grep -rn "func \(create\|update\|delete\|remove\|send\|publish\|process\|handle\|execute\|run\|dispatch\)[A-Z]" \
  --include="*.go" .

grep -rn "^\s*\(public\|private\|protected\).*\(create\|update\|delete\|send\|process\|handle\)[A-Z]" \
  --include="*.java" --include="*.kt" .

grep -rn "^\(export \)\?\(async \)\?function \(create\|update\|delete\|send\|process\|handle\)" \
  --include="*.ts" --include="*.js" .
```

Also check these locations regardless of name:
- HTTP handlers / route controllers (any file in `handlers/`, `controllers/`, `routes/`, `views/`)
- Background jobs / scheduled tasks (`jobs/`, `workers/`, `tasks/`, `cron/`)
- Startup and shutdown sequences (main entry point, `init()`, signal handlers)

Flag an operation as missing a log if:
- It handles an error path with no log
- It completes a significant state change (create, update, delete) with no log
- It calls an external service with no log on failure
- It is a re-raise (exception caught and immediately re-thrown) with no log before the re-raise — the caller may never log it either, so this is the last chance

### 3b. Incorrect severity levels

For each log call found, evaluate whether the level matches the situation. Apply these rules:

| Level                | When to use                                                                                            | Common mistakes                                                        |
|----------------------|--------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------|
| `DEBUG`              | Implementation details useful during development; disabled in production                               | Using DEBUG for events that operators need to see in prod              |
| `INFO`               | Normal, expected application flow; key business events                                                 | Logging every row in a loop as INFO; using INFO for recoverable errors |
| `WARN`               | Something unexpected happened but the application recovered; a condition that may cause problems later | Using WARN for actual errors; using WARN for routine things            |
| `ERROR`              | An operation failed and requires attention; may affect a user or data                                  | Swallowing errors silently; logging errors as WARN                     |
| `FATAL` / `CRITICAL` | Application cannot continue; imminent shutdown                                                         | Overusing FATAL for recoverable errors                                 |

**Exception handling rules** — apply these precisely when reading error-handling paths:

| Situation | Correct level | Rationale |
|---|---|---|
| Exception caught and **re-raised** | `ERROR` | The operation failed; the caller sees an exception. Log here so there is at least one record even if callers don't. |
| Exception caught and **handled** (request still succeeds) | `WARN` | Something unexpected happened but was recovered from. |
| Exception caught and **swallowed** (no re-raise, no response change) | Flag as **missing log** | Silent swallowing hides failures entirely. Always log before swallowing. |
| Expected, routine condition (e.g. cache miss, 404 lookup) | `DEBUG` or no log | Not an error; high-volume events at WARN/ERROR pollute alerting. |

**HTTP status code → log level mapping** — when code sets or returns an HTTP status, the log level should follow:

| Status range | Log level | Rationale |
|---|---|---|
| 2xx | `INFO` (or no log if framework logs requests) | Success — normal flow |
| 3xx | `DEBUG` | Redirect — expected, low value |
| 4xx (client error) | `WARN` | Client made a bad request; server is fine |
| 5xx (server error) | `ERROR` | Server failed; needs attention |

```bash
# HTTP responses logged at wrong level (Python/Flask/FastAPI)
grep -rn "status_code\s*=\s*[45][0-9][0-9]\|return.*[45][0-9][0-9]" --include="*.py" -A 3 . | \
  grep "logger\.\(debug\|info\|warning\)"

# 5xx logged at warn instead of error (JS/TS)
grep -rn "res\.status(5[0-9][0-9])" --include="*.ts" --include="*.js" -A 5 . | \
  grep "console\.warn\|logger\.warn"

# 4xx logged at error (over-alerting)
grep -rn "res\.status(4[0-9][0-9])" --include="*.ts" --include="*.js" -A 5 . | \
  grep "console\.error\|logger\.error"
```

Also scan for:
```bash
# Errors logged at INFO or WARN (Python)
grep -rn "logger\.info\|logging\.info\|logger\.warning" --include="*.py" . | grep -i "error\|fail\|exception\|crash"

# Exceptions caught and logged at DEBUG
grep -rn "\.debug(" --include="*.java" --include="*.kt" . | grep -i "exception\|error\|fail"

# console.log used for errors in JS/TS
grep -rn "console\.log" --include="*.ts" --include="*.js" . | grep -i "error\|fail\|exception"
```

Read through error-handling paths in representative files — grep catches obvious mismatches, but reading reveals the subtler ones (e.g. a re-raise with no preceding log).

### 3c. Logs to remove

Scan for log calls that should be deleted entirely rather than improved. Flag all matches — these are the highest-priority recommendations because sensitive data in logs is a security incident waiting to happen.

**Sensitive data:**
```bash
# Common sensitive field names in log arguments
grep -rn "password\|passwd\|secret\|api_key\|apikey\|token\|credential\|ssn\|credit_card\|cvv\|private_key" \
  --include="*.py" --include="*.java" --include="*.ts" --include="*.js" --include="*.go" --include="*.rb" . \
  | grep -i "log\|logger\|print\|console" | head -30
```

Flag any log call that passes a sensitive field as a parameter or includes it in the message string. Include a clear explanation of the security risk (e.g. "API keys in logs are stored in plain text and accessible to anyone with log access, including log aggregation services").

**Debug artifacts:** `print()` in Python, `console.log()` / `console.debug()` in JS/TS, `fmt.Println()` in Go, `System.out.println()` in Java — these are almost never intentional in production code. Flag all of them.

**Log spam:** log calls inside tight loops (for/while) that fire on every iteration. A single INFO log per item in a large batch creates millions of log entries. Suggest replacing with a summary log after the loop (e.g. `"Processed N items in Xms"`).

**Redundant logs:** multiple log calls at the same level for the same event within a few lines, where one clearly subsumes the other.

### 3d. Poor message quality

A good log message answers: *what happened, in what context, and why does it matter?*

Flag messages that:
- Are too vague to act on: `"Error"`, `"Something went wrong"`, `"Failed"`, `"null"`, `"done"`, `"ok"`
- Include no context when context is available: `"User not found"` when the user ID is in scope
- Are redundant with the exception type alone: `log.error("NullPointerException", e)` adds nothing
- Use inconsistent casing or tense compared to the established pattern
- Expose sensitive data: passwords, tokens, PII in log messages

```bash
# Vague messages (Python)
grep -rn "logger\.\w\+(['\"].\{1,20\}['\"])" --include="*.py" . | \
  grep -i '"error"\|"fail"\|"exception"\|"done"\|"ok"\|"success"\|"null"'

# Very short messages (Java)
grep -rn 'log\.\w\+("\w\{1,10\}")' --include="*.java" . | head -20
```

For files with message quality issues, read the surrounding code to suggest a better message that includes the relevant context variables.

### 3e. Inconsistency with the established pattern

Compare each log call against the pattern established in Phase 2:
- Logger instantiated differently than the norm
- Message casing or verb tense differs
- Structured fields used in some places but not others
- Required fields (from Phase 2) are missing — e.g. a log inside a request handler that omits `request_id`, or a WARN/ERROR log that omits `error`/`err`

## Phase 4: Output the Report

Group all findings into a single report. Order: **Remove → Missing logs → Wrong level → Poor messages → Inconsistencies**.

Put Remove first because sensitive data in logs is an immediate security risk — it must be addressed before any other improvement.

Within each section, order by file. For each finding include the file path, line number, the current code (if any), and a concrete suggested improvement.

Use this format:

```
## Logging Improvement Report

### Established Pattern
[State the detected or proposed pattern here. If proposed, prefix with "⚡ No consistent pattern found — proposing:"]

Example:
  logger.info("order.placed", order_id=order_id, amount=amount)
  # noun.verb message, structured keyword args, module-level logger

---

### 1. Remove   (N findings)

**src/auth/login.py:14** — sensitive field in log
  Current:  `logger.info("login success", extra={"user_id": user.id, "password": password})`
  Remove:   the `password` field from the extra dict
  Why: passwords in logs are stored in plain text and accessible to everyone with log access, including log aggregation services

**src/debug/util.py:8** — debug artifact
  Current:  `print(f"Login attempt for {username}")`
  Action:   Replace with `logger.info("auth.login_attempt", username=username)` or remove
  Why: print() bypasses the logging framework and cannot be filtered or silenced in production

---

### 2. Missing Log Statements   (N findings)

**src/payments/processor.py:88** — error path with no log
  Context: `except StripeError as e:`
  Add: `logger.error("payment.charge_failed", order_id=order_id, error=str(e))`
  Why: stripe failures are silent — operators have no visibility when charges fail

**src/jobs/email_sender.py:34** — external call with no failure log
  Context: `response = smtp.send(msg)`
  Add (on failure): `logger.error("email.send_failed", recipient=msg.to, error=str(e))`

---

### 3. Incorrect Log Levels   (N findings)

**src/auth/login.py:52** — ERROR logged as WARNING
  Current:  `logger.warning("Login failed for user %s", user_id)`
  Suggest:  `logger.error("auth.login_failed", user_id=user_id)`
  Why: a failed login attempt is an error worth alerting on, not just a warning

**src/cache/client.py:19** — DEBUG in a tight loop producing log spam
  Current:  `logger.debug("Cache miss for key %s", key)` (called on every request)
  Suggest:  Remove or gate behind a feature flag; emit a summary metric instead

---

### 4. Poor Message Quality   (N findings)

**src/api/users.py:101**
  Current:  `logger.error("Error")`
  Suggest:  `logger.error("user.fetch_failed", user_id=user_id, error=str(e))`
  Why: "Error" is unactionable — which user, which operation, what went wrong?

**src/db/connection.py:14**
  Current:  `logger.info("Connected")`
  Suggest:  `logger.info("db.connected", host=host, port=port, database=db_name)`
  Why: context needed for debugging connection issues across environments

---

### 5. Inconsistencies   (N findings)

**src/orders/service.py:67** — unstructured message where structured is the norm
  Current:  `logger.info(f"Order {order_id} placed by {user_id}")`
  Suggest:  `logger.info("order.placed", order_id=order_id, user_id=user_id)`

---

### Summary

| Category              | Count |
|-----------------------|-------|
| Remove                |     2 |
| Missing log statements|     4 |
| Incorrect log levels  |     3 |
| Poor message quality  |     6 |
| Inconsistencies       |     5 |
| **Total**             |**20** |

### Recommended next steps
- Address "Remove" immediately — sensitive data in logs is a security incident waiting to happen.
- Address "Missing log statements" next — silent error paths are the highest operational risk.
- Apply the established pattern to all new log calls going forward.
- Consider adding a linting rule to enforce log level discipline in CI.
```

If no issues are found in a section, omit that section entirely rather than writing "No issues found."

If the codebase has fewer than 5 log calls total, lead with the pattern proposal and focus the report on where to add logging rather than what to fix.
