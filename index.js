const express = require("express");
const multer = require("multer");
const { askDeepSeek, queue } = require("./services/ai.service");
const {
  extractAndFilterProject,
  splitIntoChunks,
  getCacheKey,
  getCachedResult,
  setCacheResult,
  getCacheStats,
} = require("./utils/fileManager");
const {
  createSSEMessage,
  calculateProgress,
} = require("./utils/progressTracker");
const config = require("./config");
require("dotenv").config();

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// ============ GLOBAL REQUEST LOGGING ============
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  req.id = Math.random().toString(36).substring(7).toUpperCase();
  console.log(`\n${"=".repeat(60)}`);
  console.log(`[${timestamp}] [${req.id}] 📥 ${req.method} ${req.url}`);
  const hasAuth = req.headers["x-api-key"] || req.headers["authorization"];
  console.log(`    Auth: ${hasAuth ? "Mavjud" : "YO'OQ"}`);
  next();
});

// ============ GLOBAL ERROR HANDLERS ============
process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
});

// ============ FAYL YUKLASH SOZLAMALARI ============
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.MAX_ZIP_SIZE_MB * 1024 * 1024, // MB to bytes
  },
});

// ============ XAVFSIZLIK MIDDLEWARE ============
const checkApiKey = (req, res, next) => {
  const apiKey = req.headers["x-api-key"];
  const authHeader =
    req.headers["authorization"] || req.headers["Authorization"];
  const bearerToken = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];

  const providedKey = apiKey || bearerToken;

  if (providedKey && providedKey === process.env.API_KEY) {
    next();
  } else {
    console.warn(
      `[${req.id}] 🔐 Auth failed. Key provided: ${providedKey ? "Yes" : "No"}`,
    );
    res.status(403).json({ error: "Ruxsat yo'q! API Key xato." });
  }
};

// ============ HEALTH CHECK ============
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    version: "2.0.0",
    features: ["chunking", "caching", "priority-filtering"],
  });
});

// ============ 1. ENDPOINT: PROJECT AUDIT (Optimized) ============
app.post(
  "/audit-project",
  checkApiKey,
  upload.single("projectZip"),
  async (req, res) => {
    const startTime = Date.now();

    // Timeout warning
    const timeoutWarning = setTimeout(() => {
      console.warn(
        `[${req.id}] ⚠️ Processing taking longer than expected... (>10s)`,
      );
    }, 100000);

    try {
      if (!req.file) {
        clearTimeout(timeoutWarning);
        return res
          .status(400)
          .json({ success: false, error: "ZIP fayl yuklanmadi." });
      }

      // ============ EXTRACTION (Needed for content-based caching) ============
      console.log(`[${req.id}] 🔍 ZIP ochilmoqda va fayllar filterlanmoqda...`);
      const extractionStart = Date.now();
      const { combinedCode, fileCount, stats } = extractAndFilterProject(
        req.file.buffer,
      );
      const extractionTime = Date.now() - extractionStart;

      if (fileCount === 0) {
        clearTimeout(timeoutWarning);
        return res.status(400).json({
          success: false,
          error:
            "ZIP ichida kod fayllari topilmadi. Iltimos, qo'llab-quvvatlanadigan fayllar borligini tekshiring.",
        });
      }

      // ============ KESH TEKSHIRISH (Content-based) ============
      const cacheKey = getCacheKey(combinedCode);
      const cachedResult = getCachedResult(cacheKey);

      if (cachedResult) {
        console.log(`[${req.id}] ✅ Keshdan qaytarildi (Content-matched)!`);
        clearTimeout(timeoutWarning);
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        return res.json({
          success: true,
          cached: true,
          processing_time_seconds: parseFloat(duration),
          ...cachedResult,
        });
      }

      // ============ CHUNKING ============
      const chunks = splitIntoChunks(combinedCode);
      const isChunked = chunks.length > 1;

      console.log(
        `[${req.id}] 🚀 AI tahlil boshlanmoqda... ${isChunked ? `(${chunks.length} chunk)` : "(single request)"}`,
      );

      req.setTimeout(300000);

      // ============ AI TAHLIL ============
      let result;

      if (isChunked) {
        result = await askDeepSeek("", "cybersecurity", null, {
          chunks: chunks,
          filesAnalyzed: fileCount,
        });
      } else {
        result = await askDeepSeek(combinedCode, "cybersecurity");
        if (result.audit_summary) {
          result.audit_summary.files_analyzed = fileCount;
        }
      }

      // ============ KESHGA SAQLASH ============
      const responseData = {
        files_analyzed: fileCount,
        report: result,
      };
      setCacheResult(cacheKey, responseData);

      // ============ JAVOB QAYTARISH ============
      clearTimeout(timeoutWarning);
      const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);

      console.log(`[${req.id}] ✅ Tahlil yakunlandi: ${totalTime}s`);

      res.json({
        success: true,
        cached: false,
        processing_stats: {
          total_time_seconds: parseFloat(totalTime),
          extraction_time_ms: extractionTime,
          files_processed: fileCount,
          chunks_used: chunks.length,
          code_size_kb: Math.round(combinedCode.length / 1024),
        },
        files_analyzed: fileCount,
        report: result,
      });
    } catch (error) {
      clearTimeout(timeoutWarning);
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.error(
        `[${req.id}] ❌ Audit xatoligi (${duration}s):`,
        error.message,
      );

      res.status(500).json({
        success: false,
        error:
          "Ichki xatolik yuz berdi. Loyiha juda katta yoki AI server band bo'lishi mumkin.",
        details: error.message,
        processing_time_seconds: parseFloat(duration),
      });
    }
  },
);

