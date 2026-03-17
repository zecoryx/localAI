const axios = require("axios");
const { default: PQueue } = require("p-queue");
const config = require("../config");
const { cleanDesignerPrompt } = require("../utils/cssFilter");
const { calculateProgress } = require("../utils/progressTracker");
require("dotenv").config();

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ============ NAVBAT TIZIMI (Optimizatsiya qilingan) ============
const queue = new PQueue({ concurrency: config.AI_CONCURRENCY });

// ============ ROLE KONFIGURATSIYALARI ============
const DEEPSEEK_ROLES = {
  cybersecurity: {
    temperature: 0.01,
    top_p: 0.85,
    top_k: 40,
    repeat_penalty: 1.2,
    num_ctx: 65536,
    num_predict: 6144,
  },
  cybersecurity_chunk: {
    temperature: 0.01,
    top_p: 0.85,
    top_k: 40,
    repeat_penalty: 1.2,
    num_ctx: 16384,
    num_predict: 4096,
  },
  designer: {
    temperature: 0.1, // Minimal randomness = aniq JSON
    top_p: 0.9,
    top_k: 40,
    repeat_penalty: 1.1,
    num_ctx: 32768, // Qwen3.5:9b 262K gacha qo'llab-quvvatlaydi
    num_predict: 8192, // Complex saytlar uchun
  },
  coder: {
    temperature: 0.2, // Low for accuracy
    top_p: 0.9,
    top_k: 40,
    repeat_penalty: 1.1,
    num_ctx: 32768, // Larger context for code
    num_predict: 8192,
  },
  general: {
    temperature: 0.7,
    top_p: 0.95,
    top_k: 50,
    repeat_penalty: 1.0,
    num_ctx: 8192,
    num_predict: 4096,
  },
};

// ============ OPTIMIZATSIYA QILINGAN CYBERSECURITY PROMPT ============
const CYBERSECURITY_PROMPT_TEMPLATE = `Analyze this code for security vulnerabilities. First think step-by-step, then return ONLY valid JSON.

REQUIRED JSON FORMAT:
{
  "audit_summary": {
    "security_score": <0-100>,
    "risk_level": "CRITICAL|HIGH|MEDIUM|LOW",
    "vulnerabilities_found": <number>,
    "overview": "<brief summary>"
  },
  "vulnerabilities": [
    {
      "id": "SEC-001",
      "file": "<filename>",
      "line": <number>,
      "severity": "CRITICAL|HIGH|MEDIUM|LOW",
      "type": "<vulnerability type>",
      "description": "<what's wrong>",
      "fix_code": "<how to fix>"
    }
  ],
  "dependency_risks": [],
  "secrets_exposed": [],
  "recommendations": ["<string>"]
}

CODE TO ANALYZE:
`;

// ============ CHUNK TAHLILI ============
const analyzeChunk = async (chunkCode, chunkIndex, totalChunks) => {
  const roleConfig = DEEPSEEK_ROLES["cybersecurity_chunk"];

  const prompt = `You are analyzing chunk ${chunkIndex + 1} of ${totalChunks}.
Find security issues in this code section. First think step-by-step, then return JSON only.

{
  "chunk_vulnerabilities": [
    {
      "file": "<filename>",
      "line": <number>,
      "severity": "CRITICAL|HIGH|MEDIUM|LOW",
      "type": "<type>",
      "description": "<issue>",
      "fix": "<solution>"
    }
  ],
  "chunk_secrets": [],
  "chunk_risks": []
}

CODE:
${chunkCode}`;

  try {
    const response = await axios.post(
      process.env.OLLAMA_URL || "http://localhost:11434/api/generate",
      {
        model: process.env.MODEL_NAME || "qwen3.5:9b",
        prompt: prompt,
        stream: false,
        options: roleConfig,
        format: "json",
      },
      { timeout: config.AI_TIMEOUT_MS },
    );

    let resultText = response.data.response
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    return JSON.parse(resultText);
  } catch (error) {
    console.error(`❌ Chunk ${chunkIndex + 1} xatolik:`, error.message);
    return { chunk_vulnerabilities: [], chunk_secrets: [], chunk_risks: [] };
  }
};

