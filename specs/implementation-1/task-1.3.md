# Infrastructure Setup Guide: Local Development Environment

**Phase:** 1.3
**Goal:** Configure a local Redis instance using Docker to serve as the message broker for BullMQ.

## Prerequisites

### General
- Node.js environment ready.

### Docker Installation
* **Windows Users (Recommended):**
    * Install **[Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/)**.
    * **Important:** During installation, ensure the option **"Use WSL 2 based engine"** is checked. This provides better performance and integration with VS Code.
    * Docker Desktop includes `docker-compose` and a GUI for managing containers.
* **Mac / Linux Users:**
    * Install Docker Engine and Docker Compose via your package manager.

---

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

Open your terminal (PowerShell, WSL, or Bash) in the project root and run:

```bash
docker-compose up -d

```

* `-d` runs the container in detached mode (background).
* **Windows Tip:** If using Docker Desktop, you can also view the running container status in the Docker Dashboard GUI.

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



---

## Architecture Note: Local vs Production

* **Local Development:** We use a local Redis container via Docker for cost efficiency, speed, and offline capability.
* **Production:** We will NOT host a Redis container manually. Instead, we will switch to **Upstash (Serverless Redis)**.
* When deploying, simply update the `REDIS_URL` environment variable to point to the Upstash endpoint. No code changes are required.
