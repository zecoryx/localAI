# LocalAI Troubleshooting Guide

This guide helps resolve common issues encountered while running the LocalAI sidecar service.

## 🔴 Service Connectivity

### Issue: "ECONNREFUSED" when connecting to LocalAI

- **Cause:** The service is not running or the port is blocked.
- **Fix:**
  1.  Ensure you ran `node index.js`.
  2.  Check if port `7777` (default) is in use by another process.
  3.  Verify the `LOCALAI_URL` in the ShotStack backend `.env` matches the service's listen address.

### Issue: "403 Forbidden"

- **Cause:** Invalid `x-api-key`.
- **Fix:** Ensure the `API_KEY` in `localAi/.env` matches the `LOCALAI_API_KEY` in `backend/.env`.

---

## 🟡 AI Performance & Timeouts

### Issue: Requests taking longer than 120s

- **Symptoms:** "⚠️ Request taking longer than expected..." log appears.
- **Resolution:**
  1.  **Hardware:** Ensure Ollama has sufficient GPU VRAM (4GB+ recommended).
  2.  **Concurrency:** Check `/stats` to see if the queue is overloaded.
  3.  **Model:** If using a heavy model, consider switching to `qwen2.5-coder:1.5b` or `llama3.2:3b` in `localAi/config.js`.

### Issue: Generation returns "Invalid AI response format"

- **Cause:** The model failed to follow the JSON schema or returned truncated output.
- **Resolution:**
  1.  Check `ai.service.js` logs to see the raw response.
  2.  Try clicking "Skip AI Cache" in the UI to force a fresh (and potentially better) generation.
  3.  Increase `num_ctx` in `ai.service.js` if the source HTML is very large.

---

## 🔵 Caching & Data

### Issue: Getting old design after changing source website

- **Cause:** Cache hit on previous content.
- **Fix:** Enable "Skip AI Cache" in the Import Form or call `POST /clear-cache`.

### Issue: High Memory Usage

- **Cause:** Large files remain in memory cache.
- **Fix:** Restart the service to wipe the in-memory cache, or lower the `CACHE_SIZE_LIMIT` in `config.js`.

---

## 🟢 Logging & Debugging

- **View Live Stats:** `curl http://localhost:7777/stats`
- **Debug Logs:** All terminal output includes a unique Request ID for tracing specific transactions from receipt to completion.