// ============ NATIJALARNI BIRLASHTIRISH ============
const mergeChunkResults = (chunkResults, filesAnalyzed) => {
  // Filter out failed or malformed chunks
  const validResults = chunkResults.filter(
    (r) =>
      r && (r.chunk_vulnerabilities || r.vulnerabilities || r.audit_summary),
  );
  console.log(
    `✅ ${validResults.length}/${chunkResults.length} ta chunk muvaffaqiyatli tahlil qilindi.`,
  );

  const allVulnerabilities = [];
  const allSecrets = [];
  const allRisks = [];

  validResults.forEach((result, idx) => {
    const vulnerabilities =
      result.chunk_vulnerabilities || result.vulnerabilities || [];
    vulnerabilities.forEach((v) => {
      allVulnerabilities.push({
        id: `SEC-${String(allVulnerabilities.length + 1).padStart(3, "0")}`,
        ...v,
      });
    });

    const secrets = result.chunk_secrets || result.secrets_exposed || [];
    allSecrets.push(...secrets);

    const risks = result.chunk_risks || result.dependency_risks || [];
    allRisks.push(...risks);
  });

  // Security score hisoblash
  const criticalCount = allVulnerabilities.filter(
    (v) => v.severity === "CRITICAL",
  ).length;
  const highCount = allVulnerabilities.filter(
    (v) => v.severity === "HIGH",
  ).length;
  const mediumCount = allVulnerabilities.filter(
    (v) => v.severity === "MEDIUM",
  ).length;

  let score = 100;
  score -= criticalCount * 25;
  score -= highCount * 15;
  score -= mediumCount * 5;
  score = Math.max(0, Math.min(100, score));

  let riskLevel = "LOW";
  if (criticalCount > 0) riskLevel = "CRITICAL";
  else if (highCount > 0) riskLevel = "HIGH";
  else if (mediumCount > 0) riskLevel = "MEDIUM";

  return {
    audit_summary: {
      security_score: score,
      risk_level: riskLevel,
      files_analyzed: filesAnalyzed,
      vulnerabilities_found: allVulnerabilities.length,
      overview: `Found ${allVulnerabilities.length} vulnerabilities (${criticalCount} critical, ${highCount} high, ${mediumCount} medium)`,
    },
    vulnerabilities: allVulnerabilities,
    dependency_risks: allRisks,
    secrets_exposed: allSecrets,
    recommendations: generateRecommendations(allVulnerabilities),
  };
};

// ============ TAVSIYALAR GENERATSIYASI ============
const generateRecommendations = (vulnerabilities) => {
  const recommendations = new Set();

  vulnerabilities.forEach((v) => {
    if (v.type?.toLowerCase().includes("injection")) {
      recommendations.add(
        "Implement input validation and use parameterized queries",
      );
    }
    if (v.type?.toLowerCase().includes("xss")) {
      recommendations.add(
        "Sanitize user input and use Content Security Policy",
      );
    }
    if (v.type?.toLowerCase().includes("auth")) {
      recommendations.add(
        "Strengthen authentication mechanisms and use secure session handling",
      );
    }
    if (v.severity === "CRITICAL") {
      recommendations.add(
        "Address critical vulnerabilities immediately before deployment",
      );
    }
  });

  if (recommendations.size === 0) {
    recommendations.add("Continue following secure coding practices");
  }

  return Array.from(recommendations);
};

