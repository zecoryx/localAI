# LocalAI Service API Documentation

LocalAI is a sidecar service tailored for the ShotStack platform, providing AI-powered security auditing, website structure analysis, and code generation using Ollama models.

## 🚀 Quick Start

1.  **Install dependencies:** `npm install`
2.  **Environment Setup:** Copy `.env.example` to `.env` and configure your `OLLAMA_URL`.
3.  **Run:** `node index.js`

## 🔑 Authentication

All requests must include the `x-api-key` header.
Example: `x-api-key: your_secret_key`

## 📡 API Endpoints

### 1. Security Audit (Streaming)

**`POST /audit-project-stream`**

Extracts and analyzes a project ZIP file in real-time.

- **Body (multipart/form-data):**
  - `projectZip`: The ZIP file to audit.
- **Response:** `text/event-stream` (SSE)
  - Events: `extraction`, `ai_tahlil`, `chunk`, `complete`, `error`.

### 2. General Generation

**`POST /generate`**

Generates code or design schemas based on a role and prompt.

- **Body (JSON):**
  - `role`: The AI role (e.g., `designer`, `security_expert`).
  - `prompt`: The text description or source data.
- **Response:** JSON object with the generated content.
- **Performance:** Cached by default for identical prompt/role pairs.

### 3. Service Statistics

**`GET /stats`**

Provides real-time monitoring data.

- **Response:**
  ```json
  {
    "uptime": 3600,
    "memory": { "rss": 120000000, "heapTotal": 80000000, ... },
    "queue": { "active": 0, "waiting": 0, "concurrency": 2 },
    "cache": { "hits": 15, "misses": 5, "hitRate": "75.0%", "entries": 20 }
  }
  ```

### 4. Cache Management

**`POST /clear-cache`**

Wipes all in-memory AI and file caches.

---

## 🛠️ Key Features

- **Content-Based Caching:** Automatic normalization of code (ignoring whitespace/comments) to maximize cache hit rates.
- **Robust JSON Parsing:** Multi-stage extraction logic to handle malformed AI responses.
- **Queue Management:** Controlled concurrency via `p-queue` to prevent Ollama overloading.
- **Performance Monitoring:** Granular response time tracking and timeout alerts (120s threshold).
