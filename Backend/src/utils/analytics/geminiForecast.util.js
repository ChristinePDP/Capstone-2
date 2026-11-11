const PRIMARY_GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const DEFAULT_FALLBACK_MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-flash-lite-latest",
];
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const DEFAULT_TIMEOUT_MS = 55000;
const RETRY_DELAY_MS = 2000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function buildModelCandidates() {
  const configuredFallbacks = process.env.GEMINI_FALLBACK_MODELS
    ? process.env.GEMINI_FALLBACK_MODELS.split(",").map((m) => m.trim()).filter(Boolean)
    : DEFAULT_FALLBACK_MODELS;

  const unique = [];
  for (const model of [PRIMARY_GEMINI_MODEL, ...configuredFallbacks]) {
    if (model && !unique.includes(model)) unique.push(model);
  }
  return unique;
}

function buildGeminiUrl(model) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

function isRetryableStatus(status) {
  return status === 500 || status === 502 || status === 503 || status === 504;
}

function isFallbackEligibleStatus(status) {
  // Do NOT fall back across models on 429 rate-limit/quota errors so
  // upstream cooldown guards stay effective, or on 401/403 key errors.
  return status === 404 || isRetryableStatus(status);
}

function parseJsonResponse(rawText) {
  try {
    return JSON.parse(rawText);
  } catch {
    const cleaned = rawText.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned);
  }
}

async function requestGeminiModel({ model, body, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${buildGeminiUrl(model)}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      const err = new Error(`Gemini API error ${res.status} (${model}): ${errText}`);
      err.status = res.status;
      throw err;
    }

    const data = await res.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      const err = new Error(`Gemini returned an empty response (${model})`);
      err.retryable = true;
      throw err;
    }

    return parseJsonResponse(rawText);
  } catch (err) {
    if (err.name === "AbortError") {
      const timeoutErr = new Error(`Gemini timeout after ${Math.round(timeoutMs / 1000)}s (${model})`);
      timeoutErr.retryable = true;
      throw timeoutErr;
    }
    if (!err.status && err.retryable === undefined) {
      err.retryable = true; // network/JSON glitch
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Calls Gemini with a system prompt + user prompt and forces JSON output.
 * Retries transient 5xx/503/network errors and falls back to alternate models
 * when a model is temporarily unavailable (503) or missing (404), while
 * failing fast on 429 quota limits so upstream cooldown guards work cleanly.
 *
 * @param {Object} params
 * @param {string} params.systemPrompt - Role/instructions + required JSON schema.
 * @param {string} params.userPrompt   - The actual data + task for this request.
 * @param {number} [params.temperature=0.4]
 * @param {Object} [params.responseSchema]
 * @param {number} [params.maxOutputTokens]
 * @param {number} [params.timeoutMs=55000]
 * @returns {Promise<Object>} Parsed JSON object returned by Gemini.
 */
async function callGeminiJSON({
  systemPrompt,
  userPrompt,
  temperature = 0.4,
  responseSchema,
  maxOutputTokens,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set in the environment");
  }

  const generationConfig = {
    temperature,
    responseMimeType: "application/json",
  };
  if (responseSchema) generationConfig.responseSchema = responseSchema;
  if (Number.isFinite(maxOutputTokens) && maxOutputTokens > 0) {
    generationConfig.maxOutputTokens = maxOutputTokens;
  }

  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    generationConfig,
  };

  const models = buildModelCandidates();
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    const maxAttempts = i === 0 ? 2 : 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const remaining = deadline - Date.now();
      if (remaining <= 1000) {
        throw lastError || new Error(`Gemini request timed out after ${Math.round(timeoutMs / 1000)}s`);
      }

      try {
        return await requestGeminiModel({
          model,
          body,
          timeoutMs: Math.min(25000, remaining),
        });
      } catch (err) {
        lastError = err;
        const canRetrySameModel = attempt < maxAttempts && (err.retryable || isRetryableStatus(err.status));
        if (canRetrySameModel) {
          const wait = Math.min(RETRY_DELAY_MS, Math.max(0, deadline - Date.now() - 1000));
          if (wait > 0) await sleep(wait);
          continue;
        }

        const canTryFallback = i < models.length - 1 && (err.retryable || isFallbackEligibleStatus(err.status));
        if (canTryFallback) {
          console.warn(`[Gemini] ${model} failed (${err.message}); falling back to ${models[i + 1]}.`);
          break;
        }

        throw err;
      }
    }
  }

  throw lastError || new Error("Gemini API call failed");
}

export { callGeminiJSON };