// ============ 1.1 ENDPOINT: PROJECT AUDIT STREAMING ============
app.post(
  "/audit-project-stream",
  checkApiKey,
  upload.single("projectZip"),
  async (req, res) => {
    const startTime = Date.now();
    const requestId = Math.random().toString(36).substring(7);

    // SSE Headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.flushHeaders();

    const sendSSE = (type, data) => {
      res.write(createSSEMessage(type, data));
    };

    try {
      if (!req.file) {
        sendSSE("error", { error: "ZIP fayl yuklanmadi." });
        return res.end();
      }

      sendSSE("extraction", {
        status: "start",
        message: "Fayl qabul qilindi, tahlil boshlanmoqda...",
      });

      // ============ EXTRACTION ============
      sendSSE("extraction", {
        status: "processing",
        message: "ZIP ochilmoqda va fayllar filterlanmoqda...",
      });
      const extractionStart = Date.now();
      const { combinedCode, fileCount, stats } = extractAndFilterProject(
        req.file.buffer,
      );
      const extractionTime = Date.now() - extractionStart;

      if (fileCount === 0) {
        sendSSE("error", { error: "ZIP ichida kod fayllari topilmadi." });
        return res.end();
      }

      // ============ KESH TEKSHIRISH (Content-based) ============
      const cacheKey = getCacheKey(combinedCode);
      const cachedResult = getCachedResult(cacheKey);

      if (cachedResult) {
        console.log(`[${requestId}] ✅ Keshdan qaytarildi (Content-matched)!`);
        sendSSE("complete", {
          cached: true,
          processing_time_seconds: parseFloat(
            ((Date.now() - startTime) / 1000).toFixed(2),
          ),
          ...cachedResult,
        });
        return res.end();
      }

      sendSSE("extraction", {
        status: "complete",
        filesFound: fileCount,
        codeSize: Math.round(combinedCode.length / 1024),
      });

      // ============ CHUNKING ============
      const chunks = splitIntoChunks(combinedCode);
      const totalChunks = chunks.length;

      sendSSE("ai_tahlil", {
        status: "start",
        totalChunks: totalChunks,
        message: `AI tahlil boshlanmoqda... (${totalChunks} chunk)`,
      });

      req.setTimeout(300000);

      // ============ AI TAHLIL ============
      let result;

      if (totalChunks > 1) {
        const chunkResults = [];
        // Chunked analysis with progress updates
        for (let i = 0; i < totalChunks; i++) {
          sendSSE("chunk", {
            index: i,
            total: totalChunks,
            progress: calculateProgress(i, totalChunks),
            message: `Chunk ${i + 1}/${totalChunks} tahlil qilinmoqda...`,
          });

          // Single chunk analysis
          const chunkResult = await askDeepSeek(
            chunks[i],
            "cybersecurity_chunk",
          );
          chunkResults.push(chunkResult);
        }

        // Using askDeepSeek with dummy chunk for merging
        result = await askDeepSeek("", "cybersecurity", null, {
          chunks: chunks,
          filesAnalyzed: fileCount,
          chunkResults: chunkResults,
        });
      } else {
        sendSSE("chunk", {
          index: 0,
          total: 1,
          progress: 50,
          message: "Yagona so'rov yuborilmoqda...",
        });
        result = await askDeepSeek(combinedCode, "cybersecurity");
        if (result.audit_summary) {
          result.audit_summary.files_analyzed = fileCount;
        }
      }

      // ============ KESHGA SAQLASH ============
      const responseData = {
        files_analyzed: fileCount,
        report: result,
      };
      setCacheResult(cacheKey, responseData);

      // ============ YAKUNLASH ============
      const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);

      sendSSE("complete", {
        cached: false,
        processing_stats: {
          total_time_seconds: parseFloat(totalTime),
          extraction_time_ms: extractionTime,
          files_processed: fileCount,
          chunks_used: totalChunks,
        },
        report: result,
      });

      res.end();
      console.log(`[${requestId}] ✅ Tahlil yakunlandi: ${totalTime}s`);
    } catch (error) {
      console.error(`[${requestId}] ❌ Audit xatoligi:`, error.message);
      sendSSE("error", { error: error.message });
      res.end();
    }
  },
);

