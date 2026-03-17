// LocalAI Configuration
// Performance va limit sozlamalari

module.exports = {
  // ============ FILE LIMITS ============
  MAX_ZIP_SIZE_MB: 50, // Maksimal ZIP hajmi (MB)
  MAX_FILE_SIZE_KB: 500, // Har bir fayl uchun limit (KB)
  MAX_TOTAL_CODE_SIZE_KB: 8000, // Jami kod hajmi limiti (KB)

  // ============ PROCESSING ============
  CHUNK_SIZE_CHARS: 100000, // AI ga yuboriladigan chunk hajmi
  ENABLE_CACHING: true, // Kesh tizimini yoqish
  CACHE_TTL_MINUTES: 30, // Kesh muddati (minutlarda)

  // ============ AI SETTINGS ============
  AI_CONCURRENCY: 2, // Parallel AI so'rovlar soni
  AI_TIMEOUT_MS: 120000, // Default AI timeout (120 soniya)
  DESIGNER_TIMEOUT_MS: 240000, // Designer uchun timeout (240 soniya / 4 minut)
  MAX_PROMPT_SIZE_KB: 200, // Maksimal prompt hajmi (200KB)
  MAX_RETRIES: 3, // AI so'rovlari uchun retrylar soni

  // ============ MONITORING & SSE ============
  SSE_PROGRESS_INTERVAL_MS: 500, // SSE progress yangilanish intervali
  CACHE_SIZE_LIMIT: 150, // Keshtagi maksimal elementlar soni
  CACHE_TTL_MS: 3600000, // Kesh TTL (1 soat)

  // ============ FILE PRIORITIES ============
  // Muhim fayllar - birinchi navbatda
  CRITICAL_PATTERNS: [
    "/auth",
    "/api/",
    "/config/",
    ".env",
    "security",
    "/middleware/",
    "/routes/",
    "password",
    "token",
    "/controllers/",
    "/services/",
    "database",
    "db.",
    "login",
    "session",
    "jwt",
    "oauth",
    "crypto",
  ],

  // O'tkazib yuboriladigan fayllar
  SKIP_PATTERNS: [
    "/test/",
    "/tests/",
    "/__tests__/",
    "/spec/",
    "/docs/",
    "/documentation/",
    "/examples/",
    "/build/",
    "/dist/",
    "/coverage/",
    "/mock/",
    "/mocks/",
    "/fixtures/",
    ".test.",
    ".spec.",
    ".stories.",
    "/node_modules/",
    "/.git/",
    "/public/",
    "/static/",
    "/assets/",
  ],

  // ============ FILE EXTENSIONS ============
  ALLOWED_EXTENSIONS: [
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".py",
    ".php",
    ".java",
    ".go",
    ".rb",
    ".rs",
    ".html",
    ".css",
    ".json",
    ".sql",
    ".env",
    ".yaml",
    ".yml",
    ".xml",
    ".md",
  ],

  // Muhim kengaytmalar (yuqori prioritet)
  PRIORITY_EXTENSIONS: [
    ".js",
    ".ts",
    ".py",
    ".php",
    ".java",
    ".go",
    ".env",
    ".json",
    ".yaml",
    ".yml",
    ".sql",
  ],
};
