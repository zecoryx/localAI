# LocalAI Performance Benchmarks

This document outlines the expected performance metrics and caching efficiency of the LocalAI service under various workloads.

## ⏱️ Response Times (Average)

| Action               | Payload Size | Initial Run | Cached Run |
| :------------------- | :----------- | :---------- | :--------- |
| **Security Audit**   | < 1MB (ZIP)  | 25s - 45s   | < 1s       |
| **Security Audit**   | 10MB - 50MB  | 60s - 120s  | < 1s       |
| **URL Cloning**      | N/A          | 30s - 90s\* | < 2s       |
| **General Code Gen** | < 5KB Prompt | 15s - 30s   | < 500ms    |

_\* Includes Puppeteer navigation and AI layout reconstruction._

## 📈 Caching Effectiveness

LocalAI uses content-based hashing to maximize cache hits even when files are reformatted or contain different comments.

- **Average Cache Hit Rate:** 70% - 90% (for repetitive audits)
- **Storage Impact:** Negligible (In-memory storage with LRU eviction)
- **Normalization Speed:** < 5ms per file

## 🖥️ Resource Utilization

| Resource           | Idle | Processing (Heavy) |
| :----------------- | :--- | :----------------- |
| **CPU (Node.js)**  | 0.1% | 10% - 20%\*        |
| **RAM (Node.js)**  | 80MB | 250MB - 500MB      |
| **Ollama GPU/CPU** | 0%   | 80% - 100%         |

_\* Primary processing load is offloaded to Ollama. Node.js primarily handles I/O and orchestration._

## 🚦 Concurrency Limits

The system uses a priority queue with regulated concurrency:

- **Default Concurrency:** 2 simultaneous AI generations.
- **Wait Queue:** Unlimited (requests are processed FIFO).
- **Timeout Threshold:** 300s (5 minutes) for heavy designer tasks.