// ============ 2. ENDPOINT: GENERATE (Framer & Chat) ============
app.post("/generate", checkApiKey, async (req, res) => {
  const startTime = Date.now();
  const { prompt, role, imageBase64 } = req.body;

  if (!prompt && !imageBase64) {
    return res
      .status(400)
      .json({ success: false, error: "Prompt yoki imageBase64 kiritilmadi." });
  }

  // Timeout warning
  const timeoutWarning = setTimeout(() => {
    console.warn(
      `[${req.id}] ⚠️ Generate taking longer than expected... (>120s)`,
    );
  }, 120000);

  try {
    // ============ KESH TEKSHIRISH (Prompt-based) ============
    const cacheKey = getCacheKey(
      `${role || "general"}:${prompt || ""}${imageBase64 ? "_img" : ""}`,
    );
    const cachedResult = getCachedResult(cacheKey);

    if (config.ENABLE_CACHING && cachedResult) {
      console.log(`[${req.id}] ✅ Generate keshdan qaytarildi!`);
      clearTimeout(timeoutWarning);
      return res.json({
        success: true,
        cached: true,
        processing_time_seconds: parseFloat(
          ((Date.now() - startTime) / 1000).toFixed(2),
        ),
        ...cachedResult,
      });
    }

    console.log(
      `[${req.id}] 📝 /generate - Role: ${role}, Prompt size: ${prompt ? (prompt.length / 1024).toFixed(1) : 0}KB`,
    );

    const result = await askDeepSeek(prompt, role, imageBase64);

    // ============ KESHGA SAQLASH ============
    const responseData = { result };
    setCacheResult(cacheKey, responseData);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[${req.id}] ✅ /generate - Javob tayyor: ${duration}s`);

    clearTimeout(timeoutWarning);
    res.json({
      success: true,
      cached: false,
      processing_time_seconds: parseFloat(duration),
      result,
    });
  } catch (error) {
    clearTimeout(timeoutWarning);
    console.error(`[${req.id}] ❌ /generate xatoligi:`, error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ MONITORING & STATS ============
app.get("/stats", checkApiKey, (req, res) => {
  const memory = process.memoryUsage();
  res.json({
    success: true,
    uptime_seconds: process.uptime(),
    memory: {
      rss: `${(memory.rss / 1024 / 1024).toFixed(2)} MB`,
      heapTotal: `${(memory.heapTotal / 1024 / 1024).toFixed(2)} MB`,
      heapUsed: `${(memory.heapUsed / 1024 / 1024).toFixed(2)} MB`,
    },
    queue: {
      active_requests: queue.pending,
      waiting_requests: queue.size,
      concurrency: queue.concurrency,
    },
    cache: getCacheStats(),
  });
});

// ============ 3. ENDPOINT: STREAMING CHUNKED GENERATION ============
app.post("/generate-chunked", checkApiKey, async (req, res) => {
  const { prompt, components, theme = {} } = req.body;
  const startTime = Date.now();

  try {
    const {
      detectComponents,
      createComponentPrompt,
      estimateGenerationTime,
    } = require("./utils/componentChunker");
    const { mergeComponents } = require("./utils/componentMerger");

    // Auto-detect or use provided components
    const targetComponents = components || detectComponents(prompt);
    const estimatedTime = estimateGenerationTime(targetComponents);

    console.log(`🎨 Chunked generation: ${targetComponents.length} components`);
    console.log(`📊 Components: ${targetComponents.join(", ")}`);
    console.log(`⏱️  Estimated time: ~${estimatedTime}s`);

    // SSE headers for streaming
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.flushHeaders();

    // Send initial progress
    res.write(
      `data: ${JSON.stringify({
        type: "start",
        components: targetComponents,
        estimatedTime: estimatedTime,
      })}\n\n`,
    );

    const componentResults = [];
    let completedCount = 0;

    // Generate components sequentially (so frontend can render progressively)
    for (const compType of targetComponents) {
      try {
        console.log(`🔄 Generating ${compType}...`);

        // Send progress update
        res.write(
          `data: ${JSON.stringify({
            type: "progress",
            component: compType,
            progress: Math.round(
              (completedCount / targetComponents.length) * 100,
            ),
          })}\n\n`,
        );

        const compPrompt = createComponentPrompt(compType, prompt, theme);
        const result = await askDeepSeek(compPrompt, "designer");

        componentResults.push(result);
        completedCount++;

        // Send component immediately when ready
        res.write(
          `data: ${JSON.stringify({
            type: "component",
            data: result,
            index: completedCount - 1,
            progress: Math.round(
              (completedCount / targetComponents.length) * 100,
            ),
          })}\n\n`,
        );

        console.log(
          `✅ ${compType} complete (${completedCount}/${targetComponents.length})`,
        );
      } catch (error) {
        console.error(`❌ ${compType} xatolik:`, error.message);
        // Send error but continue with other components
        res.write(
          `data: ${JSON.stringify({
            type: "error",
            component: compType,
            error: error.message,
          })}\n\n`,
        );
      }
    }

    // Merge all components
    const mergedPage = mergeComponents(componentResults, theme, {
      promptLength: prompt.length,
      generationTime: ((Date.now() - startTime) / 1000).toFixed(2),
    });

    // Send final complete event
    res.write(
      `data: ${JSON.stringify({
        type: "complete",
        data: mergedPage,
        stats: {
          components: targetComponents.length,
          successful: componentResults.length,
          duration_seconds: parseFloat(
            ((Date.now() - startTime) / 1000).toFixed(2),
          ),
        },
      })}\n\n`,
    );

    res.end();

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Chunked generation complete: ${totalTime}s`);
  } catch (error) {
    console.error("❌ Chunked generation error:", error);
    res.write(
      `data: ${JSON.stringify({
        type: "error",
        error: error.message,
      })}\n\n`,
    );
    res.end();
  }
});

