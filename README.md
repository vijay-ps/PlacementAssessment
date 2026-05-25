# AeroStock // Concurrency-Safe Inventory Reservation Platform

A production-grade, highly concurrent, multi-warehouse inventory reservation and order fulfillment platform designed to eliminate overselling and race conditions under intense simultaneous demand.

---

## ⚡ Concurrency Strategy & Row-Level Locking

In high-throughput e-commerce settings, standard database transaction isolation levels (such as PostgreSQL's default `Read Committed`) are insufficient. They do not prevent **phantom reads** or **write skew**—where two simultaneous threads read a stock level of `1`, both evaluate that stock is available, and both decrement/reserve it, leading to a physical stock level of `-1` (overselling).

AeroStock guarantees absolute race-condition-free consistency through **pessimistic row-level locking** inside PostgreSQL transactions:

```mermaid
sequenceDiagram
    autonumber
    actor Client A
    actor Client B
    participant Database

    Note over Client A, Database: 1 Unit Available in Stock
    Client A->>Database: Start Transaction (Interactive)
    Client B->>Database: Start Transaction (Interactive)
    
    Client A->>Database: SELECT FOR UPDATE (Locks Inventory Row)
    activate Database
    Note over Database: Row locked by Client A.
    
    Client B->>Database: SELECT FOR UPDATE (Blocks/Waits)
    Note over Database: Client B's query blocks, waiting for lock release.

    Database-->>Client A: Returns Stock = 1 (Available)
    Client A->>Database: UPDATE reservedQuantity = 1, Create Reservation
    Client A->>Database: Commit Transaction
    deactivate Database
    Note over Database: Lock released. Client B resumes.
    
    activate Database
    Database-->>Client B: Returns Stock = 0 (Calculated dynamically)
    Client B->>Database: Insufficient Stock! Rollback Transaction
    deactivate Database
    Database-->>Client B: 409 Conflict Error
```

### Why Interactive Transactions & Row-Level Locking?
1. **Serialized State Evaluation**: By invoking `SELECT ... FOR UPDATE` inside a transaction, we instruct PostgreSQL to acquire a write lock on the target `Inventory` row immediately. Any concurrent transaction attempting to lock or update the same row is blocked until the first transaction commits or rolls back.
2. **Dynamic Stock Calculation**: Rather than relying on static fields, we dynamically compute available stock: 
   $$\text{Available Stock} = \text{Total Quantity} - \text{Reserved Quantity}$$
   Because the read operation occurs *after* the write lock is acquired, we are guaranteed to read the absolute latest, uncommitted state.
3. **No Overwrites / Lost Updates**: The atomic state transition is protected entirely by the database engine. It is physically impossible for two requests to reserve the same unit simultaneously.

---

## 🕒 Lazy Expiry Cleanup System

Stock reservations hold inventory temporarily for exactly **10 minutes**. Rather than deploying a heavy background task worker system (e.g., BullMQ, Redis streams, or complex event-driven cron jobs), AeroStock implements a highly performant **lazy cleanup strategy**.

### How it Works:
Before any read or write operation—including fetching the catalog, creating a reservation, or confirming a checkout—the engine runs `lazyCleanupExpiredReservations()`:
1. Scans for all reservations where `status = PENDING` and `expiresAt <= NOW()`.
2. For each expired reservation, it spins up an isolated transaction:
   - Locks the `Reservation` row (`SELECT ... FOR UPDATE`).
   - Locks the corresponding `Inventory` row (`SELECT ... FOR UPDATE`).
   - Updates the status to `RELEASED`.
   - Decrements the `reservedQuantity` in inventory.
3. Because each cleanup is processed in an isolated transaction block, there is zero risk of deadlocks, and concurrent cleanup attempts resolve gracefully.

> [!NOTE]
> **Production Scaling:** In a massive enterprise system, this lazy mechanism can be supplemented with background event triggers such as **Vercel Cron Jobs**, **AWS Lambda EventBridge**, or a **BullMQ** worker pool to ensure instant background synchronization even during low-traffic periods.

---

## 🛡️ API Idempotency & Retry Safety

Network failures, timeout issues, and user double-clicks often cause clients to retry requests. To prevent duplicate reservations and redundant side effects, AeroStock incorporates a **transaction-safe Idempotency Layer**:

1. **Header Inspection**: The server looks for a unique `Idempotency-Key` header on `POST /api/reservations`.
2. **Request Hashing**: A SHA-256 hash is computed from the incoming request payload (`inventoryId` and `quantity`).
3. **Database Guard**:
   - If the key exists in the database:
     - If the `requestHash` matches the current request, the stored response body and status code are returned immediately, bypassing all inventory locking and side effects.
     - If the `requestHash` differs (indicating key reuse with a different payload), the server returns a `400 Bad Request` to prevent key hijacking.
   - If the key does not exist, the request is processed normally.
4. **Atomic Insertion**: The idempotency record is created **inside the same interactive transaction** as the reservation. If the reservation fails or rolls back, the idempotency key is not committed, ensuring subsequent retries can successfully run.

---

## 🏗️ System Architecture

AeroStock's modular layout is built for clean separations of concern:

```
src/
├── app/
│   ├── api/
│   │   ├── products/            # Catalog GET route
│   │   ├── warehouses/          # Warehouse GET route
│   │   └── reservations/
│   │       ├── route.ts         # Create Reservation
│   │       └── [id]/
│   │           ├── route.ts     # Get Reservation details
│   │           ├── confirm/     # Permanent decrement/fulfillment
│   │           └── release/     # Cancel & return stock early
│   ├── checkout/
│   │   └── [id]/                # Immersive checkout & payment simulator
│   ├── globals.css              # Glassmorphism dark cosmic styles
│   ├── layout.tsx               # Header, footers, & Outfits typography
│   └── page.tsx                 # Interactive product catalog page
├── lib/
│   ├── prisma.ts                # Prisma Client PG Pool singleton
│   ├── cleanup.ts               # Lazy cleanup implementation
│   ├── idempotency.ts           # Hashing & duplicate request checks
│   └── reservation.ts           # Core concurrency & lock transactional logic
└── scratch/
    └── stress.ts                # Automated concurrency stress testing script
```

---

## ⚖️ Engineering Tradeoffs & Future Enhancements

### 1. Database Locking vs. Redis Distributed Locks
*   **Tradeoff**: Using PostgreSQL `SELECT FOR UPDATE` places locking overhead directly on the relational database. A distributed lock system (e.g., Redlock with Redis) offloads locking from the DB to an in-memory cache layer.
*   **Decision**: For absolute transactional consistency and correctness, PostgreSQL row-level locks were chosen. They provide out-of-the-box ACID guarantees without requiring double-writes or distributed state synchronization. Additionally, if an application server crashes, PostgreSQL automatically releases the row lock when the TCP connection closes, preventing permanently orphaned lock states.

### 2. Lazy Cleanup vs. Active Cron Workers
*   **Tradeoff**: Active background cron jobs require separate infrastructure and runtime dependencies (e.g., Redis, BullMQ, or continuous serverless schedulers). Lazy cleanup processes expirations on-demand when users fetch lists or request checkouts.
*   **Decision**: Lazy cleanup is self-cleaning, cost-effective, and highly scalable. To ensure stock level freshness even during low-traffic periods, catalog fetch routes (`GET /api/products`) automatically trigger lazy expiration sweeps. This ensures users always see accurate stock metrics without needing continuous cron resources.

### 3. What We Would Do Differently With More Time
*   **Hybrid Optimistic/Pessimistic Locking**: For standard inventory items with low purchase contention, we would implement **Optimistic Concurrency Control (OCC)** using a version-check column. This would allow lock-free reads and updates, falling back to pessimistic `SELECT FOR UPDATE` locking *only* for high-demand, limited-edition flash sales.
*   **Outbox Pattern & Event Queues**: Instead of handling payment and fulfillment confirmations synchronously in the route handlers, we would emit events to a message queue (like RabbitMQ or Apache Kafka) using the Transactional Outbox Pattern, decoupling checkout state changes from downstream shipping systems and improving horizontal write scalability.
*   **Dedicated Cron Sweep Supplement**: For enterprise-grade scaling, we would supplement the lazy cleanup engine with a 1-minute serverless Cron trigger (e.g., **Vercel Cron** or **AWS EventBridge**) to ensure prompt expiration releases during dead hours with zero customer request overhead.

---

## 🚀 Local Setup & Seeding

Follow these steps to run AeroStock on your machine:

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
A `.env` file should be located in the root of the workspace. If you are using a local Postgres server started by the Prisma CLI, ensure it matches:
```env
DATABASE_URL="postgres://postgres:postgres@localhost:51214/template1?sslmode=disable"
```

### 3. Spin up the Database and Seed
To start the local database engine and push the schema:
```bash
# Start the local database
npx prisma dev

# Push database schema 
npx prisma db push

# Generate Prisma Client
npx prisma generate

# Populate the DB with warehouses and products
npx tsx prisma/seed.ts
```

### 4. Run Concurrency Stress Test
Verify that the locking engine works perfectly under simultaneous requests:
```bash
npx tsx src/scratch/stress.ts
```
This script attempts to reserve the final unit of a product with **10 simultaneous requests**. It asserts that:
*   Exactly **1** request succeeds with `201 Created`.
*   Exactly **9** requests fail with `409 Conflict`.
*   Final database `reservedQuantity` is exactly `1`.

### 5. Launch the Application
```bash
npm run dev
```
Navigate to [http://localhost:3000](http://localhost:3000) to view the cosmic, real-time e-commerce reservation catalog!
