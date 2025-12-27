# Technical Spec: Phase 1.2 - Database Schema & Configuration (Final)

**Context**
Set up the shared database package (`packages/db`) using **Drizzle ORM** and **Neon PostgreSQL**.

## Files to Implementation

### 1. Configuration: `packages/db/drizzle.config.ts`
* **Goal:** Configure Drizzle Kit for migrations.
* **Requirements:**
    * Load environment variables using `dotenv`.
    * Target schema file: `./src/schema.ts`.
    * Output folder: `./drizzle`.
    * Dialect: `'postgresql'`.
    * `dbCredentials`: Use `process.env.DATABASE_URL`.
    * **Strictness:** Throw a clear error if `DATABASE_URL` is undefined.

### 2. Schema Definition: `packages/db/src/schema.ts`
* **Goal:** Define tables using `drizzle-orm/pg-core`. Use UUIDs for all primary keys.

* **Table 1: `products`**
    * `id`: UUID, Primary Key, default random.
    * `url`: Text, Not Null, Unique.
    * `name`: Text, Not Null.
    * `image_url`: Text (Nullable).
    * `active`: Boolean, Default `true`.
    * `schedule`: Text, Default `'0 9 * * *'` (Cron syntax).
    * `created_at`: Timestamp, Default Now.
    * `updated_at`: Timestamp, Default Now.

* **Table 2: `price_records`**
    * `id`: UUID, Primary Key, default random.
    * `product_id`: UUID, Foreign Key to `products.id` (Cascade Delete).
    * `price`: Integer (Store in **cents**).
    * `currency`: Text, Default `'USD'`.
    * `scraped_at`: Timestamp, Default Now.

* **Table 3: `alert_rules`**
    * `id`: UUID, Primary Key, default random.
    * `product_id`: UUID, Foreign Key to `products.id` (Cascade Delete).
    * `target_price`: Integer (Target price in cents).
    * `active`: Boolean, Default `true`.
    * `created_at`: Timestamp, Default Now.

* **Table 4: `run_logs`**
    * `id`: UUID, Primary Key, default random.
    * `product_id`: UUID, Foreign Key to `products.id` (Cascade Delete).
    * `status`: Text (Enum: 'SUCCESS', 'FAILED').
    * `error_message`: Text (Nullable, for debugging).
    * `created_at`: Timestamp, Default Now.

* **Relations:**
    * `products` has many `price_records`.
    * `products` has many `alert_rules`.
    * `products` has many `run_logs`.

### 3. Database Client: `packages/db/src/index.ts`
* **Goal:** Export the connection logic.
* **Requirements:**
    * Import `postgres` library.
    * Create a connection pool using `process.env.DATABASE_URL`.
    * Initialize Drizzle: `drizzle(client, { schema })`.
    * **Exports:**
        * The `db` instance.
        * Type definitions (`Product`, `NewProduct`, `PriceRecord`, `AlertRule`, `RunLog`) inferred from schema.

### 4. Package Config: `packages/db/package.json`
* **Scripts Update:**
    * `"generate"`: `"drizzle-kit generate"`
    * `"push"`: `"drizzle-kit push"`
    * `"studio"`: `"drizzle-kit studio"`