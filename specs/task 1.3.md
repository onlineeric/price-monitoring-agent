# Infrastructure Setup Guide: Local Development Environment

**Phase:** 1.3
**Goal:** Configure a local Redis instance using Docker to serve as the message broker for BullMQ.

## Prerequisites
- Docker & Docker Compose installed and running.
- Node.js environment ready.

## 1. Docker Compose Configuration

Create a file named `docker-compose.yml` in the project root directory.

```yaml
version: '3.8'

services:
  # Redis Service
  # Acts as the message broker for BullMQ (Job Queue)
  redis:
    image: redis:alpine
    container_name: price-monitor-redis
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes
    restart: always
    volumes:
      - redis_data:/data

volumes:
  redis_data:

```

## 2. Start the Service

Open your terminal in the project root and run:

```bash
docker-compose up -d

```

* `-d` runs the container in detached mode (background).

## 3. Environment Variables

Update your `.env` file in the root directory to include the Redis connection string:

```env
# Database (Neon)
DATABASE_URL="postgres://..."

# Redis (Local Docker)
REDIS_URL="redis://localhost:6379"

```

## 4. Verification Steps

### Method A: Docker CLI (Quick Check)

Run the following command to ping the Redis container:

```bash
docker exec -it price-monitor-redis redis-cli ping

```

**Expected Output:** `PONG`

### Method B: Connection Script (Node.js Check)

Create a temporary script `test-redis.ts` in the root to ensure Node.js can connect.

1. Install temporary dependency:
```bash
pnpm add ioredis -w

```


2. Create `test-redis.ts`:
```typescript
import Redis from 'ioredis';

// Ensure this matches your .env REDIS_URL
const redis = new Redis('redis://localhost:6379');

console.log('⏳ Connecting to Redis...');

redis.ping().then((result) => {
  console.log('✅ Redis Connection Success:', result); // Should be 'PONG'
  redis.disconnect();
}).catch((err) => {
  console.error('❌ Redis Connection Failed:', err);
  redis.disconnect();
});

```


3. Run the script:
```bash
npx tsx test-redis.ts

```


4. Cleanup (after success):
```bash
rm test-redis.ts
pnpm remove ioredis -w

```
