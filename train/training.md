# 🧠 Trading 212 Backend Prep Plan (No Spring)

## 📅 Timeline (7–10 days)
- Day 1–2 → Databases & concurrency
- Day 3–4 → HTTP / REST internals
- Day 5–6 → Rate limiting, throttling, caching
- Day 7–8 → System design & failure modes
- Day 9–10 → Mock interviews + coding

---

# 1. 🗄️ Databases & Concurrency (CRITICAL)

## 🔒 Locking & Isolation
### Topics
- Pessimistic vs Optimistic locking
- Row-level vs Table-level locks
- Deadlocks (detection, prevention)
- Isolation levels:
    - Read Uncommitted
    - Read Committed
    - Repeatable Read
    - Serializable
- MVCC (Multi-Version Concurrency Control)

### Must be able to answer
- Prevent double spending
- Choose isolation level for trading
- Explain deadlocks and avoidance

---

## 📊 Indexing & Query Performance
### Topics
- B-tree vs Hash indexes
- Composite indexes
- Covering indexes
- Query plans (`EXPLAIN`)

### Practice
- Optimize slow queries
- Detect missing indexes

---

## 🧩 Sharding & Scaling
### Topics
- Horizontal vs Vertical scaling
- Sharding strategies:
    - Range-based
    - Hash-based
- Rebalancing issues

---

# 2. 🌐 HTTP & REST (No Frameworks)

## 🔌 HTTP Internals
### Topics
- TCP → HTTP lifecycle
- Request parsing
- Headers & status codes
- Statelessness

---

## 🧱 Build Minimal REST API
### Requirements
- No Spring / no heavy frameworks
- Use:
    - Java/Kotlin + sockets OR
    - Lightweight server (Netty, Undertow)

### Endpoints
- `GET /orders`
- `POST /orders`
- `DELETE /orders/{id}`

---

## 🔁 Idempotency (VERY IMPORTANT)
### Topics
- Why POST is not idempotent
- Idempotency keys
- Deduplication strategies
- Safe retries

---

# 3. 🚦 Rate Limiting & Throttling

## ⚡ Algorithms
- Token Bucket (priority)
- Leaky Bucket
- Fixed Window
- Sliding Window

---

## 🛠️ Implement
- In-memory rate limiter (per user)
- Distributed limiter (conceptual, Redis-like)

---

## 💬 Must answer
- Prevent API abuse
- Per-user vs global limits
- Distributed consistency issues

---

# 4. ⚙️ Concurrency & Backend Internals

## 🧵 Threads & Memory
### Topics
- Thread pools
- Race conditions
- Synchronization:
    - Locks
    - Atomics
- Java Memory Model
- Garbage Collection basics

---

## 🧨 Failure Handling
### Topics
- Partial failures
- Retries & idempotency
- Timeouts
- Backpressure
- Circuit breakers (conceptual)

---

# 5. 🧠 System Design (Trading-Oriented)

## 🏦 Systems to Design
- Order placement system
- Balance management (no double spend)
- Real-time price updates

---

## 🔑 Key Concepts
- Consistency vs Latency
- Exactly-once vs At-least-once
- Event-driven architecture
- Message queues (conceptual)

---

# 6. 🧪 Practical Projects (MANDATORY)

## ✅ Project 1: Trading API
- Create order
- Cancel order
- Prevent duplicates (idempotency)

---

## ✅ Project 2: Rate Limiter
- Token bucket implementation
- Per-user throttling

---

## ✅ Project 3: Concurrency Demo
- Simulate race condition
- Fix using locking / atomics

---

# 7. 🎯 Mock Interview Questions

- Design a rate limiter
- Explain idempotency
- Avoid duplicate execution
- DB isolation levels
- Handle concurrent trades
- Scale an API

---

# ⚠️ Key Mindset

## ❌ Avoid
- Framework-dependent thinking
- “Spring does it for me” answers

## ✅ Show
- Understanding of internals
- Performance awareness
- Failure reasoning
- Control over system behavior

---

# 🚀 Stretch Topics (If Time)

- Netty internals
- Zero-copy / low-latency IO
- Caching strategies (LRU, LFU)
- Distributed locks (e.g., Redis, Zookeeper conceptually)
- Event sourcing basics

---