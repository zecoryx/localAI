# LocalAI

A dedicated sidecar service providing AI-powered security auditing, website structure analysis, and code generation capabilities via Ollama models.

## Overview

LocalAI serves as an intelligence layer processing complex source code and design files into actionable insights. It leverages a robust architecture capable of chunking large codebases, managing streaming responses, and providing an OpenAI-compatible interface.

## Key Features

- **Content-Based Caching:** Automatic code normalization for deterministic cache hits.
- **Streaming & Chunking:** Real-time Server-Sent Events (SSE) support for heavy project audits.
- **Queue Management:** Controlled concurrency handling to prevent model inference bottlenecks.
- **Figma Extraction:** Direct translation of Figma designs to website architectures.
- **V1 Compatibility:** OpenAI-compatible wrapper endpoint for seamless ecosystem integration.

## Installation

1. Install dependencies
```bash
npm install
```

2. Environment configuration
```bash
cp .env.example .env
# Set API_KEY and OLLAMA URL parameters
```

3. Start the service
```bash
node index.js
```

## Core Endpoints

### Auditing
- `POST /audit-project`: Batch security audit from ZIP archives.
- `POST /audit-project-stream`: Streaming execution of project security audits (SSE).

### Generation
- `POST /generate`: Prompt-based code and schema generation.
- `POST /generate-chunked`: Progressive component generation and assembly.
- `POST /figma-to-site`: Automated layout extraction from Figma designs.

### Integration & Monitoring
- `POST /v1/chat/completions`: OpenAI-compatible completions endpoint.
- `GET /stats`: Real-time instance metrics (memory utilization, queue bounds, cache hits).
- `POST /clear-cache`: Purges in-memory caching layers.

## Authentication

All endpoints require authentication headers. Provide your secret token using one of the following methods:
- Header: `x-api-key: <token>`
- Header: `Authorization: Bearer <token>`