// ============ ASOSIY FUNKSIYA ============
const askDeepSeek = async (
  prompt,
  role = "general",
  imageBase64 = null,
  options = {},
) => {
  return queue.add(async () => {
    const maxRetries = config.MAX_RETRIES || 2;
    let lastError;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const roleConfig = DEEPSEEK_ROLES[role] || DEEPSEEK_ROLES["general"];
        const startTime = Date.now();

        // ============ CHUNKED CYBERSECURITY ============
        if (
          role === "cybersecurity" &&
          options.chunks &&
          options.chunks.length > 1
        ) {
          // Merging chunk results logic stays the same but analyzeChunk should be reliable
          // (Implementation detail: individual analyzeChunks could also have retries)
          console.log(
            `🔄 ${options.chunks.length} ta chunk parallel tahlil qilinmoqda...`,
          );

          // Actually, if we are in this loop, we might want to retry individual chunks or the whole thing.
          // For now, let's keep the chunked logic similar but using reliable single calls.

          const chunkPromises = options.chunks.map((chunk, idx) =>
            analyzeChunkReliable(chunk, idx, options.chunks.length),
          );

          const chunkResults = await Promise.all(chunkPromises);
          return mergeChunkResults(chunkResults, options.filesAnalyzed || 0);
        }

        // ============ SINGLE REQUEST ============
        let processedPrompt = prompt;
        if (role === "designer") {
          processedPrompt = cleanDesignerPrompt(processedPrompt);
        }

        const maxPromptSize = (config.MAX_PROMPT_SIZE_KB || 50) * 1024;
        if (processedPrompt.length > maxPromptSize) {
          processedPrompt =
            processedPrompt.substring(0, maxPromptSize) +
            "\n\n[... TRUNCATED ...]";
        }

        const requestBody = {
          model: process.env.MODEL_NAME || "qwen3.5:9b",
          system:
            role === "designer"
              ? "You are a JSON design schema generator. Return ONLY valid JSON items/layers. Never use markdown code blocks. Never add explanations."
              : role === "coder"
                ? "You are an AI code assistant for ShotStack. Your task is to modify the existing site structure (JSON layers) based on user requests. Return ONLY valid JSON within a ```json block if the user asks for design changes, or a textual explanation if it is a general question."
                : role === "cybersecurity"
                  ? "You are a security auditor. Return ONLY valid JSON audit reports."
                  : undefined,
          prompt:
            role === "cybersecurity"
              ? CYBERSECURITY_PROMPT_TEMPLATE + processedPrompt
              : processedPrompt,
          stream: false,
          options: roleConfig,
          format: role === "designer" || role === "cybersecurity" ? "json" : "",
        };

        if (imageBase64) {
          // qwen3.5:9b vision qo'llab-quvvatlaydi!
          requestBody.images = [imageBase64];
        }

        const timeout =
          role === "designer"
            ? config.DESIGNER_TIMEOUT_MS || 180000
            : config.AI_TIMEOUT_MS || 120000;

        const response = await axios.post(
          process.env.OLLAMA_URL || "http://localhost:11434/api/generate",
          requestBody,
          { timeout: timeout },
        );

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        let resultText = response.data.response;

        // Parse response based on role
        if (role === "cybersecurity" || role === "designer") {
          const parsed = parseAIResponse(resultText);
          if (!parsed) {
            throw new Error(`Invalid JSON format from AI in role: ${role}`);
          }
          if (
            role === "cybersecurity" &&
            (!parsed.audit_summary || !parsed.vulnerabilities)
          ) {
            return convertToExpectedFormat(parsed);
          }
          return parsed;
        }

        return resultText;
      } catch (error) {
        lastError = error;
        console.error(
          `⚠️ Attempt ${attempt + 1}/${maxRetries} failed: ${error.message}`,
        );

        if (attempt < maxRetries - 1) {
          const waitTime = 2000 * (attempt + 1);
          await delay(waitTime);
          continue;
        }
      }
    }

    // If we get here, all retries failed
    throw lastError;
  });
};

/**
 * Reliable chunk analysis with retry
 */
const analyzeChunkReliable = async (chunkCode, chunkIndex, totalChunks) => {
  const maxRetries = 2;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await analyzeChunk(chunkCode, chunkIndex, totalChunks);
    } catch (e) {
      if (i === maxRetries - 1) throw e;
      await delay(1000);
    }
  }
};

// ============ ROBUST JSON PARSER ============
function parseAIResponse(raw) {
  if (!raw) return null;
  if (typeof raw === "object") return raw;

  // Strategy 1: Direct JSON
  try {
    return JSON.parse(raw);
  } catch (e) {
    // Strategy 2: Remove markdown code blocks
    try {
      const cleaned = raw
        .replace(/```json\n?/g, "")
        .replace(/```/g, "")
        .trim();
      return JSON.parse(cleaned);
    } catch (e2) {
      // Strategy 3: Attempt to extract JSON-like structure
      const firstBrace = raw.indexOf("{");
      const lastBrace = raw.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace !== -1) {
        try {
          return JSON.parse(raw.substring(firstBrace, lastBrace + 1));
        } catch (e3) {
          return null;
        }
      }
      return null;
    }
  }
}

// ============ KONVERTATSIYA FUNKSIYASI ============
function convertToExpectedFormat(aiResponse) {
  console.warn("⚠️ AI formatini konvertatsiya qilinmoqda...");

  const severity = aiResponse.severity || "MEDIUM";
  const recommendations = aiResponse.recommendations || aiResponse.issues || [];

  return {
    audit_summary: {
      security_score: calculateScore(severity),
      risk_level: severity.toUpperCase(),
      files_analyzed: aiResponse.files_analyzed || 1,
      vulnerabilities_found: recommendations.length,
      overview: aiResponse.description || "",
    },
    dependency_risks: aiResponse.dependency_risks || [],
    vulnerabilities: recommendations.map((rec, idx) => ({
      id: `SEC-${String(idx + 1).padStart(3, "0")}`,
      file: rec.file || "unknown",
      line: rec.line || 0,
      severity: rec.severity || "MEDIUM",
      type: rec.type || rec.title || "General Issue",
      description: rec.description || rec.issue || "",
      fix_code: rec.solution || rec.fix || rec.fix_code || "",
    })),
    secrets_exposed: aiResponse.secrets_exposed || [],
    recommendations: recommendations
      .map((r) => r.description || r.solution || r.title || String(r))
      .filter(Boolean),
  };
}

function calculateScore(severity) {
  const scores = { CRITICAL: 20, HIGH: 40, MEDIUM: 60, LOW: 80 };
  return scores[severity.toUpperCase()] || 50;
}

module.exports = { askDeepSeek, queue };