// ============ 3.5 ENDPOINT: FIGMA TO SITE ============
app.post("/figma-to-site", checkApiKey, async (req, res) => {
  const { figmaUrl, figmaToken } = req.body;
  if (!figmaUrl || !figmaToken) {
    return res
      .status(400)
      .json({ success: false, error: "Figma URL and Token are required" });
  }

  try {
    const {
      extractFigmaData,
      extractFileKey,
    } = require("./utils/figmaExtractor");
    const fileKey = extractFileKey(figmaUrl);
    if (!fileKey) {
      return res.status(400).json({
        success: false,
        error: "Invalid Figma URL. Make sure it contains file/ or design/",
      });
    }

    console.log(`[${req.id}] 🎨 Fetching Figma data for file: ${fileKey}`);
    const figmaData = await extractFigmaData(fileKey, figmaToken);

    const prompt = `Convert this Figma design into a website structure.
Figma File Name: ${figmaData.name}

EXTRACTED TEXT CONTENT (Use this as real text on the site):
${figmaData.text.join(" | ")}

DESIGN SYSTEM:
Colors: ${figmaData.colors.join(", ")}
Fonts: ${figmaData.fonts.join(", ")}

Return ONLY valid JSON matching this schema:
{
  "theme": { "primary": "hex", "background": "hex", "text": "hex" },
  "sections": [
    {
      "id": "section1",
      "type": "HeroMain",
      "content": { "title": "...", "subtitle": "..." },
      "styles": { "backgroundColor": "...", "color": "..." }
    }
  ]
}
Do not use Markdown.`;

    console.log(`[${req.id}] 🧠 Ask AI to generate site from Figma...`);
    const result = await askDeepSeek(prompt, "designer");

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error(`[${req.id}] ❌ Figma to Site Error:`, error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ 4. ENDPOINT: CACHE CLEAR ============

app.post("/clear-cache", checkApiKey, (req, res) => {
  const { clearCache } = require("./utils/fileManager");
  clearCache();
  res.json({ success: true, message: "Kesh tozalandi" });
});

const handleChatCompletions = async (req, res) => {
  const startTime = Date.now();
  const { messages, model, stream } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Messages array is required" });
  }

  // Extract the last message as the prompt
  const lastMessage = messages[messages.length - 1];
  const prompt = lastMessage.content;
  const role = "general";

  console.log(
    `[${req.id}] 🌐 AI Wrapper - Prompt: ${prompt.substring(0, 50)}...`,
  );

  try {
    if (stream) {
      console.warn(
        "Stream requested but not fully implemented. Returning static.",
      );
    }

    const result = await askDeepSeek(prompt, role);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    res.json({
      id: `chatcmpl-${req.id}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: model || "qwen3.5:9b",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content:
              typeof result === "string" ? result : JSON.stringify(result),
          },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: -1, completion_tokens: -1, total_tokens: -1 },
    });

    console.log(`[${req.id}] ✅ AI Wrapper - Done: ${duration}s`);
  } catch (error) {
    console.error(`[${req.id}] ❌ AI Wrapper Error:`, error.message);
    res.status(500).json({ error: error.message });
  }
};

// ============ V1 API ROUTER (OpenAI Compatible) ============
const v1Router = express.Router();

v1Router.use(checkApiKey);

v1Router.get("/models", (req, res) => {
  res.json({
    object: "list",
    data: [
      {
        id: process.env.MODEL_NAME || "qwen3.5:9b",
        object: "model",
        created: Math.floor(Date.now() / 1000),
        owned_by: "ollama",
      },
    ],
  });
});

v1Router.post("/chat/completions", handleChatCompletions);
v1Router.post("/responses", handleChatCompletions);
v1Router.post("/completions", handleChatCompletions);
v1Router.post("/chat", handleChatCompletions);
v1Router.post("/query", handleChatCompletions);

// 404 handler for V1
v1Router.use((req, res) => {
  console.warn(`[${req.id}] ❓ UNKNOWN V1 REQUEST: ${req.method} ${req.path}`);
  res.status(404).json({ error: `Path Not Found in V1: ${req.path}` });
});

app.use("/v1", v1Router);

// ============ ERROR HANDLING ============
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        success: false,
        error: `Fayl hajmi limitidan oshdi. Maksimum: ${config.MAX_ZIP_SIZE_MB}MB`,
      });
    }
  }
  next(err);
});

// ============ SERVER START ============
const PORT = process.env.PORT || 7777;
const server = app.listen(PORT, () => {
  console.log(`🔥 LocalAI Server v2.0 ishga tushdi: http://localhost:${PORT}`);
  console.log(`📊 Konfiguratsiya:`);
  console.log(`   - Maks ZIP hajmi: ${config.MAX_ZIP_SIZE_MB}MB`);
  console.log(`   - Chunk hajmi: ${config.CHUNK_SIZE_CHARS} belgi`);
  console.log(`   - AI concurrency: ${config.AI_CONCURRENCY}`);
  console.log(
    `   - Kesh: ${config.ENABLE_CACHING ? "YOQILGAN" : "O'CHIRILGAN"}`,
  );
});

server.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    console.error(
      `❌ Port ${PORT} band! Iltimos, boshqa port ishlating yoki eski jarayonni to'xtating.`,
    );
  } else {
    console.error("❌ Server xatoligi:", e);
  }
});
