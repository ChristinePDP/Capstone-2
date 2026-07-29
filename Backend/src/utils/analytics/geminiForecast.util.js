const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-flash-lite-latest";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

/**
 * Calls Gemini with a system prompt + user prompt and forces JSON output.
 * Throws on any failure so the caller (service layer) can decide on
 * cache-fallback behavior.
 *
 * @param {Object} params
 * @param {string} params.systemPrompt - Role/instructions + required JSON schema.
 * @param {string} params.userPrompt   - The actual data + task for this request.
 * @param {number} [params.temperature=0.4]
 * @returns {Promise<Object>} Parsed JSON object returned by Gemini.
 */
async function callGeminiJSON({ systemPrompt, userPrompt, temperature = 0.4 }) {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set in the environment");
  }

  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    generationConfig: {
      temperature,
      responseMimeType: "application/json",
    },
  };

  const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Gemini API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!rawText) {
    throw new Error("Gemini returned an empty response");
  }

  try {
    return JSON.parse(rawText);
  } catch (e) {
    const cleaned = rawText.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned);
  }
}

export { callGeminiJSON };